/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * 
 * Transaction Validation Scheduled Script
 * 
 * Scans for recently created AP Assist transactions (vendor credits, journal entries)
 * and validates them against their source files using Claude API.
 * Acts as a "manager review" to catch any errors in automated transaction creation.
 * 
 * Workflow:
 * 1. Find transactions created by AP Assist (with custom field flag)
 * 2. For each transaction, gather full data + attached files
 * 3. Send to Claude API for validation
 * 4. Log results and flag any issues
 * 5. Optionally email summary report
 * 
 * Script Parameters:
 * - custscript_claude_api_key (required) - Claude API key
 * - custscript_validation_type (optional) - 'comprehensive', 'amounts', 'accounts', 'entities'
 * - custscript_days_back (optional) - How many days back to search (default: 1)
 * - custscript_validation_email (optional) - Email address for summary report
 * - custscript_auto_flag_issues (optional) - T/F to auto-flag transactions with issues
 * 
 * Deployment:
 * - Suggested frequency: Hourly or Daily
 * - Can also be triggered on-demand via Suitelet
 */

define(['N/search', 'N/record', 'N/runtime', 'N/log', 'N/email', 'N/format',
        './lib/transaction_validation_library', './lib/claude_api_library'],
    function(search, record, runtime, log, email, format, transValidation, claudeAPI) {

        /**
         * Main execution function
         */
        function execute(context) {
            try {
                log.audit('Starting Transaction Validation', 'Automated validation process beginning');

                // Get script parameters
                var script = runtime.getCurrentScript();
                var apiKey = claudeAPI.getApiKeyFromScriptParams(runtime);
                
                if (!apiKey) {
                    log.error('Configuration Error', 'Claude API key not configured');
                    return;
                }

                var validationType = script.getParameter({
                    name: 'custscript_validation_type'
                }) || 'comprehensive';

                var daysBack = script.getParameter({
                    name: 'custscript_days_back'
                }) || 1;

                var emailRecipient = script.getParameter({
                    name: 'custscript_validation_email'
                });

                var autoFlagIssues = script.getParameter({
                    name: 'custscript_auto_flag_issues'
                }) === 'T';

                log.debug('Configuration', {
                    validationType: validationType,
                    daysBack: daysBack,
                    emailRecipient: emailRecipient,
                    autoFlagIssues: autoFlagIssues
                });

                // Find transactions to validate
                var transactionsToValidate = findTransactionsToValidate(daysBack);

                log.audit('Transactions Found', {
                    count: transactionsToValidate.length
                });

                if (transactionsToValidate.length === 0) {
                    log.audit('No Transactions to Validate', 'No eligible transactions found in the specified time period');
                    return;
                }

                // Validate each transaction
                var validationResults = [];

                for (var i = 0; i < transactionsToValidate.length; i++) {
                    var trans = transactionsToValidate[i];

                    // Check governance
                    var remainingUsage = script.getRemainingUsage();
                    if (remainingUsage < 100) {
                        log.debug('Low Governance', 'Pausing validation - will continue in next execution');
                        break;
                    }

                    log.audit('Validating Transaction ' + (i + 1) + ' of ' + transactionsToValidate.length, {
                        recordType: trans.recordType,
                        recordId: trans.recordId,
                        tranId: trans.tranId
                    });

                    var result = validateTransaction(
                        trans.recordType,
                        trans.recordId,
                        trans.tranId,
                        apiKey,
                        validationType,
                        autoFlagIssues
                    );

                    validationResults.push(result);

                    // Brief pause between API calls (optional)
                    // Uncomment if hitting rate limits
                    // var pauseEnd = new Date().getTime() + 2000;
                    // while (new Date().getTime() < pauseEnd) { }
                }

                // Generate summary report
                var summary = generateSummaryReport(validationResults);

                log.audit('Validation Complete', summary);

                // Email results if configured
                if (emailRecipient) {
                    sendValidationEmail(emailRecipient, validationResults, summary);
                }

            } catch (e) {
                log.error('Script Error', {
                    error: e.message,
                    stack: e.stack
                });
            }
        }

        /**
         * Finds transactions that need validation
         * Looks for recently created vendor credits and journal entries with AP Assist flag
         */
        function findTransactionsToValidate(daysBack) {
            var transactions = [];
            var cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysBack);
            var cutoffDateString = format.format({
                value: cutoffDate,
                type: format.Type.DATE
            });

            // Search for vendor credits
            var vendorCreditSearch = search.create({
                type: 'vendorcredit',
                filters: [
                    ['datecreated', 'onorafter', cutoffDateString],
                    'AND',
                    ['custbody_ap_assist_processed', 'is', 'T'],
                    'AND',
                    ['custbody_ap_assist_validated', 'is', 'F'] // Only unvalidated
                ],
                columns: [
                    'internalid',
                    'tranid',
                    'datecreated',
                    'entity'
                ]
            });

            vendorCreditSearch.run().each(function(result) {
                transactions.push({
                    recordType: 'vendorcredit',
                    recordId: result.id,
                    tranId: result.getValue('tranid'),
                    dateCreated: result.getValue('datecreated'),
                    entity: result.getText('entity')
                });
                return true;
            });

            // Search for journal entries
            var journalEntrySearch = search.create({
                type: 'journalentry',
                filters: [
                    ['datecreated', 'onorafter', cutoffDateString],
                    'AND',
                    ['custbody_ap_assist_processed', 'is', 'T'],
                    'AND',
                    ['custbody_ap_assist_validated', 'is', 'F']
                ],
                columns: [
                    'internalid',
                    'tranid',
                    'datecreated'
                ]
            });

            journalEntrySearch.run().each(function(result) {
                transactions.push({
                    recordType: 'journalentry',
                    recordId: result.id,
                    tranId: result.getValue('tranid'),
                    dateCreated: result.getValue('datecreated'),
                    entity: null
                });
                return true;
            });

            return transactions;
        }

        /**
         * Validates a single transaction using Claude API
         */
        function validateTransaction(recordType, recordId, tranId, apiKey, validationType, autoFlag) {
            var startTime = new Date().getTime();

            try {
                // Prepare transaction for validation
                var preparedData = transValidation.prepareTransactionForValidation(
                    recordType,
                    recordId,
                    {
                        validationType: validationType,
                        customRules: [
                            'Verify the transaction matches Marcone credit memo patterns',
                            'Check that NARDA numbers are properly captured',
                            'Ensure amounts are not rounded or truncated'
                        ]
                    }
                );

                // Build messages for Claude API
                // Include PDF if available (Claude supports PDF via document upload)
                var messages = [{
                    role: 'user',
                    content: preparedData.validationPrompt.userPrompt
                }];

                // Call Claude API
                log.debug('Calling Claude API for Validation', {
                    recordId: recordId,
                    tranId: tranId
                });

                var claudeResult = claudeAPI.callClaude({
                    apiKey: apiKey,
                    systemPrompt: preparedData.validationPrompt.systemPrompt,
                    userPrompt: preparedData.validationPrompt.userPrompt,
                    modelType: 'sonnet', // Use Sonnet for better reasoning
                    maxTokens: 4096,
                    enableCaching: true // Cache system prompt across calls
                });

                var endTime = new Date().getTime();
                var duration = endTime - startTime;

                if (claudeResult.success) {
                    // Parse Claude's response
                    var validationReport = claudeResult.analysis;
                    
                    // Determine pass/fail from response
                    var isPassed = validationReport.toLowerCase().indexOf('pass') !== -1 &&
                                   validationReport.toLowerCase().indexOf('approve') !== -1;
                    
                    var hasCriticalIssues = validationReport.toLowerCase().indexOf('critical') !== -1 ||
                                            validationReport.toLowerCase().indexOf('reject') !== -1;

                    // Flag transaction if issues found and auto-flag enabled
                    if (hasCriticalIssues && autoFlag) {
                        flagTransactionWithIssues(recordType, recordId, validationReport);
                    }

                    // Mark as validated
                    markAsValidated(recordType, recordId, isPassed, validationReport);

                    return {
                        success: true,
                        recordType: recordType,
                        recordId: recordId,
                        tranId: tranId,
                        isPassed: isPassed,
                        hasCriticalIssues: hasCriticalIssues,
                        validationReport: validationReport,
                        duration: duration,
                        model: claudeResult.model
                    };
                } else {
                    log.error('Claude API Failed', {
                        recordId: recordId,
                        error: claudeResult.error
                    });

                    return {
                        success: false,
                        recordType: recordType,
                        recordId: recordId,
                        tranId: tranId,
                        error: claudeResult.error,
                        duration: duration
                    };
                }

            } catch (e) {
                log.error('Validation Error', {
                    recordType: recordType,
                    recordId: recordId,
                    error: e.message,
                    stack: e.stack
                });

                return {
                    success: false,
                    recordType: recordType,
                    recordId: recordId,
                    tranId: tranId,
                    error: e.message
                };
            }
        }

        /**
         * Flags a transaction with validation issues
         */
        function flagTransactionWithIssues(recordType, recordId, validationReport) {
            try {
                var rec = record.load({
                    type: recordType,
                    id: recordId
                });

                // Set custom fields to flag the issue
                rec.setValue({
                    fieldId: 'custbody_ap_assist_validation_fail',
                    value: true
                });

                // Truncate validation report if too long for memo field
                var reportSnippet = validationReport.substring(0, 3000);
                
                rec.setValue({
                    fieldId: 'custbody_ap_assist_validation_notes',
                    value: reportSnippet
                });

                rec.save();

                log.audit('Transaction Flagged', {
                    recordType: recordType,
                    recordId: recordId,
                    reason: 'Validation issues found'
                });

            } catch (e) {
                log.error('Error Flagging Transaction', {
                    recordType: recordType,
                    recordId: recordId,
                    error: e.message
                });
            }
        }

        /**
         * Marks transaction as validated
         */
        function markAsValidated(recordType, recordId, isPassed, validationReport) {
            try {
                var rec = record.load({
                    type: recordType,
                    id: recordId,
                    isDynamic: false
                });

                rec.setValue({
                    fieldId: 'custbody_ap_assist_validated',
                    value: true
                });

                rec.setValue({
                    fieldId: 'custbody_ap_assist_validation_pass',
                    value: isPassed
                });

                rec.setValue({
                    fieldId: 'custbody_ap_assist_validation_date',
                    value: new Date()
                });

                rec.save();

            } catch (e) {
                log.error('Error Marking as Validated', {
                    recordType: recordType,
                    recordId: recordId,
                    error: e.message
                });
            }
        }

        /**
         * Generates summary report of validation results
         */
        function generateSummaryReport(validationResults) {
            var totalValidated = validationResults.length;
            var passed = 0;
            var failed = 0;
            var errors = 0;
            var criticalIssues = 0;

            validationResults.forEach(function(result) {
                if (!result.success) {
                    errors++;
                } else if (result.isPassed) {
                    passed++;
                } else {
                    failed++;
                }

                if (result.hasCriticalIssues) {
                    criticalIssues++;
                }
            });

            return {
                totalValidated: totalValidated,
                passed: passed,
                failed: failed,
                errors: errors,
                criticalIssues: criticalIssues,
                passRate: totalValidated > 0 ? ((passed / totalValidated) * 100).toFixed(1) + '%' : '0%'
            };
        }

        /**
         * Sends validation summary email
         */
        function sendValidationEmail(recipient, validationResults, summary) {
            try {
                var subject = 'AP Assist Transaction Validation Report - ' + 
                             new Date().toLocaleDateString();

                var body = 'AP Assist Transaction Validation Summary\n\n';
                body += '='.repeat(60) + '\n\n';
                body += 'Total Transactions Validated: ' + summary.totalValidated + '\n';
                body += 'Passed: ' + summary.passed + '\n';
                body += 'Failed: ' + summary.failed + '\n';
                body += 'Errors: ' + summary.errors + '\n';
                body += 'Critical Issues Found: ' + summary.criticalIssues + '\n';
                body += 'Pass Rate: ' + summary.passRate + '\n\n';
                body += '='.repeat(60) + '\n\n';

                // Add details for failed or critical transactions
                var hasIssues = false;
                validationResults.forEach(function(result) {
                    if (!result.success || result.hasCriticalIssues) {
                        hasIssues = true;
                        body += 'Transaction: ' + result.tranId + ' (ID: ' + result.recordId + ')\n';
                        body += 'Type: ' + result.recordType + '\n';
                        body += 'Status: ' + (result.success ? 'VALIDATED' : 'ERROR') + '\n';
                        
                        if (result.hasCriticalIssues) {
                            body += 'CRITICAL ISSUES FOUND\n';
                        }
                        
                        if (result.error) {
                            body += 'Error: ' + result.error + '\n';
                        }
                        
                        if (result.validationReport) {
                            body += 'Report: ' + result.validationReport.substring(0, 500) + '...\n';
                        }
                        
                        body += '\n' + '-'.repeat(60) + '\n\n';
                    }
                });

                if (!hasIssues) {
                    body += 'All transactions passed validation successfully!\n';
                }

                email.send({
                    author: -5, // NetSuite system
                    recipients: recipient,
                    subject: subject,
                    body: body
                });

                log.audit('Validation Email Sent', {
                    recipient: recipient
                });

            } catch (e) {
                log.error('Error Sending Email', {
                    error: e.message
                });
            }
        }

        return {
            execute: execute
        };
    }
);
