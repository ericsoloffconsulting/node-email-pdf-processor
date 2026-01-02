# Transaction Validation System Documentation

## Overview

This validation system provides automated "manager review" functionality where Claude AI audits NetSuite transactions against their source documents (PDF and JSON files) to catch errors and ensure data accuracy.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  NetSuite Transaction (Vendor Credit / Journal Entry)      │
│  - Created by AP Assist automation                          │
│  - Has attached PDF and JSON source files                   │
│  - Flagged with custbody_ap_assist_processed = T           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Transaction Validation Library                             │
│  (lib/transaction_validation_library.js)                    │
│                                                              │
│  1. Extract transaction data (header + lines)               │
│  2. Load attached files (JSON + PDF)                        │
│  3. Format as human-readable markdown                       │
│  4. Build validation prompt for Claude                      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Claude API Library                                         │
│  (lib/claude_api_library.js)                                │
│                                                              │
│  - Sends validation prompt to Claude API                    │
│  - Uses Sonnet model for reasoning                          │
│  - Enables prompt caching for efficiency                    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Claude AI Analysis                                         │
│                                                              │
│  Validates:                                                  │
│  - Amounts match source documents exactly                   │
│  - Accounts and entities are correct                        │
│  - Line items complete and accurate                         │
│  - Memo fields and references proper                        │
│  - Proper accounting treatment (debits/credits)             │
│                                                              │
│  Returns: PASS/FAIL + detailed validation report            │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Result Processing                                          │
│                                                              │
│  - Mark transaction as validated                            │
│  - Flag critical issues if found                            │
│  - Save validation notes                                    │
│  - Email summary report                                     │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Transaction Validation Library (`lib/transaction_validation_library.js`)

Core library that provides functions to extract and format transaction data for validation.

**Key Functions:**

- **`getTransactionReadableOutput(recordType, recordId)`**
  - Extracts complete transaction data (header + line items)
  - Returns structured object with all transaction details
  
- **`getAttachedFiles(recordId)`**
  - Loads all files attached to the transaction
  - Parses JSON files
  - Gets PDF files as base64 for Claude API
  
- **`formatTransactionAsMarkdown(transactionData)`**
  - Converts transaction data to human-readable markdown format
  - Creates clean tables and structured output
  
- **`buildValidationPrompt(params)`**
  - Builds complete system and user prompts for Claude
  - Includes transaction data and source documents
  - Configurable validation focus (comprehensive, amounts, accounts, entities)
  
- **`prepareTransactionForValidation(recordType, recordId, options)`**
  - Complete workflow function
  - Calls all the above in sequence
  - Returns everything ready for Claude API call

**Usage Example:**

```javascript
define(['./lib/transaction_validation_library', './lib/claude_api_library'], 
    function(transValidation, claudeAPI) {
    
    // Prepare transaction for validation
    var prepared = transValidation.prepareTransactionForValidation(
        'vendorcredit',
        '12345',
        {
            validationType: 'comprehensive',
            customRules: [
                'Check NARDA number formatting',
                'Verify Marcone credit patterns'
            ]
        }
    );
    
    // Send to Claude
    var result = claudeAPI.callClaude({
        apiKey: apiKey,
        systemPrompt: prepared.validationPrompt.systemPrompt,
        userPrompt: prepared.validationPrompt.userPrompt,
        modelType: 'sonnet'
    });
    
    // Process result
    if (result.success) {
        log.audit('Validation Complete', result.analysis);
    }
});
```

### 2. Transaction Validation Scheduled Script (`transaction_validation_scheduled.js`)

Automated scheduled script that runs validation on recent transactions.

**Features:**

- Searches for unvalidated AP Assist transactions
- Validates each against source documents
- Flags critical issues automatically
- Marks transactions as validated
- Emails summary report

**Script Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `custscript_claude_api_key` | String | Yes | Claude API key |
| `custscript_validation_type` | List | No | 'comprehensive', 'amounts', 'accounts', 'entities' |
| `custscript_days_back` | Integer | No | How many days back to search (default: 1) |
| `custscript_validation_email` | String | No | Email for summary report |
| `custscript_auto_flag_issues` | Checkbox | No | Auto-flag transactions with issues |

**Deployment:**

1. Upload script to File Cabinet
2. Create Script Record (Customization > Scripting > Scripts > New)
3. Set script parameters
4. Deploy with desired schedule (Hourly/Daily recommended)

### 3. Required Custom Fields

The validation system requires these custom transaction body fields:

| Field ID | Label | Type | Apply To |
|----------|-------|------|----------|
| `custbody_ap_assist_processed` | AP Assist Processed | Checkbox | Vendor Credit, Journal Entry |
| `custbody_ap_assist_validated` | Validated by AI | Checkbox | Vendor Credit, Journal Entry |
| `custbody_ap_assist_validation_pass` | Validation Pass | Checkbox | Vendor Credit, Journal Entry |
| `custbody_ap_assist_validation_fail` | Validation Fail | Checkbox | Vendor Credit, Journal Entry |
| `custbody_ap_assist_validation_date` | Validation Date | Date | Vendor Credit, Journal Entry |
| `custbody_ap_assist_validation_notes` | Validation Notes | Long Text | Vendor Credit, Journal Entry |
| `custbody_source_json_file` | Source JSON File | File | Vendor Credit, Journal Entry |
| `custbody_source_pdf_file` | Source PDF File | File | Vendor Credit, Journal Entry |

## Validation Types

### Comprehensive (Default)
- Validates ALL aspects of the transaction
- Amounts, accounts, entities, line items, memo fields
- Most thorough but takes longest

### Amounts Only
- Focuses exclusively on numeric validation
- Verifies header totals and line amounts match exactly
- Fastest validation

### Accounts Only
- Verifies account assignments
- Checks proper debit/credit treatment
- Validates account types

### Entities Only
- Validates vendor/customer assignments
- Checks entity consistency across header and lines

## Data Flow

### Step 1: Transaction Creation
```
Email with PDF → Node.js Poller → NetSuite RESTlet → Folder Storage
                                        ↓
                              AP Assist Processing Script
                                        ↓
                   Creates Vendor Credit or Journal Entry
                   Attaches PDF + JSON source files
                   Sets custbody_ap_assist_processed = T
```

### Step 2: Validation
```
Scheduled Script runs (hourly/daily)
        ↓
Finds unvalidated transactions (custbody_ap_assist_validated = F)
        ↓
For each transaction:
  1. Load transaction record
  2. Extract all data (header + lines)
  3. Load attached JSON + PDF files
  4. Format as markdown
  5. Build validation prompt
  6. Send to Claude API (Sonnet model)
  7. Parse Claude's validation report
  8. Update transaction with results
  9. Flag if critical issues found
```

### Step 3: Review
```
Accountant reviews flagged transactions
        ↓
Email summary shows:
  - Total validated
  - Pass/fail counts
  - Critical issues found
  - Details for failed transactions
```

## Integration Points

### Direct to Claude API (Recommended)
- Validation runs **entirely within NetSuite**
- Uses `lib/claude_api_library.js` for API calls
- No dependency on Railway deployment
- More secure (files never leave NetSuite)
- Simpler architecture

### Why Not Through Railway?
- Railway deployment is only for **email polling**
- Adding validation to Railway would:
  - Require NetSuite → Railway → Claude → Railway → NetSuite
  - Add unnecessary complexity
  - Increase latency
  - Require exposing more NetSuite data externally
  - Duplicate functionality already in claude_api_library.js

## Cost Optimization

### Prompt Caching
The validation system uses Claude's **Prompt Caching** feature:

```javascript
var result = claudeAPI.callClaude({
    apiKey: apiKey,
    systemPrompt: validationPrompt.systemPrompt, // Cached across calls
    userPrompt: validationPrompt.userPrompt,     // Unique per transaction
    modelType: 'sonnet',
    enableCaching: true  // ← Reduces cost by ~90% for repeated validations
});
```

**Benefits:**
- System prompt is cached for 5 minutes
- Only user prompt (transaction data) changes
- First call: Full tokens charged
- Subsequent calls: Only cache read tokens + new content
- Typical savings: 85-90% on input tokens

### Token Usage Estimates

**Per Transaction:**
- System prompt: ~500 tokens (cached after first call)
- Transaction data: ~1,000-2,000 tokens
- JSON data: ~500-1,500 tokens
- PDF: ~2,000-5,000 tokens (if included)
- Output: ~500-1,000 tokens

**Cost Example (Sonnet 3.5):**
- First transaction: ~$0.03-0.05
- Subsequent (cached): ~$0.003-0.008
- **10 transactions: ~$0.10-0.15** (with caching)

## Sample Claude Validation Output

```
# VALIDATION REPORT

## Status: ⚠️ FAIL

## Critical Issues

1. **Amount Discrepancy on Line 2**
   - NetSuite shows: $125.00
   - JSON source shows: $124.95
   - Difference: $0.05 (rounding error)

2. **Missing NARDA Number**
   - Line 3 has no NARDA number assigned
   - JSON shows: "J12345"
   - Recommendation: Add custcol_narda_number = "J12345"

## Warnings

- Memo field is truncated, may be missing context

## Summary

Transaction has 2 critical issues that must be corrected:
- Amount rounding error on one line
- Missing NARDA number reference

All other fields validate correctly (vendor, accounts, entities).

## Recommendation

**REJECT** - Fix amount and add NARDA number before approval.
```

## Best Practices

### 1. Run Validation on Schedule
- Hourly or daily automated validation
- Catches issues while source data is fresh
- Allows time for corrections before month-end

### 2. Use Comprehensive Validation Initially
- Start with full comprehensive checks
- Identify common error patterns
- Switch to focused validation for specific issues

### 3. Monitor Validation Pass Rates
- Track trends over time
- Investigate patterns in failures
- Improve automation rules based on findings

### 4. Review Flagged Transactions Promptly
- Set up saved search for `custbody_ap_assist_validation_fail = T`
- Assign to accounting team for review
- Correct and re-validate

### 5. Customize Validation Rules
```javascript
var prepared = transValidation.prepareTransactionForValidation(
    recordType,
    recordId,
    {
        validationType: 'comprehensive',
        customRules: [
            'NARDA numbers must follow J##### or INV##### pattern',
            'Freight charges should be on account 367 only',
            'Vendor credits must reference a VRA bill number',
            'All amounts must match to the penny (no rounding)'
        ]
    }
);
```

## Troubleshooting

### Issue: Validation not running
**Check:**
- Script deployment is active
- Script parameters are configured (especially API key)
- Transactions have `custbody_ap_assist_processed = T`
- Transactions have `custbody_ap_assist_validated = F`

### Issue: All validations failing
**Check:**
- Claude API key is valid
- API key has sufficient credits
- NetSuite can reach api.anthropic.com (firewall/proxy)
- Check execution logs for detailed error messages

### Issue: Files not loading
**Check:**
- PDF and JSON files are properly attached to transaction
- Files are using correct custom fields (custbody_source_json_file, etc.)
- File permissions allow script to read

### Issue: Validation too strict/lenient
**Adjust:**
- Change validation type
- Add/remove custom rules
- Modify system prompt in buildValidationPrompt()

## Extending the System

### Add Real-Time Validation
Create a User Event Script (afterSubmit) to validate immediately:

```javascript
/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['./lib/transaction_validation_library', './lib/claude_api_library'],
    function(transValidation, claudeAPI) {
    
    function afterSubmit(context) {
        if (context.type !== context.UserEventType.CREATE) return;
        
        var newRecord = context.newRecord;
        var isApAssist = newRecord.getValue({
            fieldId: 'custbody_ap_assist_processed'
        });
        
        if (isApAssist) {
            // Validate immediately
            validateInBackground(newRecord.type, newRecord.id);
        }
    }
    
    return {
        afterSubmit: afterSubmit
    };
});
```

### Add Suitelet for On-Demand Validation
Allow users to trigger validation manually:

```javascript
/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', './lib/transaction_validation_library'],
    function(ui, transValidation) {
    
    function onGet(context) {
        var form = ui.createForm({ title: 'Validate Transaction' });
        
        form.addField({
            id: 'custpage_record_type',
            type: ui.FieldType.SELECT,
            label: 'Record Type'
        }).addSelectOption({ value: 'vendorcredit', text: 'Vendor Credit' })
          .addSelectOption({ value: 'journalentry', text: 'Journal Entry' });
          
        form.addField({
            id: 'custpage_record_id',
            type: ui.FieldType.TEXT,
            label: 'Record ID'
        });
        
        form.addSubmitButton({ label: 'Validate' });
        
        context.response.writePage(form);
    }
    
    function onPost(context) {
        // Run validation and display results
    }
    
    return {
        onGet: onGet,
        onPost: onPost
    };
});
```

## Security Considerations

1. **API Key Storage**: Store Claude API key in script parameters (encrypted)
2. **File Access**: Validation script has read-only access to transactions
3. **Data Privacy**: All validation runs within NetSuite (no external data transfer except to Claude API)
4. **Audit Trail**: All validations logged with timestamp and results

## Support

For issues or questions:
1. Check NetSuite execution logs
2. Review validation notes on flagged transactions
3. Check Claude API usage dashboard
4. Verify custom fields are properly configured

---

**Last Updated:** January 2, 2026  
**Version:** 1.0.0
