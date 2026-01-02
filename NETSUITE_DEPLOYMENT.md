# NetSuite RESTlet Deployment Guide

Step-by-step instructions for deploying the Marcone PDF Receiver RESTlet.

## Prerequisites

- [ ] Administrator access to NetSuite
- [ ] `netsuite_marcone_pdf_receiver_restlet.js` file ready

## Step-by-Step Deployment

### 1. Create File Cabinet Folders

#### Navigate to File Cabinet
1. Go to **Documents > Files > File Cabinet**
2. Select **SuiteScripts** folder (or create if doesn't exist)

#### Create Folder Structure
Create these 4 folders:

```
SuiteScripts/
└── Marcone/
    ├── PDFs_Unprocessed/
    ├── PDFs_Processed/
    ├── JSON_Unprocessed/
    └── JSON_Processed/
```

#### Get Folder Internal IDs
For each folder:
1. Click on the folder name
2. Look at the URL: `...&id=12345...`
3. Note the ID number

**Record here:**
- PDFs_Unprocessed ID: `_____________`
- JSON_Unprocessed ID: `_____________`
- PDFs_Processed ID: `_____________`
- JSON_Processed ID: `_____________`

---

### 2. Create Integration Record

#### Navigate to Integrations
1. Go to **Setup > Integration > Manage Integrations**
2. Click **New**

#### Fill in Integration Details
```
Name: Marcone Email Processor
Description: Integration for automated Marcone credit memo processing
State: Enabled

Authentication:
☑ Token-Based Authentication
☐ TBA: Authorization Flow
☐ User Credentials
```

#### Save and Record Credentials
After saving, NetSuite will show:

```
Consumer Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Consumer Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

⚠️ **CRITICAL**: Copy these immediately - they won't be shown again!

**Record here:**
- Consumer Key: `_____________________________________________`
- Consumer Secret: `_____________________________________________`

---

### 3. Create Access Token

#### Navigate to Access Tokens
1. Go to **Setup > Users/Roles > Access Tokens**
2. Click **New**

#### Fill in Token Details
```
Application Name: [Select "Marcone Email Processor" from dropdown]
User: [Select your admin user]
Role: [Select role with File Cabinet access - typically Administrator]
Token Name: Marcone Processor Token (optional)
```

#### Save and Record Credentials
After saving, NetSuite will show:

```
Token ID: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Token Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

⚠️ **CRITICAL**: Copy these immediately - they won't be shown again!

**Record here:**
- Token ID: `_____________________________________________`
- Token Secret: `_____________________________________________`

---

### 4. Upload RESTlet Script

#### Navigate to File Cabinet
1. Go to **Documents > Files > File Cabinet**
2. Navigate to **SuiteScripts** folder (or create it)

#### Upload Script File
1. Click **Add File**
2. Choose File: `netsuite_marcone_pdf_receiver_restlet.js`
3. Folder: Select **SuiteScripts**
4. Name: `marcone_pdf_receiver_restlet.js` (optional rename)
5. **Save**

---

### 5. Create Script Record

#### Navigate to Scripts
1. Go to **Customization > Scripting > Scripts**
2. Click **New**

#### Select Script File
1. In the file selector, find your uploaded script:
   - Filter by "marcone" or navigate to SuiteScripts folder
2. Click on `marcone_pdf_receiver_restlet.js`
3. Click **Create Script Record**

#### Configure Script Settings

##### Name Tab
```
ID: customscript_marcone_pdf_receiver
Name: Marcone PDF Receiver RESTlet
```

##### Parameters Tab
Add two script parameters:

**Parameter 1:**
```
ID: custscript_marcone_pdf_folder
Type: List/Record
List/Record Type: Folder
Display Type: Normal
Description: Folder for unprocessed PDFs
Default Value: [Select PDFs_Unprocessed folder]
```

**Parameter 2:**
```
ID: custscript_marcone_json_folder
Type: List/Record
List/Record Type: Folder
Display Type: Normal
Description: Folder for unprocessed JSON files
Default Value: [Select JSON_Unprocessed folder]
```

##### Execution Tab
```
Status: Testing (change to Released after validation)
```

#### Save Script

---

### 6. Deploy Script

#### Create Deployment
1. On the script record page, click **Deploy Script**
2. Or go to **Customization > Scripting > Script Deployments > New**

#### Configure Deployment

```
Title: Marcone PDF Receiver Production
ID: customdeploy_marcone_pdf_receiver
Status: Testing (change to Released when ready)

Audience Tab:
☑ All Roles (or restrict to specific roles for security)

Parameters Tab:
- PDF Folder: [Should auto-fill with PDFs_Unprocessed]
- JSON Folder: [Should auto-fill with JSON_Unprocessed]
```

#### Save Deployment

---

### 7. Get RESTlet URL

After deploying, the RESTlet URL will be displayed:

```
External URL:
https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=123&deploy=1
```

**Record here:**
- RESTlet URL: `_____________________________________________`
- Account ID (from URL): `_____________`

---

### 8. Test RESTlet

#### Test GET Endpoint (Health Check)

Use Postman or curl to test:

```bash
curl "YOUR_RESTLET_URL" \
  -H "Authorization: OAuth realm=\"YOUR_ACCOUNT_ID\", oauth_consumer_key=\"YOUR_CONSUMER_KEY\", oauth_token=\"YOUR_TOKEN_ID\", oauth_signature_method=\"HMAC-SHA256\", oauth_timestamp=\"TIMESTAMP\", oauth_nonce=\"NONCE\", oauth_version=\"1.0\", oauth_signature=\"SIGNATURE\""
```

Expected response:
```json
{
  "status": "active",
  "scriptId": "customscript_marcone_pdf_receiver",
  "deploymentId": "customdeploy_marcone_pdf_receiver",
  "configuration": {
    "pdfFolder": "12345",
    "jsonFolder": "12346"
  }
}
```

✅ If you see this, RESTlet is working!

---

## Configuration Summary

After completing all steps, you should have:

```
NetSuite Account ID: _______________

Integration Record:
- Consumer Key: _____________________
- Consumer Secret: __________________

Access Token:
- Token ID: _________________________
- Token Secret: _____________________

RESTlet:
- URL: ______________________________
- Script ID: customscript_marcone_pdf_receiver
- Deployment ID: customdeploy_marcone_pdf_receiver

Folders:
- PDFs_Unprocessed: _________________
- JSON_Unprocessed: _________________
- PDFs_Processed: ___________________
- JSON_Processed: ___________________
```

---

## Next Steps

1. ✅ RESTlet deployed
2. ⏸️ Update Node.js `.env` file with credentials
3. ⏸️ Test upload from Node.js
4. ⏸️ Switch Status to "Released" when ready
5. ⏸️ Create Scheduled Script to process uploaded files

---

## Common Issues

### "Invalid login attempt"
**Problem**: OAuth credentials incorrect
**Solution**: Double-check all 4 credentials (Consumer Key/Secret, Token ID/Secret)

### "Script not found"
**Problem**: RESTlet URL incorrect or deployment not active
**Solution**: Verify deployment status is "Testing" or "Released"

### "Insufficient permissions"
**Problem**: Access Token role doesn't have File Cabinet access
**Solution**: Recreate token with Administrator role or custom role with file permissions

### "Folder not found"
**Problem**: Script parameters pointing to wrong folder IDs
**Solution**: Update deployment parameters with correct folder IDs

---

## Security Best Practices

1. ✓ Use Testing status until fully validated
2. ✓ Restrict audience to specific roles (not "All Roles")
3. ✓ Rotate credentials every 90 days
4. ✓ Monitor Script Execution Log regularly
5. ✓ Create separate Integration/Token for production vs testing
6. ✓ Never share credentials in email or chat

---

## Script Execution Log

To monitor RESTlet activity:

1. Go to **Customization > Scripting > Script Execution Log**
2. Filter by:
   - Script: `Marcone PDF Receiver RESTlet`
   - Type: `RESTlet`
3. Look for:
   - ✅ Successful uploads: "Files uploaded successfully"
   - ❌ Errors: Check error details and adjust accordingly

---

## Support

If you encounter issues during deployment:

1. Check NetSuite Script Execution Log first
2. Verify all folder IDs are correct
3. Test OAuth credentials with a simple GET request
4. Ensure Integration Record is "Enabled"
5. Verify Access Token hasn't expired
