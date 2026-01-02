# AP Assist Transaction Validation System

## Quick Summary

This system provides automated AI-powered validation of NetSuite transactions created by AP Assist. Claude AI acts as a "manager" reviewing completed work to catch errors before they impact accounting.

## What It Does

✅ **Validates transactions** against source documents (PDF + JSON)  
✅ **Checks amounts**, accounts, entities, line items  
✅ **Flags critical issues** automatically  
✅ **Emails summary reports** to accounting team  
✅ **Reduces manual review time** by 80-90%  

## Architecture Summary

```
NetSuite Transaction → Validation Library → Claude API → Validation Report
                          (extracts data)     (analyzes)    (pass/fail)
```

**Key Point:** Everything runs **directly in NetSuite** → Claude API. No Railway involvement needed.

## Files Created

### Core Libraries (in `/lib/`)

1. **`transaction_validation_library.js`**
   - Extracts transaction data (header + lines)
   - Loads attached PDF and JSON files
   - Formats everything as readable markdown
   - Builds validation prompts for Claude
   - **Main function:** `prepareTransactionForValidation(recordType, recordId, options)`

2. **`claude_api_library.js`** (already exists)
   - Handles Claude API calls
   - Model selection with fallback
   - Prompt caching for cost savings
   - **Main function:** `callClaude(params)`

### Scripts

3. **`transaction_validation_scheduled.js`**
   - Scheduled script that runs hourly/daily
   - Finds unvalidated AP Assist transactions
   - Validates each against source files
   - Flags issues and emails summary
   - **Deploy this for automated validation**

### Documentation

4. **`VALIDATION_SYSTEM_DOCUMENTATION.md`**
   - Complete system architecture
   - Setup instructions
   - Configuration details
   - Troubleshooting guide

5. **`VALIDATION_INTEGRATION_EXAMPLES.js`**
   - Code examples for integration
   - Three approaches (immediate/scheduled/hybrid)
   - Shows how to add to existing scripts

## Quick Start

### 1. Create Required Custom Fields

Create these transaction body fields (Apply to: Vendor Credit, Journal Entry):

| Field ID | Label | Type |
|----------|-------|------|
| `custbody_ap_assist_processed` | AP Assist Processed | Checkbox |
| `custbody_ap_assist_validated` | Validated by AI | Checkbox |
| `custbody_ap_assist_validation_pass` | Validation Pass | Checkbox |
| `custbody_ap_assist_validation_fail` | Validation Fail | Checkbox |
| `custbody_ap_assist_validation_date` | Validation Date | Date |
| `custbody_ap_assist_validation_notes` | Validation Notes | Long Text |
| `custbody_source_json_file` | Source JSON File | File |
| `custbody_source_pdf_file` | Source PDF File | File |

### 2. Upload Library Files

Upload to File Cabinet → SuiteScripts folder:
- `lib/transaction_validation_library.js`
- `lib/claude_api_library.js` (should already exist)

### 3. Modify Your AP Assist Processing Script

In your existing "AP Assist Marcone Bill Credits.js", after creating each transaction:

```javascript
// After creating vendor credit or journal entry
vendorCredit.setValue({
    fieldId: 'custbody_ap_assist_processed',
    value: true
});

vendorCredit.setValue({
    fieldId: 'custbody_ap_assist_validated',
    value: false  // Will be validated by scheduled script
});

// Attach source files
vendorCredit.setValue({
    fieldId: 'custbody_source_json_file',
    value: jsonFileId
});

vendorCredit.setValue({
    fieldId: 'custbody_source_pdf_file',
    value: pdfFileId
});
```

### 4. Deploy Validation Scheduled Script

1. Upload `transaction_validation_scheduled.js` to File Cabinet
2. Create Script Record: **Customization > Scripting > Scripts > New**
3. Select uploaded file
4. Set Script Parameters:
   - `custscript_claude_api_key` = Your Claude API key
   - `custscript_validation_type` = comprehensive
   - `custscript_days_back` = 1
   - `custscript_validation_email` = accounting@company.com
   - `custscript_auto_flag_issues` = T
5. Deploy with schedule: **Hourly** or **Daily**
6. Set Status to **Released**

### 5. Create Saved Search for Flagged Transactions

Create a saved search to monitor validation failures:

**Search Type:** Transaction  
**Filters:**
- Type = Vendor Credit, Journal Entry
- custbody_ap_assist_validated = T
- custbody_ap_assist_validation_fail = T

**Columns:**
- Transaction Number
- Date Created
- Validation Date
- Validation Notes
- Amount
- Status

Save and add to dashboard for quick access.

## How Validation Works

### Data Extraction Methods

**Why N/record instead of SuiteQL?**

The validation library uses `N/record.load()` to extract transaction data because:

1. **Complete field access** - Gets all standard and custom fields automatically
2. **No schema knowledge needed** - Don't need to know table/column names
3. **Line items included** - Easy access to sublists (item, expense, line)
4. **Custom fields work seamlessly** - No special handling required
5. **More maintainable** - Works even when NetSuite changes internal schemas

SuiteQL would work but requires:
- Knowing exact table names (`transaction`, `transactionline`, etc.)
- Knowing exact column names (which can differ from field IDs)
- Joining tables for line items
- Special handling for custom fields

**The library provides both options**, but defaults to N/record for simplicity.

### What Gets Sent to Claude

For each transaction, Claude receives:

1. **Transaction Header** (formatted markdown table)
   - Transaction ID, Date, Vendor/Customer
   - Total amount, Currency, Status
   - Memo fields, References
   - All custom fields

2. **Line Items** (formatted list)
   - Item/Account, Description
   - Quantity, Rate, Amount
   - Department, Class, Location
   - NARDA numbers, Custom fields

3. **Source JSON Data** (original extracted data)
   - Full JSON from PDF extraction
   - All line items as extracted
   - Original amounts and descriptions

4. **Source PDF** (optionally - if needed for visual review)
   - Base64 encoded PDF
   - Claude can "read" the PDF visually
   - Useful for complex layouts

### Validation Types

**Comprehensive** (default) - Validates everything  
**Amounts** - Only checks numeric values  
**Accounts** - Only checks account assignments  
**Entities** - Only checks vendor/customer assignments  

### Claude's Output

Claude returns a structured validation report:

```
STATUS: PASS ✓ or FAIL ✗

CRITICAL ISSUES:
- [List of must-fix errors]

WARNINGS:
- [List of potential concerns]

SUMMARY:
[Brief overview of validation]

RECOMMENDATION: APPROVE or REJECT
[Reasoning for recommendation]
```

## Cost Analysis

### With Prompt Caching (Recommended)

**Per transaction:**
- First: ~$0.03-0.05
- Subsequent: ~$0.003-0.008 (90% cheaper)

**Daily volume examples:**
- 10 transactions/day = ~$0.10-0.15/day = **$3-5/month**
- 50 transactions/day = ~$0.50-0.75/day = **$15-25/month**
- 100 transactions/day = ~$1.00-1.50/day = **$30-45/month**

**ROI:**
- Manual review: 5-10 minutes per transaction
- AI validation: Instant + more thorough
- Catches errors that humans miss (rounding, missing fields, etc.)
- **Pays for itself if it catches 1-2 errors per month**

### Without Caching

~10x more expensive - **always enable caching** in production.

## Integration Approaches

### Approach 1: Scheduled Validation (Recommended)

**Pros:**
- ✅ Doesn't slow down transaction creation
- ✅ Better governance management  
- ✅ Can validate in batches
- ✅ Easy to retry failures
- ✅ Centralized validation logic

**Cons:**
- ❌ Not immediate (runs hourly/daily)

**Use when:** Processing many transactions in bulk

### Approach 2: Immediate Validation (Inline)

**Pros:**
- ✅ Instant feedback
- ✅ Catches errors before workflow continues
- ✅ Can prevent downstream issues

**Cons:**
- ❌ Slows down processing
- ❌ Uses more governance
- ❌ Harder to retry failures

**Use when:** Critical transactions that must be perfect

### Approach 3: Hybrid (Quick Check + Scheduled)

**Pros:**
- ✅ Immediate basic validation
- ✅ Detailed validation later
- ✅ Best of both worlds

**Cons:**
- ❌ More complex setup

**Use when:** Want both speed and thoroughness

## Troubleshooting

### "Validation not running"
→ Check script deployment is active and has correct parameters

### "All validations failing"  
→ Check Claude API key is valid and has credits

### "Files not loading"
→ Verify PDF and JSON are attached using custom fields

### "Too strict/lenient"
→ Adjust validation type or customize rules in `buildValidationPrompt()`

## Next Steps

1. ✅ Create custom fields
2. ✅ Upload library files
3. ✅ Modify AP Assist script to flag transactions
4. ✅ Deploy validation scheduled script
5. ✅ Create saved search for monitoring
6. ✅ Test with a few transactions
7. ✅ Review validation reports
8. ✅ Adjust validation rules as needed
9. ✅ Monitor pass rates over time

## Support

Questions? Check:
1. `VALIDATION_SYSTEM_DOCUMENTATION.md` - Full technical docs
2. `VALIDATION_INTEGRATION_EXAMPLES.js` - Code examples
3. NetSuite Execution Logs - Detailed error messages
4. Validation Notes field on flagged transactions

---

**Created:** January 2, 2026  
**Purpose:** Automated AI validation for AP Assist transactions  
**Technology:** NetSuite SuiteScript 2.1 + Claude API (Sonnet 3.5)
