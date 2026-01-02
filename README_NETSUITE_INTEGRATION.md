# Marcone Email PDF Processor - NetSuite Integration

Complete integration between Node.js email processor and NetSuite for automated Marcone credit memo processing.

## Architecture Overview

```
┌─────────────────────┐
│   Email Server      │
│  (Rackspace IMAP)   │
└──────────┬──────────┘
           │ Node.js polls for new emails
           ▼
┌─────────────────────┐
│  email-poller.js    │
│  (Node.js App)      │
│  - Downloads PDFs   │
│  - Calls Claude API │
│  - Extracts data    │
└──────────┬──────────┘
           │ HTTPS POST (OAuth)
           ▼
┌─────────────────────┐
│  NetSuite RESTlet   │
│  - Receives files   │
│  - Saves to File    │
│    Cabinet          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Scheduled Script   │
│  - Finds new files  │
│  - Creates journal  │
│    entries / vendor │
│    credits          │
└─────────────────────┘
```

## Setup Instructions

### Part 1: NetSuite Configuration

#### Step 1: Create File Cabinet Folders

1. **Navigate**: Documents > Files > File Cabinet
2. **Create Folders**:
   - `Marcone_PDFs_Unprocessed` (for incoming PDFs)
   - `Marcone_JSON_Unprocessed` (for extracted data)
   - `Marcone_PDFs_Processed` (for completed PDFs)
   - `Marcone_JSON_Processed` (for completed JSON)
3. **Note the Internal IDs** for each folder (you'll need these)

#### Step 2: Create Integration Record

1. **Navigate**: Setup > Integration > Manage Integrations > New
2. **Fill in**:
   - Name: `Marcone Email Processor`
   - State: `Enabled`
   - Token-Based Authentication: `✓ Checked`
   - TBA: Authorization Flow: `✗ Unchecked`
3. **Save** and **note**:
   - Consumer Key
   - Consumer Secret

#### Step 3: Create Access Token

1. **Navigate**: Setup > Users/Roles > Access Tokens > New
2. **Fill in**:
   - Application Name: Select `Marcone Email Processor`
   - User: Select admin user
   - Role: Select appropriate role with File Cabinet access
3. **Save** and **note**:
   - Token ID
   - Token Secret

⚠️ **IMPORTANT**: Save these credentials immediately - they won't be shown again!

#### Step 4: Upload and Deploy RESTlet

1. **Upload Script**:
   - Navigate: Documents > Files > SuiteScripts
   - Upload: `netsuite_marcone_pdf_receiver_restlet.js`

2. **Create Script Record**:
   - Navigate: Customization > Scripting > Scripts > New
   - Select uploaded file
   - Click Create Script Record

3. **Configure Script Parameters**:
   - `custscript_marcone_pdf_folder`: [Unprocessed PDF folder ID]
   - `custscript_marcone_json_folder`: [Unprocessed JSON folder ID]

4. **Deploy Script**:
   - Click Deploy Script
   - Title: `Marcone PDF Receiver`
   - Status: `Testing` (change to Released when ready)
   - **Copy the RESTlet URL** - you'll need this for Node.js

RESTlet URL format:
```
https://ACCOUNT_ID.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=XXX&deploy=1
```

### Part 2: Node.js Configuration

#### Step 1: Update .env File

Add NetSuite credentials to `/email-pdf-processor/.env`:

```env
# NetSuite Integration (RESTlet)
NETSUITE_ENABLED=true

# RESTlet URL from Step 4 above
NETSUITE_RESTLET_URL=https://ACCOUNT_ID.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=XXX&deploy=1

# Your NetSuite Account ID (e.g., 1234567)
NETSUITE_ACCOUNT_ID=1234567

# From Integration Record (Step 2)
NETSUITE_CONSUMER_KEY=your_consumer_key_here
NETSUITE_CONSUMER_SECRET=your_consumer_secret_here

# From Access Token (Step 3)
NETSUITE_TOKEN_ID=your_token_id_here
NETSUITE_TOKEN_SECRET=your_token_secret_here
```

#### Step 2: Test Connection

```bash
cd email-pdf-processor
node email-poller.js
```

If configured correctly, you should see:
- ✓ Email connection established
- ✓ PDFs downloaded
- ✓ Claude processing complete
- ✓ Uploaded to NetSuite successfully

### Part 3: Production Deployment

#### Option A: Railway (Recommended)

1. **Create Railway Account**: https://railway.app/
2. **Create New Project** from GitHub repo
3. **Add Environment Variables**:
   - Copy all variables from `.env`
   - Railway Dashboard > Variables > Add all
4. **Deploy**: Railway auto-deploys on git push

#### Option B: Local/Server

Keep running on local machine or company server:
```bash
# Run in background (Linux/Mac)
nohup node email-poller.js > email-poller.log 2>&1 &

# Or use PM2 for better management
npm install -g pm2
pm2 start email-poller.js --name marcone-processor
pm2 save
pm2 startup
```

## Testing

### Test 1: RESTlet Health Check

```bash
curl "https://ACCOUNT_ID.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=XXX&deploy=1" \
  -H "Authorization: YOUR_OAUTH_HEADER"
```

Expected response:
```json
{
  "status": "active",
  "configuration": {
    "pdfFolder": "12345",
    "jsonFolder": "12346"
  }
}
```

### Test 2: Process One Email

1. Set `SEARCH_CRITERIA=ALL` in .env (temporarily)
2. Run: `node email-poller.js`
3. Check NetSuite File Cabinet for uploaded files
4. Set `SEARCH_CRITERIA=UNSEEN` when done testing

### Test 3: Verify Claude Extraction

Check saved JSON files for correct data:
- ✓ isCreditMemo: true/false
- ✓ invoiceNumber: 8 digits
- ✓ NARDA values: Valid patterns only
- ✓ Bill numbers: N/W + 7-8 digits
- ✓ Sales orders: Full SOASER prefix

## Troubleshooting

### "Authentication failed" from NetSuite

**Problem**: OAuth credentials incorrect
**Solution**: Verify all 4 credentials in .env match NetSuite exactly

### "Folder not found" error

**Problem**: Folder IDs don't match
**Solution**: Get correct folder IDs from NetSuite File Cabinet

### "No emails found"

**Problem**: All emails already marked as read
**Solution**: 
- Check `SEARCH_CRITERIA=UNSEEN` in .env
- Or temporarily use `SEARCH_CRITERIA=ALL` for testing

### Claude API rate limits

**Problem**: Processing too many PDFs too fast
**Solution**: 
- Adjust `POLL_INTERVAL_MS` in .env (increase to 300000 = 5 minutes)
- Claude Haiku model has generous limits (used in current config)

## File Locations

```
email-pdf-processor/
├── email-poller.js                              # Main Node.js application
├── .env                                          # Configuration (DO NOT COMMIT)
├── netsuite_marcone_pdf_receiver_restlet.js     # NetSuite RESTlet
├── processed-pdfs/                               # Local PDF storage (optional)
├── results/                                      # Local JSON storage (optional)
└── README_NETSUITE_INTEGRATION.md               # This file
```

## Next Steps

1. ✅ Email polling working
2. ✅ Claude extraction working (90%+ accuracy)
3. ✅ NetSuite upload ready
4. ⏸️ Deploy to production hosting (Railway)
5. ⏸️ Create scheduled script to process uploaded files
6. ⏸️ Build journal entry / vendor credit creation logic

## Support

For issues:
1. Check logs in Railway dashboard (or local `email-poller.log`)
2. Check NetSuite Script Logs: Customization > Scripting > Script Execution Log
3. Verify .env configuration matches NetSuite exactly
4. Test RESTlet directly with curl/Postman before debugging Node.js

## Security Notes

⚠️ **Never commit .env file to version control**
⚠️ **Rotate credentials periodically**
⚠️ **Use Testing status on RESTlet until fully validated**
⚠️ **Monitor Script Execution Log for errors**
