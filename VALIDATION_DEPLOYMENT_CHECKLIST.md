# Transaction Validation System - Deployment Checklist

Use this checklist to deploy the validation system step-by-step.

---

## Phase 1: Custom Fields (15 minutes)

### ☐ Create Transaction Body Fields

Navigate to: **Customization > Lists, Records, & Fields > Transaction Body Fields > New**

Create each field with these settings:

#### Field 1: AP Assist Processed
- **ID:** `custbody_ap_assist_processed`
- **Label:** AP Assist Processed
- **Type:** Check Box
- **Applies To:** ✓ Vendor Credit, ✓ Journal Entry
- **Store Value:** ✓ Checked
- **Default Value:** (unchecked)

#### Field 2: Validated by AI
- **ID:** `custbody_ap_assist_validated`
- **Label:** Validated by AI
- **Type:** Check Box
- **Applies To:** ✓ Vendor Credit, ✓ Journal Entry
- **Store Value:** ✓ Checked
- **Default Value:** (unchecked)

#### Field 3: Validation Pass
- **ID:** `custbody_ap_assist_validation_pass`
- **Label:** Validation Pass
- **Type:** Check Box
- **Applies To:** ✓ Vendor Credit, ✓ Journal Entry
- **Store Value:** ✓ Checked
- **Default Value:** (unchecked)

#### Field 4: Validation Fail
- **ID:** `custbody_ap_assist_validation_fail`
- **Label:** Validation Fail
- **Type:** Check Box
- **Applies To:** ✓ Vendor Credit, ✓ Journal Entry
- **Store Value:** ✓ Checked
- **Default Value:** (unchecked)

#### Field 5: Validation Date
- **ID:** `custbody_ap_assist_validation_date`
- **Label:** Validation Date
- **Type:** Date
- **Applies To:** ✓ Vendor Credit, ✓ Journal Entry
- **Store Value:** ✓ Checked

#### Field 6: Validation Notes
- **ID:** `custbody_ap_assist_validation_notes`
- **Label:** Validation Notes
- **Type:** Long Text
- **Applies To:** ✓ Vendor Credit, ✓ Journal Entry
- **Store Value:** ✓ Checked
- **Display Type:** Inline Text

#### Field 7: Source JSON File
- **ID:** `custbody_source_json_file`
- **Label:** Source JSON File
- **Type:** File
- **Applies To:** ✓ Vendor Credit, ✓ Journal Entry
- **Store Value:** ✓ Checked

#### Field 8: Source PDF File
- **ID:** `custbody_source_pdf_file`
- **Label:** Source PDF File
- **Type:** File
- **Applies To:** ✓ Vendor Credit, ✓ Journal Entry
- **Store Value:** ✓ Checked

### ☐ Add Fields to Transaction Forms (Optional)

Navigate to: **Customization > Forms > Transaction Forms**

Edit your Vendor Credit and Journal Entry forms to display:
- AP Assist Processed (Main tab)
- Validated by AI (Main tab)
- Validation Pass (Main tab)
- Validation Fail (Main tab)
- Validation Date (Main tab)
- Validation Notes (Communication subtab)
- Source JSON File (Communication subtab)
- Source PDF File (Communication subtab)

---

## Phase 2: Upload Library Files (10 minutes)

### ☐ Upload Transaction Validation Library

1. Navigate to: **Documents > Files > SuiteScripts > lib**
2. Create `lib` folder if it doesn't exist
3. Click **Add File**
4. Upload: `transaction_validation_library.js`
5. Set **Available Without Login:** (unchecked)
6. Save

### ☐ Verify Claude API Library Exists

1. Check: **Documents > Files > SuiteScripts > lib**
2. Confirm `claude_api_library.js` exists
3. If not, upload it from the attachment provided

---

## Phase 3: Modify AP Assist Processing Script (20 minutes)

### ☐ Update Transaction Creation Functions

Open: `AP Assist Marcone Bill Credits.js`

Find your vendor credit creation function and add:

```javascript
// After creating vendor credit record, before saving:
vendorCredit.setValue({
    fieldId: 'custbody_ap_assist_processed',
    value: true
});

vendorCredit.setValue({
    fieldId: 'custbody_ap_assist_validated',
    value: false
});

vendorCredit.setValue({
    fieldId: 'custbody_source_json_file',
    value: jsonFileId  // File ID from your JSON file
});

vendorCredit.setValue({
    fieldId: 'custbody_source_pdf_file',
    value: pdfFileId   // File ID from your PDF file
});
```

Repeat for journal entry creation function.

### ☐ Test Modified Script

1. Deploy script to sandbox (if available)
2. Process a test transaction
3. Verify custom fields are populated
4. Check that files are attached

---

## Phase 4: Deploy Validation Scheduled Script (15 minutes)

### ☐ Upload Script File

1. Navigate to: **Documents > Files > SuiteScripts**
2. Click **Add File**
3. Upload: `transaction_validation_scheduled.js`
4. Save

### ☐ Create Script Record

1. Navigate to: **Customization > Scripting > Scripts > New**
2. Select: `transaction_validation_scheduled.js`
3. Click **Create Script Record**

### ☐ Configure Script Parameters

Add these script parameters:

#### Parameter 1: Claude API Key
- **ID:** `custscript_claude_api_key`
- **Type:** Password
- **Display Type:** Normal
- **Description:** Claude API key for validation
- **Mandatory:** ✓ Checked

#### Parameter 2: Validation Type
- **ID:** `custscript_validation_type`
- **Type:** List/Record
- **Display Type:** Normal
- **Default Value:** comprehensive
- **List/Record:** Create new list with values:
  - comprehensive
  - amounts
  - accounts
  - entities

#### Parameter 3: Days Back
- **ID:** `custscript_days_back`
- **Type:** Integer
- **Display Type:** Normal
- **Default Value:** 1
- **Description:** How many days back to search for transactions

#### Parameter 4: Validation Email
- **ID:** `custscript_validation_email`
- **Type:** Email Address
- **Display Type:** Normal
- **Description:** Email address for validation summary reports

#### Parameter 5: Auto Flag Issues
- **ID:** `custscript_auto_flag_issues`
- **Type:** Check Box
- **Display Type:** Normal
- **Default Value:** ✓ Checked
- **Description:** Automatically flag transactions with critical issues

### ☐ Save Script Record

Click **Save** to create the script record.

---

## Phase 5: Deploy Script (10 minutes)

### ☐ Create Deployment

1. On the script record page, click **Deploy Script**
2. Fill in deployment details:

**Deployment Details:**
- **Title:** AP Assist Validation - Hourly
- **ID:** `customdeploy_ap_assist_validation_hourly`
- **Status:** Released (or Testing for initial deployment)
- **Log Level:** Debug (for testing), then Audit (for production)

**Schedule:**
- **Repeat:** Every Hour
- **Start Time:** 8:00 AM
- **End By Time:** 8:00 PM (or leave blank for 24/7)
- **Repeat On:** Monday, Tuesday, Wednesday, Thursday, Friday

**Audience:**
- **Execute as Role:** Administrator (or specific role)

### ☐ Set Script Parameter Values

In the deployment, set these parameter values:

- **Claude API Key:** (paste your actual API key)
- **Validation Type:** comprehensive
- **Days Back:** 1
- **Validation Email:** accounting@yourcompany.com
- **Auto Flag Issues:** ✓ Checked

### ☐ Save Deployment

Click **Save** to activate the deployment.

---

## Phase 6: Create Monitoring Tools (15 minutes)

### ☐ Create Saved Search: Validation Status

1. Navigate to: **Lists > Search > Saved Searches > New**
2. **Search Type:** Transaction
3. **Search Title:** AP Assist - Validation Status

**Criteria:**
- Type = Vendor Credit OR Journal Entry
- custbody_ap_assist_processed = T
- Date Created = within this month

**Results:**
- Transaction Number
- Date Created
- Amount
- Status
- custbody_ap_assist_validated (as "Validated")
- custbody_ap_assist_validation_pass (as "Pass")
- custbody_ap_assist_validation_fail (as "Fail")
- custbody_ap_assist_validation_date (as "Validation Date")

**Sort By:** Date Created (descending)

**Available as Public:** ✓ Checked

Save search.

### ☐ Create Saved Search: Failed Validations

1. Navigate to: **Lists > Search > Saved Searches > New**
2. **Search Type:** Transaction
3. **Search Title:** AP Assist - Failed Validations

**Criteria:**
- Type = Vendor Credit OR Journal Entry
- custbody_ap_assist_validated = T
- custbody_ap_assist_validation_fail = T

**Results:**
- Transaction Number
- Date Created
- Amount
- Entity
- custbody_ap_assist_validation_notes (first 500 characters)
- custbody_ap_assist_validation_date

**Highlighting:**
- If custbody_ap_assist_validation_fail = T → Row Color: Red

**Sort By:** Date Created (descending)

**Available as Public:** ✓ Checked

Save search.

### ☐ Add Searches to Dashboard

1. Navigate to: **Home > Dashboard**
2. Edit your dashboard
3. Add portlet: Search Results
4. Select: AP Assist - Validation Status
5. Add another portlet: Search Results
6. Select: AP Assist - Failed Validations
7. Save dashboard

---

## Phase 7: Testing (20 minutes)

### ☐ Test 1: Process a Transaction

1. Run your AP Assist processing script
2. Let it create a vendor credit or journal entry
3. Verify custom fields are set:
   - custbody_ap_assist_processed = T
   - custbody_ap_assist_validated = F
   - custbody_source_json_file = (file attached)
   - custbody_source_pdf_file = (file attached)

### ☐ Test 2: Manual Validation Test

Create a test script to validate one transaction:

```javascript
/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['./lib/transaction_validation_library', './lib/claude_api_library'],
    function(transValidation, claudeAPI) {
    
    function onRequest(context) {
        // Test with a known transaction ID
        var testRecordId = '12345'; // Replace with real ID
        var apiKey = 'YOUR_API_KEY';
        
        var prepared = transValidation.prepareTransactionForValidation(
            'vendorcredit',
            testRecordId,
            { validationType: 'comprehensive' }
        );
        
        var result = claudeAPI.callClaude({
            apiKey: apiKey,
            systemPrompt: prepared.validationPrompt.systemPrompt,
            userPrompt: prepared.validationPrompt.userPrompt,
            modelType: 'sonnet'
        });
        
        context.response.write({
            output: JSON.stringify(result, null, 2)
        });
    }
    
    return { onRequest: onRequest };
});
```

### ☐ Test 3: Scheduled Script Test

1. Wait for scheduled script to run (check schedule)
2. OR manually trigger: **Customization > Scripting > Script Deployments**
3. Find your deployment and click **Run Now**
4. Monitor execution log: **System > Management > Execution Logs**
5. Check for:
   - Transactions found
   - Validation calls successful
   - Results saved to transactions

### ☐ Test 4: Check Email

1. Verify validation email was sent
2. Check formatting and content
3. Confirm flagged transactions are listed

---

## Phase 8: Monitor and Adjust (Ongoing)

### ☐ Week 1: Daily Monitoring

- [ ] Check execution logs daily
- [ ] Review failed validations
- [ ] Adjust validation rules if too strict/lenient
- [ ] Monitor API usage and costs

### ☐ Week 2-4: Weekly Monitoring

- [ ] Review pass rate trends
- [ ] Identify common failure patterns
- [ ] Update validation rules as needed
- [ ] Train team on reviewing flagged transactions

### ☐ Monthly Review

- [ ] Calculate error catch rate
- [ ] Review API costs vs. value
- [ ] Gather feedback from accounting team
- [ ] Optimize validation frequency if needed

---

## Troubleshooting Checklist

### ☐ If Validation Script Doesn't Run

1. Check deployment status is "Released"
2. Verify schedule is active
3. Check execution log for errors
4. Verify API key is valid
5. Check governance limits

### ☐ If No Transactions Found

1. Verify custbody_ap_assist_processed is set on transactions
2. Check date range (days_back parameter)
3. Verify transactions are vendor credits or journal entries
4. Check custbody_ap_assist_validated = F filter

### ☐ If Validation Always Fails

1. Check Claude API key has credits
2. Verify files are properly attached
3. Check file permissions
4. Review execution log for API errors
5. Test API key with manual call

### ☐ If Files Not Loading

1. Verify custom fields exist (custbody_source_json_file, etc.)
2. Check files are attached to transaction
3. Verify file format (JSON, PDF)
4. Check file permissions allow script access

---

## Success Criteria

✅ **System is working correctly when:**

- Transactions are automatically flagged for validation
- Validation runs on schedule without errors
- Pass/fail results are recorded on transactions
- Email summaries are sent reliably
- Flagged transactions appear in saved search
- Validation notes provide actionable feedback
- Pass rate is 80%+ (adjust if needed)

---

## Rollback Plan

If you need to disable the system:

### ☐ Temporary Disable

1. Navigate to: **Customization > Scripting > Script Deployments**
2. Find: AP Assist Validation deployment
3. Set Status: **Testing** (prevents execution)
4. Save

### ☐ Permanent Removal

1. Delete script deployment
2. Delete script record
3. Remove validation code from AP Assist processing script
4. (Optional) Hide custom fields from forms
5. (Optional) Delete custom fields (if no longer needed)

---

## Estimated Timeline

- **Phase 1-2:** 25 minutes (custom fields + library upload)
- **Phase 3-4:** 35 minutes (modify script + deploy validation)
- **Phase 5-6:** 25 minutes (create deployment + monitoring)
- **Phase 7:** 20 minutes (testing)

**Total:** ~2 hours for complete deployment and testing

---

## Support Resources

- **Documentation:** `VALIDATION_SYSTEM_DOCUMENTATION.md`
- **Examples:** `VALIDATION_INTEGRATION_EXAMPLES.js`
- **Quick Start:** `VALIDATION_README.md`
- **This Checklist:** `VALIDATION_DEPLOYMENT_CHECKLIST.md`

---

**Last Updated:** January 2, 2026  
**Version:** 1.0.0

---

## Deployment Completed ✓

**Date Completed:** _________________

**Deployed By:** _________________

**Notes:** _________________

_________________

_________________
