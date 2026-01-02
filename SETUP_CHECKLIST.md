# NetSuite Integration Checklist

Quick reference checklist for completing the Marcone email processor integration.

## ☐ Phase 1: NetSuite Configuration

### Create File Cabinet Folders (10 min)
- [ ] Navigate to Documents > Files > File Cabinet
- [ ] Create `Marcone` folder under SuiteScripts
- [ ] Create subfolder: `PDFs_Unprocessed`
- [ ] Create subfolder: `PDFs_Processed`
- [ ] Create subfolder: `JSON_Unprocessed`
- [ ] Create subfolder: `JSON_Processed`
- [ ] Record internal IDs for each folder:
  ```
  PDFs_Unprocessed:  __________
  JSON_Unprocessed:  __________
  PDFs_Processed:    __________
  JSON_Processed:    __________
  ```

### Create Integration Record (5 min)
- [ ] Go to Setup > Integration > Manage Integrations > New
- [ ] Set Name: `Marcone Email Processor`
- [ ] Set State: `Enabled`
- [ ] Check: `Token-Based Authentication`
- [ ] Uncheck: `TBA: Authorization Flow`
- [ ] Save
- [ ] Copy and save securely:
  ```
  Consumer Key:    ________________________________________________
  Consumer Secret: ________________________________________________
  ```

### Create Access Token (5 min)
- [ ] Go to Setup > Users/Roles > Access Tokens > New
- [ ] Select Application: `Marcone Email Processor`
- [ ] Select User: (your admin user)
- [ ] Select Role: (role with File Cabinet access)
- [ ] Save
- [ ] Copy and save securely:
  ```
  Token ID:        ________________________________________________
  Token Secret:    ________________________________________________
  ```

### Upload and Deploy RESTlet (15 min)
- [ ] Go to Documents > Files > File Cabinet > SuiteScripts
- [ ] Click Add File
- [ ] Upload: `netsuite_marcone_pdf_receiver_restlet.js`
- [ ] Go to Customization > Scripting > Scripts > New
- [ ] Find and select uploaded script
- [ ] Click Create Script Record
- [ ] Configure Parameters:
  ```
  custscript_marcone_pdf_folder:  [Select PDFs_Unprocessed]
  custscript_marcone_json_folder: [Select JSON_Unprocessed]
  ```
- [ ] Save
- [ ] Click Deploy Script
- [ ] Set Status: `Testing`
- [ ] Save deployment
- [ ] Copy RESTlet URL:
  ```
  URL: ___________________________________________________________
  ```
- [ ] Extract Account ID from URL:
  ```
  Account ID: ___________
  ```

### Test RESTlet (Optional)
- [ ] Use GET endpoint to test connectivity
- [ ] Verify health check returns JSON with folder IDs

---

## ☐ Phase 2: Node.js Configuration

### Update .env File (5 min)
- [ ] Open `/email-pdf-processor/.env`
- [ ] Update NetSuite section:
  ```env
  NETSUITE_ENABLED=true
  NETSUITE_RESTLET_URL=[paste URL from above]
  NETSUITE_ACCOUNT_ID=[paste account ID]
  NETSUITE_CONSUMER_KEY=[paste consumer key]
  NETSUITE_CONSUMER_SECRET=[paste consumer secret]
  NETSUITE_TOKEN_ID=[paste token ID]
  NETSUITE_TOKEN_SECRET=[paste token secret]
  ```
- [ ] Save file
- [ ] Verify no typos in credentials

---

## ☐ Phase 3: Local Testing

### Test Email Connection (5 min)
- [ ] Open terminal
- [ ] Navigate to: `cd email-pdf-processor`
- [ ] Run: `node email-poller.js`
- [ ] Verify output shows:
  ```
  ✓ Email connection established
  ✓ Checking for new emails...
  ```

### Test One Email (10 min)
- [ ] Temporarily set `SEARCH_CRITERIA=ALL` in .env (if no unread emails)
- [ ] Run: `node email-poller.js`
- [ ] Verify console output shows:
  ```
  ✓ Found 1 PDF attachment
  ✓ Claude processing complete
  ✓ Uploaded to NetSuite successfully
  ```
- [ ] Check NetSuite File Cabinet:
  - [ ] PDF file exists in PDFs_Unprocessed
  - [ ] JSON file exists in JSON_Unprocessed
  - [ ] Filenames have timestamp prefix
- [ ] Open JSON file and verify extraction accuracy:
  - [ ] `isCreditMemo` is correct
  - [ ] `invoiceNumber` matches PDF
  - [ ] `lineItems` have NARDA numbers
  - [ ] `originalBillNumber` extracted correctly
- [ ] Reset `SEARCH_CRITERIA=UNSEEN` in .env

### Verify Scheduled Script Logs (Optional)
- [ ] Go to Customization > Scripting > Script Execution Log
- [ ] Filter by Script: `Marcone PDF Receiver RESTlet`
- [ ] Verify entries show:
  ```
  Files uploaded successfully
  PDF File ID: [number]
  JSON File ID: [number]
  ```

---

## ☐ Phase 4: Production Deployment

### Deploy to Railway (20 min)
- [ ] Create Railway account: https://railway.app/
- [ ] Create new project
- [ ] Connect GitHub repository
- [ ] Add environment variables:
  - [ ] Copy all from `.env` file
  - [ ] Paste into Railway > Variables section
  - [ ] Verify `NETSUITE_ENABLED=true`
- [ ] Deploy
- [ ] Monitor logs for first execution:
  ```
  ✓ Email connection established
  ✓ Polling every 5 minutes
  ```
- [ ] Test with one email
- [ ] Verify upload to NetSuite

### Switch to Released Status (2 min)
- [ ] In NetSuite, go to Customization > Scripting > Script Deployments
- [ ] Find: `Marcone PDF Receiver Production`
- [ ] Change Status: `Testing` → `Released`
- [ ] Save

---

## ☐ Phase 5: Ongoing Monitoring

### Daily Checks (First Week)
- [ ] Check Railway logs for errors
- [ ] Check NetSuite File Cabinet for new files
- [ ] Verify JSON extraction accuracy
- [ ] Monitor email inbox for missed emails

### Weekly Checks (Ongoing)
- [ ] Review Script Execution Log for errors
- [ ] Check folder sizes in File Cabinet
- [ ] Verify email processing count matches expected volume
- [ ] Review Claude API usage and costs

---

## ☐ Phase 6: Next Steps (Scheduled Script)

### Create Bill Processing Script
- [ ] Design logic for reading JSON files
- [ ] Implement bill credit creation
- [ ] Handle NARDA-specific processing rules
- [ ] Add file movement to Processed folders
- [ ] Deploy and schedule

---

## Quick Test Command

```bash
# Test local setup
cd email-pdf-processor
node email-poller.js

# Expected output:
# ✓ Email connection established
# ✓ Checking for new emails...
# ✓ Found 1 email with PDF
# ✓ Processing: marcone_67718694.pdf
# ✓ Claude processing complete
# ✓ Uploaded to NetSuite - PDF ID: 12345, JSON ID: 12346
```

## Troubleshooting Quick Reference

| Error | Solution |
|-------|----------|
| "Authentication failed" | Verify OAuth credentials in .env |
| "Folder not found" | Check folder IDs in RESTlet deployment |
| "Script not found" | Verify RESTlet URL and deployment status |
| "No emails found" | Check SEARCH_CRITERIA and email inbox |
| "Claude API error" | Verify ANTHROPIC_API_KEY in .env |

## Files to Check

- [ ] `email-poller.js` - Node.js app (✅ complete)
- [ ] `netsuite_marcone_pdf_receiver_restlet.js` - RESTlet (✅ complete)
- [ ] `.env` - Configuration (⏸️ needs NetSuite credentials)
- [ ] `package.json` - Dependencies (✅ all installed)

## Success Criteria

✅ Integration is working when:
1. Node.js polls email without errors
2. PDFs are extracted and sent to Claude
3. Claude returns accurate JSON extraction
4. Files upload to NetSuite via OAuth
5. Files appear in NetSuite File Cabinet
6. RESTlet logs show success messages

## Estimated Time

- NetSuite setup: **35 minutes**
- Node.js config: **5 minutes**
- Local testing: **15 minutes**
- Railway deployment: **20 minutes**
- **Total: ~75 minutes** (1 hour 15 minutes)

## Next Session Goals

1. Complete all Phase 1-3 checkboxes
2. Verify end-to-end flow works
3. Deploy to Railway
4. Begin Scheduled Script design

---

**Last Updated**: January 2026
**Integration Status**: Code complete, pending NetSuite setup
