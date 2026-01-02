/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 */

/**
 * Marcone PDF Receiver RESTlet
 * 
 * Receives PDFs and extracted JSON data from external email processor (Node.js)
 * Saves files to NetSuite File Cabinet for processing by scheduled script
 * 
 * Deployment:
 * 1. Save this script to File Cabinet
 * 2. Create Script Record: Customization > Scripting > Scripts > New
 * 3. Deploy Script: Set status to Testing/Released
 * 4. Copy RESTlet URL and add to Node.js .env file
 * 
 * Required Script Parameters:
 * - custscript_marcone_pdf_folder (File Cabinet folder for PDFs)
 * - custscript_marcone_json_folder (File Cabinet folder for JSON)
 */

define(['N/file', 'N/log', 'N/encode', 'N/runtime'], function(file, log, encode, runtime) {
    
    /**
     * POST handler - receives PDF + extracted data from Node.js
     * 
     * Expected payload:
     * {
     *   pdfBase64: "JVBERi0xLjQK...",
     *   pdfFilename: "marcone_67718694.pdf",
     *   emailSubject: "Credit Memo from Marcone",
     *   extractedData: { invoiceNumber: "67718694", ... },
     *   processedDate: "2026-01-01T12:00:00.000Z",
     *   pdfFolderId: "12345" (optional - overrides script parameter),
     *   jsonFolderId: "12346" (optional - overrides script parameter)
     * }
     */
    function post(requestBody) {
        var startTime = new Date().getTime();
        
        try {
            log.audit('RESTlet Invoked', 'Received PDF upload request');
            
            // Get script parameters (fallback defaults)
            var script = runtime.getCurrentScript();
            var defaultPdfFolderId = script.getParameter({
                name: 'custscript_marcone_pdf_folder'
            });
            var defaultJsonFolderId = script.getParameter({
                name: 'custscript_marcone_json_folder'
            });
            
            // Use folder IDs from request payload OR fall back to script parameters
            var pdfFolderId = requestBody.pdfFolderId || defaultPdfFolderId;
            var jsonFolderId = requestBody.jsonFolderId || defaultJsonFolderId;
            
            // Validate parameters
            if (!pdfFolderId || !jsonFolderId) {
                log.error('Missing Configuration', 'PDF or JSON folder ID not configured');
                return {
                    success: false,
                    error: 'Folder IDs not provided. Set pdfFolderId/jsonFolderId in request or configure script parameters'
                };
            }
            
            log.audit('Folder Configuration', {
                pdfFolderId: pdfFolderId,
                jsonFolderId: jsonFolderId,
                source: requestBody.pdfFolderId ? 'request payload' : 'script parameters'
            });
            
            // Validate request body
            if (!requestBody || !requestBody.pdfBase64 || !requestBody.pdfFilename) {
                log.error('Invalid Request', 'Missing required fields: pdfBase64, pdfFilename');
                return {
                    success: false,
                    error: 'Missing required fields: pdfBase64 and pdfFilename'
                };
            }
            
            log.audit('Request Validated', {
                filename: requestBody.pdfFilename,
                hasExtractedData: !!requestBody.extractedData,
                pdfSize: requestBody.pdfBase64.length
            });
            
            // Decode PDF from base64
            var pdfBinary = encode.convert({
                string: requestBody.pdfBase64,
                inputEncoding: encode.Encoding.BASE_64,
                outputEncoding: encode.Encoding.HEX
            });
            
            // Create unique filename with timestamp
            var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            var baseName = requestBody.pdfFilename.replace(/\.pdf$/i, '');
            var pdfFilename = timestamp + '_' + baseName + '.pdf';
            
            // Save PDF file
            var pdfFile = file.create({
                name: pdfFilename,
                fileType: file.Type.PDF,
                contents: pdfBinary,
                encoding: file.Encoding.HEX,
                folder: pdfFolderId,
                isOnline: false
            });
            
            var pdfFileId = pdfFile.save();
            log.audit('PDF Saved', {
                fileId: pdfFileId,
                filename: pdfFilename,
                folder: pdfFolderId
            });
            
            // Save JSON data if provided
            var jsonFileId = null;
            if (requestBody.extractedData) {
                var jsonContent = JSON.stringify(requestBody.extractedData, null, 2);
                var jsonFilename = timestamp + '_' + baseName + '.json';
                
                var jsonFile = file.create({
                    name: jsonFilename,
                    fileType: file.Type.JSON,
                    contents: jsonContent,
                    folder: jsonFolderId,
                    isOnline: false
                });
                
                jsonFileId = jsonFile.save();
                log.audit('JSON Saved', {
                    fileId: jsonFileId,
                    filename: jsonFilename,
                    folder: jsonFolderId,
                    invoiceNumber: requestBody.extractedData.invoiceNumber || 'N/A'
                });
            }
            
            var endTime = new Date().getTime();
            var duration = endTime - startTime;
            
            log.audit('Upload Complete', {
                pdfFileId: pdfFileId,
                jsonFileId: jsonFileId,
                duration: duration + 'ms'
            });
            
            // Return success response
            return {
                success: true,
                pdfFileId: pdfFileId,
                jsonFileId: jsonFileId,
                pdfFilename: pdfFilename,
                message: 'Files uploaded successfully',
                duration: duration
            };
            
        } catch (e) {
            log.error('Upload Failed', {
                error: e.message,
                stack: e.stack,
                filename: requestBody ? requestBody.pdfFilename : 'unknown'
            });
            
            return {
                success: false,
                error: e.message,
                details: e.stack
            };
        }
    }
    
    /**
     * GET handler - for testing/health check
     */
    function get(requestParams) {
        log.audit('Health Check', 'GET request received');
        
        var script = runtime.getCurrentScript();
        var pdfFolderId = script.getParameter({
            name: 'custscript_marcone_pdf_folder'
        });
        var jsonFolderId = script.getParameter({
            name: 'custscript_marcone_json_folder'
        });
        
        return {
            status: 'active',
            scriptId: script.id,
            deploymentId: script.deploymentId,
            configuration: {
                pdfFolder: pdfFolderId || 'NOT CONFIGURED',
                jsonFolder: jsonFolderId || 'NOT CONFIGURED'
            },
            message: 'Marcone PDF Receiver RESTlet is active. Use POST to upload files.'
        };
    }
    
    return {
        post: post,
        get: get
    };
});
