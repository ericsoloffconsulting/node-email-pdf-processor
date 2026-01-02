/**
 * Example Integration: Adding Validation to AP Assist Processing
 * 
 * This shows how to integrate the validation system into your existing
 * "AP Assist Marcone Bill Credits.js" script.
 * 
 * Two approaches:
 * 1. Validate immediately after transaction creation (inline)
 * 2. Flag for later validation (scheduled script handles it)
 */

// ============================================================================
// APPROACH 1: Immediate Validation (Inline)
// ============================================================================

/**
 * Add this to your AP Assist processing script after creating transactions
 */
function processJsonFileWithValidation(jsonFile, pdfFile, claudeApiKey) {
    // ... existing code to create vendor credit or journal entry ...
    
    // Example: After creating vendor credit
    var vendorCreditId = createVendorCredit(jsonData);
    
    if (vendorCreditId) {
        log.audit('Vendor Credit Created', {
            id: vendorCreditId,
            startingValidation: true
        });
        
        // VALIDATE IMMEDIATELY
        var validationResult = validateTransactionInline(
            'vendorcredit',
            vendorCreditId,
            claudeApiKey
        );
        
        if (validationResult.success) {
            if (validationResult.isPassed) {
                log.audit('Validation PASSED', {
                    vendorCreditId: vendorCreditId,
                    report: validationResult.validationReport
                });
            } else {
                log.error('Validation FAILED', {
                    vendorCreditId: vendorCreditId,
                    criticalIssues: validationResult.hasCriticalIssues,
                    report: validationResult.validationReport
                });
                
                // Flag for manual review
                flagTransactionForReview(vendorCreditId, validationResult.validationReport);
            }
        }
    }
}

/**
 * Inline validation function
 * Copy this into your processing script
 */
function validateTransactionInline(recordType, recordId, claudeApiKey) {
    try {
        // Load validation libraries
        var transValidation = require('./lib/transaction_validation_library');
        var claudeAPI = require('./lib/claude_api_library');
        
        // Prepare transaction for validation
        var prepared = transValidation.prepareTransactionForValidation(
            recordType,
            recordId,
            {
                validationType: 'comprehensive',
                customRules: [
                    'Verify amounts match Marcone credit memo exactly',
                    'Check NARDA numbers are captured correctly',
                    'Ensure no rounding errors exist',
                    'Validate vendor entity is Marcone (2106)'
                ]
            }
        );
        
        // Call Claude API
        var claudeResult = claudeAPI.callClaude({
            apiKey: claudeApiKey,
            systemPrompt: prepared.validationPrompt.systemPrompt,
            userPrompt: prepared.validationPrompt.userPrompt,
            modelType: 'sonnet',
            maxTokens: 4096,
            enableCaching: true
        });
        
        if (!claudeResult.success) {
            return {
                success: false,
                error: claudeResult.error
            };
        }
        
        // Parse validation result
        var validationReport = claudeResult.analysis;
        var isPassed = validationReport.toLowerCase().indexOf('pass') !== -1 &&
                       validationReport.toLowerCase().indexOf('approve') !== -1;
        var hasCriticalIssues = validationReport.toLowerCase().indexOf('critical') !== -1;
        
        // Save validation result to transaction
        var rec = record.load({
            type: recordType,
            id: recordId
        });
        
        rec.setValue({ fieldId: 'custbody_ap_assist_validated', value: true });
        rec.setValue({ fieldId: 'custbody_ap_assist_validation_pass', value: isPassed });
        rec.setValue({ fieldId: 'custbody_ap_assist_validation_date', value: new Date() });
        
        if (validationReport.length < 3000) {
            rec.setValue({ fieldId: 'custbody_ap_assist_validation_notes', value: validationReport });
        }
        
        rec.save();
        
        return {
            success: true,
            isPassed: isPassed,
            hasCriticalIssues: hasCriticalIssues,
            validationReport: validationReport
        };
        
    } catch (e) {
        log.error('Validation Error', {
            recordType: recordType,
            recordId: recordId,
            error: e.message
        });
        
        return {
            success: false,
            error: e.message
        };
    }
}

// ============================================================================
// APPROACH 2: Flag for Later Validation (Recommended)
// ============================================================================

/**
 * Simpler approach: Just flag transactions for later validation
 * The scheduled script handles all validation in batch
 * 
 * This is RECOMMENDED because:
 * - Doesn't slow down transaction creation
 * - Better governance management
 * - Centralized validation logic
 * - Can retry failed validations easily
 */

/**
 * Add this to your transaction creation functions
 */
function createVendorCreditWithValidationFlag(jsonData, pdfFileId, jsonFileId) {
    var vendorCredit = record.create({
        type: record.Type.VENDOR_CREDIT,
        isDynamic: true
    });
    
    // ... set all fields ...
    
    // FLAG FOR VALIDATION (Scheduled script will pick it up)
    vendorCredit.setValue({
        fieldId: 'custbody_ap_assist_processed',
        value: true  // Mark as AP Assist transaction
    });
    
    vendorCredit.setValue({
        fieldId: 'custbody_ap_assist_validated',
        value: false  // Not yet validated
    });
    
    // Attach source files for validation
    vendorCredit.setValue({
        fieldId: 'custbody_source_json_file',
        value: jsonFileId
    });
    
    vendorCredit.setValue({
        fieldId: 'custbody_source_pdf_file',
        value: pdfFileId
    });
    
    var vendorCreditId = vendorCredit.save();
    
    log.audit('Vendor Credit Created - Flagged for Validation', {
        id: vendorCreditId,
        willBeValidatedBy: 'transaction_validation_scheduled.js'
    });
    
    return vendorCreditId;
}

// ============================================================================
// APPROACH 3: Hybrid - Quick Check + Detailed Validation Later
// ============================================================================

/**
 * Do a quick validation check immediately, then schedule detailed validation
 */

/**
 * Quick validation - just checks key fields
 */
function quickValidationCheck(recordType, recordId, jsonData) {
    try {
        var rec = record.load({
            type: recordType,
            id: recordId
        });
        
        var issues = [];
        
        // Check 1: Total amount matches
        var nsTotal = rec.getValue({ fieldId: 'total' });
        var jsonTotal = parseFloat(jsonData.totalAmount || 0);
        
        if (Math.abs(nsTotal - jsonTotal) > 0.01) {
            issues.push('Total amount mismatch: NS=' + nsTotal + ' vs JSON=' + jsonTotal);
        }
        
        // Check 2: Vendor is correct
        var vendorId = rec.getValue({ fieldId: 'entity' });
        if (vendorId !== '2106') {
            issues.push('Wrong vendor: Expected 2106 (Marcone), got ' + vendorId);
        }
        
        // Check 3: Line count matches
        var lineCount = rec.getLineCount({ sublistId: 'item' }) + 
                       rec.getLineCount({ sublistId: 'expense' });
        var jsonLineCount = (jsonData.lineItems || []).length;
        
        if (lineCount !== jsonLineCount) {
            issues.push('Line count mismatch: NS=' + lineCount + ' vs JSON=' + jsonLineCount);
        }
        
        if (issues.length > 0) {
            log.error('Quick Validation Failed', {
                recordId: recordId,
                issues: issues
            });
            
            // Flag immediately for review
            rec.setValue({ fieldId: 'custbody_ap_assist_validation_fail', value: true });
            rec.setValue({ 
                fieldId: 'custbody_ap_assist_validation_notes', 
                value: 'Quick check failed: ' + issues.join('; ')
            });
            rec.save();
            
            return false;
        }
        
        log.debug('Quick Validation Passed', {
            recordId: recordId,
            message: 'Key fields match - full validation will run on schedule'
        });
        
        return true;
        
    } catch (e) {
        log.error('Quick Validation Error', {
            error: e.message
        });
        return false;
    }
}

/**
 * Use in your processing script like this:
 */
function processJsonFile(jsonFile, pdfFile) {
    var jsonData = JSON.parse(jsonFile.getContents());
    
    // Create transaction
    var vendorCreditId = createVendorCredit(jsonData);
    
    if (vendorCreditId) {
        // Quick check
        var quickCheckPassed = quickValidationCheck(
            'vendorcredit',
            vendorCreditId,
            jsonData
        );
        
        if (quickCheckPassed) {
            log.audit('Transaction Created & Quick Check Passed', {
                id: vendorCreditId,
                nextStep: 'Scheduled validation will run comprehensive check'
            });
        } else {
            log.error('Transaction Created BUT Quick Check Failed', {
                id: vendorCreditId,
                nextStep: 'Manual review required - transaction flagged'
            });
        }
    }
}

// ============================================================================
// RECOMMENDED IMPLEMENTATION PLAN
// ============================================================================

/**
 * STEP 1: Modify your existing AP Assist processing script
 * 
 * In "AP Assist Marcone Bill Credits.js", after creating each transaction:
 * 
 * 1. Set custbody_ap_assist_processed = true
 * 2. Set custbody_ap_assist_validated = false
 * 3. Attach PDF and JSON files using custom fields
 * 4. Optionally run quickValidationCheck() for immediate feedback
 * 
 * STEP 2: Deploy transaction_validation_scheduled.js
 * 
 * 1. Set schedule to run hourly
 * 2. Configure Claude API key parameter
 * 3. Set validation email parameter
 * 4. Enable auto-flag for critical issues
 * 
 * STEP 3: Create saved search for flagged transactions
 * 
 * Filters:
 * - custbody_ap_assist_processed = T
 * - custbody_ap_assist_validation_fail = T
 * 
 * Columns:
 * - Transaction ID
 * - Date Created
 * - Validation Date
 * - Validation Notes (first 500 chars)
 * - Amount
 * 
 * STEP 4: Create dashboard portlet or KPI
 * 
 * Show:
 * - Transactions validated today
 * - Pass rate (%)
 * - Transactions needing review
 * - Average validation time
 */

// ============================================================================
// EXAMPLE: COMPLETE INTEGRATION INTO EXISTING SCRIPT
// ============================================================================

/**
 * This shows how to add validation support to your existing
 * "AP Assist Marcone Bill Credits.js" scheduled script
 */

// At the top of your script, add these requires:
define([
    'N/record', 
    'N/search', 
    'N/file', 
    './lib/transaction_validation_library',  // ADD THIS
    './lib/claude_api_library'                // ADD THIS
], 
function(record, search, file, transValidation, claudeAPI) {
    
    function execute(context) {
        // ... your existing code ...
        
        // When creating vendor credit or JE, save the IDs
        var transactionsCreated = [];
        
        // Your existing transaction creation
        var vendorCreditId = createVendorCreditFromJSON(jsonData);
        
        if (vendorCreditId) {
            transactionsCreated.push({
                type: 'vendorcredit',
                id: vendorCreditId,
                jsonData: jsonData
            });
        }
        
        // At the end, optionally validate immediately
        var script = runtime.getCurrentScript();
        var enableInlineValidation = script.getParameter({
            name: 'custscript_enable_inline_validation'
        });
        
        if (enableInlineValidation === 'T') {
            var apiKey = claudeAPI.getApiKeyFromScriptParams(runtime);
            
            if (apiKey) {
                log.audit('Running Inline Validation', {
                    transactionCount: transactionsCreated.length
                });
                
                transactionsCreated.forEach(function(trans) {
                    // Quick check only
                    quickValidationCheck(trans.type, trans.id, trans.jsonData);
                });
            }
        } else {
            log.audit('Inline Validation Disabled', {
                message: 'Transactions will be validated by scheduled script',
                transactionCount: transactionsCreated.length
            });
        }
        
        // ... rest of your code ...
    }
    
    return {
        execute: execute
    };
});

/**
 * NOTES:
 * 
 * 1. The validation library extracts data using N/record.load()
 * 2. It formats everything as markdown for Claude
 * 3. Claude validates and returns structured report
 * 4. Results are saved back to the transaction
 * 5. Email summary keeps stakeholders informed
 * 
 * 6. SuiteQL vs. N/record: 
 *    - We use N/record because it gives us complete access to all fields
 *    - SuiteQL would work but requires knowing exact table/column names
 *    - N/record is more maintainable and works with custom fields easily
 * 
 * 7. Files are already attached to the transaction, so we load them
 *    from the transaction record itself (no need to search folders)
 * 
 * 8. Everything runs directly from NetSuite → Claude API
 *    No need to go through Railway (that's only for email polling)
 */
