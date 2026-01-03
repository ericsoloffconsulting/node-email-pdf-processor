/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * 
 * AP Assist RETRY Claude API JSON to Marcone Bill Credits
 * 
 * Retries Claude API JSON extraction for PDFs that were poorly parsed initially.
 * 
 * Workflow:
 * 1. Load Marcone AP Assist Vendor Configuration (internal id 1)
 * 2. Scan PDF files in the retry folder (custrecord_ap_assist_pdf_retry_folder)
 * 3. For each PDF, send to Claude API using updated prompt
 * 4. Save JSON output to custrecord_ap_assist_json_folder_id
 * 5. Move processed PDF to custrecord_ap_asssist_pdf_folder_id
 * 
 * Use Case:
 * When initial JSON extraction produces poor results, manually modify the prompt
 * in the vendor config record, place the PDF in the retry folder, and run this script
 * to re-attempt extraction with the updated prompt.
 * 
 * Script Parameters:
 * - custscript_retry_claude_api_key (required) - Claude API key
 * - custscript_retry_config_id (optional) - Config record ID (default: 1 for Marcone)
 * - custscript_retry_max_files (optional) - Max files per execution (default: 10)
 * 
 * Deployment:
 * - Suggested frequency: On-demand or Daily
 * - Can be triggered manually when PDFs are placed in retry folder
 */

define(['N/search', 'N/record', 'N/runtime', 'N/log', 'N/file', 'N/encode',
        '../ericsoloffconsulting/lib/claude_api_library'],
    function(search, record, runtime, log, file, encode, claudeAPI) {

        /**
         * Main execution function
         */
        function execute(context) {
            try {
                log.audit('Starting AP Assist Retry Process', 'Retrying Claude API JSON extraction');

                // Get script parameters
                var script = runtime.getCurrentScript();
                var apiKey = claudeAPI.getApiKeyFromScriptParams(runtime, 'custscript_retry_claude_api_key');
                
                if (!apiKey) {
                    log.error('Configuration Error', 'Claude API key not configured');
                    return;
                }

                var configId = script.getParameter({
                    name: 'custscript_retry_config_id'
                }) || '1'; // Default to Marcone config

                var maxFiles = script.getParameter({
                    name: 'custscript_retry_max_files'
                }) || 10;

                log.debug('Configuration', {
                    configId: configId,
                    maxFiles: maxFiles
                });

                // Load AP Assist Vendor Configuration
                var config = loadVendorConfig(configId);
                
                if (!config) {
                    log.error('Configuration Error', 'Failed to load vendor config ID: ' + configId);
                    return;
                }

                log.audit('Config Loaded', {
                    vendorName: config.vendorName,
                    retryFolder: config.retryFolderId,
                    jsonFolder: config.jsonFolderId,
                    pdfFolder: config.pdfFolderId
                });

                // Validate folders are configured
                if (!config.retryFolderId || !config.jsonFolderId || !config.pdfFolderId) {
                    log.error('Configuration Error', 'Required folder IDs not configured in vendor config');
                    return;
                }

                // Find PDF files in retry folder
                var pdfFiles = findPDFsInRetryFolder(config.retryFolderId, maxFiles);

                log.audit('PDFs Found in Retry Folder', {
                    count: pdfFiles.length,
                    folderId: config.retryFolderId
                });

                if (pdfFiles.length === 0) {
                    log.audit('No Files to Process', 'Retry folder is empty');
                    return;
                }

                // Process each PDF
                var processedCount = 0;
                var errorCount = 0;

                for (var i = 0; i < pdfFiles.length; i++) {
                    var pdfFile = pdfFiles[i];

                    // Check governance
                    var remainingUsage = script.getRemainingUsage();
                    if (remainingUsage < 200) {
                        log.debug('Low Governance', 'Pausing - will continue in next execution. Processed: ' + processedCount);
                        break;
                    }

                    log.audit('Processing PDF ' + (i + 1) + ' of ' + pdfFiles.length, {
                        fileId: pdfFile.id,
                        filename: pdfFile.name
                    });

                    try {
                        var result = processPDFFile(
                            pdfFile,
                            config,
                            apiKey
                        );

                        if (result.success) {
                            processedCount++;
                            log.audit('PDF Processed Successfully', {
                                fileId: pdfFile.id,
                                filename: pdfFile.name,
                                jsonFileId: result.jsonFileId
                            });
                        } else {
                            errorCount++;
                            log.error('PDF Processing Failed', {
                                fileId: pdfFile.id,
                                filename: pdfFile.name,
                                error: result.error
                            });
                        }

                    } catch (e) {
                        errorCount++;
                        log.error('Exception Processing PDF', {
                            fileId: pdfFile.id,
                            filename: pdfFile.name,
                            error: e.message,
                            stack: e.stack
                        });
                    }
                }

                log.audit('Retry Process Complete', {
                    totalFiles: pdfFiles.length,
                    processed: processedCount,
                    errors: errorCount
                });

            } catch (e) {
                log.error('Script Error', {
                    error: e.message,
                    stack: e.stack
                });
            }
        }

        /**
         * Loads AP Assist Vendor Configuration record
         */
        function loadVendorConfig(configId) {
            try {
                var configRecord = record.load({
                    type: 'customrecord_ap_assist_vend_config',
                    id: configId
                });

                return {
                    id: configId,
                    vendorId: configRecord.getValue('custrecord_ap_assist_vendor'),
                    vendorName: configRecord.getText('custrecord_ap_assist_vendor'),
                    transactionType: configRecord.getValue('custrecord_ap_assist_transaction_type'),
                    aiPrompt: configRecord.getValue('custrecord_ap_assist_ai_prompt'),
                    retryFolderId: configRecord.getValue('custrecord_ap_assist_pdf_retry_folder'),
                    jsonFolderId: configRecord.getValue('custrecord_ap_assist_json_folder_id'),
                    pdfFolderId: configRecord.getValue('custrecord_ap_asssist_pdf_folder_id')
                };

            } catch (e) {
                log.error('Error Loading Config', {
                    configId: configId,
                    error: e.message
                });
                return null;
            }
        }

        /**
         * Finds PDF files in the retry folder
         */
        function findPDFsInRetryFolder(retryFolderId, maxFiles) {
            var pdfFiles = [];

            var fileSearch = search.create({
                type: 'file',
                filters: [
                    ['folder', 'is', retryFolderId],
                    'AND',
                    ['filetype', 'is', 'PDF']
                ],
                columns: [
                    'internalid',
                    'name',
                    'created',
                    'documentsize'
                ]
            });

            var searchResults = fileSearch.run().getRange({
                start: 0,
                end: maxFiles
            });

            searchResults.forEach(function(result) {
                pdfFiles.push({
                    id: result.id,
                    name: result.getValue('name'),
                    created: result.getValue('created'),
                    filesize: result.getValue('documentsize')
                });
            });

            return pdfFiles;
        }

        /**
         * Processes a single PDF file - sends to Claude, saves JSON, moves PDF
         */
        function processPDFFile(pdfFile, config, apiKey) {
            var startTime = new Date().getTime();

            try {
                // Load the PDF file
                var pdfFileObj = file.load({
                    id: pdfFile.id
                });

                // Convert PDF to base64
                var pdfBase64 = pdfFileObj.getContents();

                log.debug('PDF Loaded', {
                    fileId: pdfFile.id,
                    filename: pdfFile.name,
                    size: pdfFileObj.size
                });

                // Build system prompt for Claude
                var systemPrompt = 'You are a data extraction expert. Extract structured JSON data from the provided PDF document. ' +
                    'Follow the specific instructions provided in the user prompt carefully.';

                // Build user prompt with the configured AI prompt
                var userPrompt = config.aiPrompt || 
                    'Extract all relevant data from this PDF and return as structured JSON.';

                log.debug('Calling Claude API', {
                    modelType: 'haiku',
                    promptLength: userPrompt.length,
                    pdfSize: pdfBase64.length
                });

                // Call Claude API with PDF document
                // Format message with both PDF document and text prompt
                var messages = [{
                    role: 'user',
                    content: [
                        {
                            type: 'document',
                            source: {
                                type: 'base64',
                                media_type: 'application/pdf',
                                data: pdfBase64
                            }
                        },
                        {
                            type: 'text',
                            text: userPrompt
                        }
                    ]
                }];

                var claudeResult = claudeAPI.callClaude({
                    apiKey: apiKey,
                    systemPrompt: systemPrompt,
                    messages: messages,
                    modelType: 'haiku',
                    maxTokens: 4096,
                    enableCaching: false
                });

                var endTime = new Date().getTime();
                var duration = endTime - startTime;

                if (!claudeResult.success) {
                    return {
                        success: false,
                        error: claudeResult.error,
                        duration: duration
                    };
                }

                log.audit('Claude API Success', {
                    model: claudeResult.model,
                    duration: duration + 'ms'
                });

                // Parse JSON from Claude's response
                var extractedData = parseJSONFromResponse(claudeResult.analysis);

                if (!extractedData) {
                    return {
                        success: false,
                        error: 'Failed to parse JSON from Claude response'
                    };
                }

                // Append retry metadata to extracted data
                extractedData._retryMetadata = {
                    processType: 'AP_ASSIST_RETRY',
                    retryTimestamp: new Date().toISOString(),
                    originalPdfFileId: pdfFile.id,
                    originalPdfFileName: pdfFile.name,
                    configId: config.id,
                    vendorName: config.vendorName,
                    claudeModel: claudeResult.model,
                    processingDuration: duration + 'ms',
                    inputTokens: claudeResult.usage ? claudeResult.usage.input_tokens : null,
                    outputTokens: claudeResult.usage ? claudeResult.usage.output_tokens : null,
                    retryReason: 'Manual retry - poor initial JSON extraction'
                };

                // Save JSON file
                var baseName = pdfFile.name.replace(/\.pdf$/i, '');
                var jsonFilename = baseName + '.json';

                var jsonFile = file.create({
                    name: jsonFilename,
                    fileType: file.Type.JSON,
                    contents: JSON.stringify(extractedData, null, 2),
                    folder: config.jsonFolderId,
                    isOnline: false
                });

                var jsonFileId = jsonFile.save();

                log.audit('JSON File Saved', {
                    fileId: jsonFileId,
                    filename: jsonFilename,
                    folder: config.jsonFolderId
                });

                // Move PDF from retry folder to processed folder
                var movedPdfId = movePDFToProcessedFolder(pdfFile.id, config.pdfFolderId);

                log.audit('PDF Moved to Processed Folder', {
                    originalId: pdfFile.id,
                    newId: movedPdfId,
                    folder: config.pdfFolderId
                });

                return {
                    success: true,
                    jsonFileId: jsonFileId,
                    movedPdfId: movedPdfId,
                    extractedData: extractedData,
                    duration: duration
                };

            } catch (e) {
                log.error('Error Processing PDF', {
                    fileId: pdfFile.id,
                    error: e.message,
                    stack: e.stack
                });

                return {
                    success: false,
                    error: e.message
                };
            }
        }

        /**
         * Parses JSON from Claude's response text
         * Handles various formats (plain JSON, markdown code blocks, etc.)
         */
        function parseJSONFromResponse(responseText) {
            try {
                // Try direct parse first
                try {
                    return JSON.parse(responseText);
                } catch (e) {
                    // Continue to other parsing methods
                }

                // Try extracting from markdown code blocks
                var jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[1]);
                }

                // Try finding JSON object in text
                var objectMatch = responseText.match(/\{[\s\S]*\}/);
                if (objectMatch) {
                    return JSON.parse(objectMatch[0]);
                }

                log.error('JSON Parse Failed', 'Could not extract valid JSON from Claude response');
                return null;

            } catch (e) {
                log.error('JSON Parse Error', {
                    error: e.message,
                    responseSnippet: responseText.substring(0, 500)
                });
                return null;
            }
        }

        /**
         * Moves PDF file to processed folder
         */
        function movePDFToProcessedFolder(fileId, targetFolderId) {
            try {
                var pdfFileObj = file.load({
                    id: fileId
                });

                // Update folder
                pdfFileObj.folder = targetFolderId;
                
                var newFileId = pdfFileObj.save();

                return newFileId;

            } catch (e) {
                log.error('Error Moving PDF', {
                    fileId: fileId,
                    targetFolder: targetFolderId,
                    error: e.message
                });
                
                // Return original ID if move failed
                return fileId;
            }
        }

        return {
            execute: execute
        };
    }
);
