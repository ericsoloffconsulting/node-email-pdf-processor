/**
 * Email PDF Processor
 *
 * Node.js script that polls an IMAP email server for new emails with PDF attachments,
 * then sends those PDFs to Claude API for processing and analysis.
 *
 * Features:
 * - IMAP email polling with configurable interval
 * - PDF attachment extraction
 * - Direct PDF processing with Claude API (supports base64 PDFs natively)
 * - Email marking as read/processed
 * - Detailed logging
 *
 * Setup:
 * 1. npm install imap mailparser @anthropic-ai/sdk dotenv
 * 2. Create .env file with your credentials (see .env.example)
 * 3. Run: node email-poller.js
 */

require('dotenv').config();
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const axios = require('axios');

// Email Processor Rules - Loaded dynamically from NetSuite (or fallback to hardcoded)
// Will be populated by fetchNetSuiteConfigs() on startup and every 10 minutes
let EMAIL_PROCESSORS = [
  {
    name: 'marcone_credits',
    enabled: process.env.MARCONE_ENABLED !== 'false',
    criteria: {
      from: 'no-replies@marcone.com',
      subjectContains: 'Credits processed by Marcone for 2684000'
    },
    netsuite: {
      pdfFolderId: process.env.MARCONE_PDF_FOLDER_ID,
      jsonFolderId: process.env.MARCONE_JSON_FOLDER_ID
    },
    claudePrompt: 'marcone' // Special identifier for Marcone prompt
  }
  // More processors will be loaded from NetSuite AP Assist Vendor Configuration records
];

// Configuration from environment variables
const CONFIG = {
  // IMAP Settings
  imap: {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT || '993'),
    tls: process.env.IMAP_TLS !== 'false',
    tlsOptions: { rejectUnauthorized: false }
  },

  // Claude API Settings
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
    maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '4096')
  },

  // Processing Settings
  polling: {
    intervalMs: parseInt(process.env.POLL_INTERVAL_MS || '60000'), // Check every 60 seconds
    markAsRead: process.env.MARK_AS_READ !== 'false',
    mailbox: process.env.IMAP_MAILBOX || 'INBOX',
    searchCriteria: process.env.SEARCH_CRITERIA || 'UNSEEN' // UNSEEN, ALL, or custom
  },

  // Output Settings
  output: {
    saveProcessedPdfs: process.env.SAVE_PDFS === 'true',
    outputDir: process.env.OUTPUT_DIR || './processed-pdfs',
    saveResults: process.env.SAVE_RESULTS === 'true',
    resultsDir: process.env.RESULTS_DIR || './results'
  },

  // NetSuite Integration Settings (global fallback)
  netsuite: {
    enabled: process.env.NETSUITE_ENABLED === 'true',
    restletUrl: process.env.NETSUITE_RESTLET_URL,
    accountId: process.env.NETSUITE_ACCOUNT_ID,
    consumerKey: process.env.NETSUITE_CONSUMER_KEY,
    consumerSecret: process.env.NETSUITE_CONSUMER_SECRET,
    tokenId: process.env.NETSUITE_TOKEN_ID,
    tokenSecret: process.env.NETSUITE_TOKEN_SECRET,
    // Default fallback folder IDs
    defaultPdfFolderId: process.env.NETSUITE_PDF_FOLDER_ID,
    defaultJsonFolderId: process.env.NETSUITE_JSON_FOLDER_ID
  },

  // Email processors
  processors: EMAIL_PROCESSORS
};

// Initialize Claude API client
const anthropic = new Anthropic({
  apiKey: CONFIG.claude.apiKey
});

/**
 * Validates configuration and checks for missing required values
 */
function validateConfig() {
  const required = {
    'IMAP_USER': CONFIG.imap.user,
    'IMAP_PASSWORD': CONFIG.imap.password,
    'IMAP_HOST': CONFIG.imap.host,
    'ANTHROPIC_API_KEY': CONFIG.claude.apiKey
  };

  const missing = Object.entries(required)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  console.log('✓ Configuration validated');
  
  // Log enabled processors
  const enabledProcessors = CONFIG.processors.filter(p => p.enabled);
  if (enabledProcessors.length > 0) {
    console.log(`✓ ${enabledProcessors.length} email processor(s) enabled:`);
    enabledProcessors.forEach(p => {
      console.log(`   - ${p.name}: FROM "${p.criteria.from}" + SUBJECT contains "${p.criteria.subjectContains}"`);
    });
  }
}

/**
 * Fetch AP Assist processor configurations from NetSuite
 * Updates EMAIL_PROCESSORS array dynamically
 */
async function fetchNetSuiteConfigs() {
  if (!CONFIG.netsuite.enabled || !CONFIG.netsuite.restletUrl) {
    console.log('⚠️  NetSuite config fetching disabled (NETSUITE_ENABLED=false or no RESTLET_URL)');
    return;
  }

  try {
    console.log('🔄 Fetching processor configs from NetSuite...');

    // Create OAuth signature for GET request
    const oauth = OAuth({
      consumer: {
        key: CONFIG.netsuite.consumerKey,
        secret: CONFIG.netsuite.consumerSecret
      },
      signature_method: 'HMAC-SHA256',
      hash_function(base_string, key) {
        return crypto.createHmac('sha256', key).update(base_string).digest('base64');
      }
    });

    const token = {
      key: CONFIG.netsuite.tokenId,
      secret: CONFIG.netsuite.tokenSecret
    };

    const requestData = {
      url: CONFIG.netsuite.restletUrl + '&action=configs',
      method: 'GET'
    };

    const authHeader = oauth.toHeader(oauth.authorize(requestData, token));
    authHeader.Authorization += ',realm="' + CONFIG.netsuite.accountId + '"';

    // Make GET request to fetch configs
    const response = await axios.get(requestData.url, {
      headers: {
        'Authorization': authHeader.Authorization,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success && response.data.configs && response.data.configs.length > 0) {
      // Convert NetSuite configs to EMAIL_PROCESSORS format
      const newProcessors = response.data.configs.map(config => ({
        name: config.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        enabled: true,
        criteria: {
          from: config.emailFrom,
          subjectContains: config.emailSubjectContains
        },
        netsuite: {
          pdfFolderId: config.pdfFolderId,
          jsonFolderId: config.jsonFolderId
        },
        claudePrompt: config.claudePrompt || 'marcone', // Use custom prompt or fallback
        configId: config.id,
        vendor: config.vendor,
        transactionType: config.transactionType
      }));

      // Update global EMAIL_PROCESSORS array
      EMAIL_PROCESSORS = newProcessors;
      CONFIG.processors = EMAIL_PROCESSORS;

      console.log('✅ Loaded ' + newProcessors.length + ' processor config(s) from NetSuite:');
      newProcessors.forEach(p => {
        console.log('   - ' + p.name + ': FROM "' + p.criteria.from + '" + SUBJECT contains "' + p.criteria.subjectContains + '"');
        if (p.claudePrompt && p.claudePrompt !== 'marcone') {
          console.log('     └─ Custom Claude prompt: ' + p.claudePrompt.substring(0, 50) + '...');
        }
      });
    } else {
      console.log('⚠️  No enabled processor configs found in NetSuite, using hardcoded defaults');
    }
  } catch (error) {
    console.error('❌ Failed to fetch NetSuite configs:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
    }
    console.log('   → Continuing with existing processor configurations');
  }
}

/**
 * Match email against processor rules
 * @param {Object} email - Parsed email object with from/subject
 * @returns {Object|null} Matching processor or null
 */
function matchEmailProcessor(email) {
  const fromAddress = email.from?.text?.toLowerCase() || email.from?.value?.[0]?.address?.toLowerCase() || '';
  const subject = email.subject || '';
  
  for (const processor of CONFIG.processors) {
    if (!processor.enabled) continue;
    
    const fromMatches = fromAddress.includes(processor.criteria.from.toLowerCase());
    const subjectMatches = subject.includes(processor.criteria.subjectContains);
    
    if (fromMatches && subjectMatches) {
      console.log(`  ✓ Matched processor: ${processor.name}`);
      return processor;
    }
  }
  
  console.log(`  ⚠️  No matching processor for FROM: ${fromAddress}, SUBJECT: ${subject}`);
  return null;
}

/**
 * Validates that all line items have 8-digit original bill numbers
 */
function validateBillNumbers(extractedData) {
  if (!extractedData || !extractedData.lineItems || !Array.isArray(extractedData.lineItems)) {
    return { valid: true }; // No line items to validate
  }

  const invalidItems = [];
  
  for (let i = 0; i < extractedData.lineItems.length; i++) {
    const item = extractedData.lineItems[i];
    const billNumber = item.originalBillNumber;
    
    if (!billNumber || billNumber.length !== 8 || !/^\d{8}$/.test(billNumber)) {
      invalidItems.push({
        index: i,
        narda: item.nardaNumber,
        billNumber: billNumber || '(empty)',
        length: billNumber ? billNumber.length : 0
      });
    }
  }

  if (invalidItems.length > 0) {
    const details = invalidItems.map(item => 
      `Line ${item.index + 1} (NARDA: ${item.narda}): "${item.billNumber}" is ${item.length} digits (need 8)`
    ).join('; ');
    
    return {
      valid: false,
      reason: `Invalid bill numbers found: ${details}`,
      invalidItems
    };
  }

  return { valid: true };
}

/**
 * Processes a PDF with Claude API
 *
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @param {string} filename - Name of the PDF file
 * @param {string} emailSubject - Subject of the email containing the PDF
 * @param {string} customPrompt - Optional custom prompt for processing
 * @returns {Promise<Object>} Claude's analysis result
 */
async function processPdfWithClaude(pdfBuffer, filename, emailSubject, customPrompt = null) {
  console.log(`  📄 Processing PDF with Claude: ${filename} (${(pdfBuffer.length / 1024).toFixed(2)} KB)`);

  // CRITICAL: Prompt must be provided from NetSuite configuration
  if (!customPrompt) {
    console.error('❌ CRITICAL ERROR: No Claude prompt provided for processing!');
    console.error('   File:', filename);
    console.error('   This PDF cannot be processed without a valid prompt.');
    console.error('   Check NetSuite AP Assist Vendor Configuration record.');
    return {
      success: false,
      error: 'NO_PROMPT_CONFIGURED',
      message: 'Claude prompt is missing from processor configuration. Update NetSuite AP Assist Vendor Configuration record.',
      filename,
      emailSubject
    };
  }

  // Convert PDF to base64
  const pdfBase64 = pdfBuffer.toString('base64');

  // Use prompt from NetSuite configuration
  const prompt = customPrompt + `\n\nDocument: ${filename}`;

  console.log(`  ✓ Using Claude prompt from NetSuite configuration (${customPrompt.length} characters)`);

  try {
    // Create message with PDF attachment
    // Claude API supports PDFs natively - no need to convert to JSON!
    const message = await anthropic.messages.create({
      model: CONFIG.claude.model,
      max_tokens: CONFIG.claude.maxTokens,
      messages: [
        {
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
              text: prompt
            }
          ]
        }
      ]
    });

    // Extract text response
    const analysis = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    console.log(`  ✓ Analysis complete (${message.usage.input_tokens} in / ${message.usage.output_tokens} out tokens)`);

    return {
      success: true,
      analysis,
      filename,
      emailSubject,
      model: message.model,
      usage: message.usage,
      stopReason: message.stop_reason
    };

  } catch (error) {
    console.error(`  ✗ Error processing PDF with Claude:`, error.message);
    return {
      success: false,
      error: error.message,
      filename,
      emailSubject
    };
  }
}

/**
 * Saves processed PDF to disk
 */
async function savePdf(buffer, filename, emailSubject) {
  if (!CONFIG.output.saveProcessedPdfs) return;

  await fs.mkdir(CONFIG.output.outputDir, { recursive: true });

  // Sanitize filename
  const sanitized = filename.replace(/[^a-z0-9.-]/gi, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fullPath = path.join(CONFIG.output.outputDir, `${timestamp}_${sanitized}`);

  await fs.writeFile(fullPath, buffer);
  console.log(`  💾 Saved PDF to: ${fullPath}`);
}

/**
 * Saves analysis results to disk
 */
async function saveResult(result) {
  if (!CONFIG.output.saveResults) return;

  await fs.mkdir(CONFIG.output.resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `analysis_${timestamp}.json`;
  const fullPath = path.join(CONFIG.output.resultsDir, filename);

  await fs.writeFile(fullPath, JSON.stringify(result, null, 2));
  console.log(`  💾 Saved analysis to: ${fullPath}`);
}

/**
 * Uploads PDF and extracted data to NetSuite via RESTlet
 */
async function uploadToNetSuite(pdfBuffer, filename, extractedData, emailSubject, folderIds = null) {
  if (!CONFIG.netsuite.enabled) {
    console.log('  ℹ️  NetSuite upload disabled (set NETSUITE_ENABLED=true to enable)');
    return { success: false, reason: 'disabled' };
  }

  try {
    console.log('  📤 Uploading to NetSuite RESTlet...');

    // Use processor-specific folder IDs or fall back to defaults
    const pdfFolderId = folderIds?.pdfFolderId || CONFIG.netsuite.defaultPdfFolderId;
    const jsonFolderId = folderIds?.jsonFolderId || CONFIG.netsuite.defaultJsonFolderId;
    
    if (pdfFolderId) {
      console.log(`    PDF Folder ID: ${pdfFolderId}`);
    }
    if (jsonFolderId) {
      console.log(`    JSON Folder ID: ${jsonFolderId}`);
    }

    // Create OAuth 1.0a signature
    const oauth = OAuth({
      consumer: {
        key: CONFIG.netsuite.consumerKey,
        secret: CONFIG.netsuite.consumerSecret
      },
      signature_method: 'HMAC-SHA256',
      hash_function(base_string, key) {
        return crypto
          .createHmac('sha256', key)
          .update(base_string)
          .digest('base64');
      }
    });

    const token = {
      key: CONFIG.netsuite.tokenId,
      secret: CONFIG.netsuite.tokenSecret
    };

    const requestData = {
      url: CONFIG.netsuite.restletUrl,
      method: 'POST'
    };

    const authHeader = oauth.toHeader(oauth.authorize(requestData, token));
    authHeader.Authorization += ', realm="' + CONFIG.netsuite.accountId + '"';

    // Prepare payload with folder IDs
    const payload = {
      pdfBase64: pdfBuffer.toString('base64'),
      pdfFilename: filename,
      emailSubject: emailSubject,
      extractedData: extractedData,
      processedDate: new Date().toISOString(),
      pdfFolderId: pdfFolderId,
      jsonFolderId: jsonFolderId
    };

    // Send to NetSuite
    const response = await axios.post(CONFIG.netsuite.restletUrl, payload, {
      headers: {
        ...authHeader,
        'Content-Type': 'application/json'
      },
      timeout: 60000 // 60 second timeout
    });

    console.log(`  ✓ Uploaded to NetSuite successfully`);
    console.log(`    PDF File ID: ${response.data.pdfFileId || 'N/A'}`);
    console.log(`    JSON File ID: ${response.data.jsonFileId || 'N/A'}`);

    return {
      success: true,
      pdfFileId: response.data.pdfFileId,
      jsonFileId: response.data.jsonFileId,
      response: response.data
    };

  } catch (error) {
    console.error(`  ✗ NetSuite upload failed:`, error.message);
    if (error.response) {
      console.error(`    Status: ${error.response.status}`);
      console.error(`    Data:`, error.response.data);
    }
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Saves analysis results to disk
 */
async function processEmail(seqno, imap) {
  return new Promise((resolve, reject) => {
    const fetch = imap.fetch(seqno, {
      bodies: '',
      struct: true,
      markSeen: CONFIG.polling.markAsRead
    });

    fetch.on('message', (msg, seqno) => {
      console.log(`\n📧 Processing email #${seqno}`);

      msg.on('body', async (stream, info) => {
        try {
          // Parse the email
          const parsed = await simpleParser(stream);

          console.log(`  From: ${parsed.from?.text || 'Unknown'}`);
          console.log(`  Subject: ${parsed.subject || 'No Subject'}`);
          console.log(`  Date: ${parsed.date || 'Unknown'}`);

          // Match email against processor rules
          const processor = matchEmailProcessor(parsed);
          
          if (!processor) {
            console.log('  ⏭️  Skipping - no matching processor for this email');
            return;
          }

          // Check for PDF attachments
          if (!parsed.attachments || parsed.attachments.length === 0) {
            console.log('  ℹ️  No attachments found');
            return;
          }

          const pdfAttachments = parsed.attachments.filter(
            att => att.contentType === 'application/pdf'
          );

          if (pdfAttachments.length === 0) {
            console.log(`  ℹ️  Found ${parsed.attachments.length} attachment(s), but no PDFs`);
            return;
          }

          console.log(`  📎 Found ${pdfAttachments.length} PDF attachment(s)`);

          // Process PDFs with batch concurrency (optimized for API rate limits)
          const BATCH_SIZE = 3; // Process 3 PDFs concurrently (reduced to avoid rate limits)
          const BATCH_DELAY_MS = 5000; // 5 second delay between batches
          const RETRY_ATTEMPTS = 3; // Retry failed PDFs up to 3 times
          let processedCount = 0;
          let successCount = 0;
          let failCount = 0;

          // Function to process a single PDF with retry logic
          const processSinglePdf = async (pdf, index, retryCount = 0) => {
            try {
              console.log(`  [${index + 1}/${pdfAttachments.length}] Processing: ${pdf.filename}`);

              // Save PDF if configured
              await savePdf(pdf.content, pdf.filename, parsed.subject);

              // Process with Claude using processor's custom prompt
              const result = await processPdfWithClaude(
                pdf.content,
                pdf.filename,
                parsed.subject || 'No Subject',
                processor.claudePrompt // Use NetSuite prompt if available
              );

              if (result.success) {
                console.log(`  ✓ [${index + 1}/${pdfAttachments.length}] Claude analysis complete for ${pdf.filename}`);

                // Parse JSON from Claude response
                let extractedData = null;
                let renamedFilename = pdf.filename; // Track potentially renamed filename
                
                try {
                  let jsonStr = result.analysis;
                  if (jsonStr.includes('```json')) {
                    const startIdx = jsonStr.indexOf('```json') + 7;
                    const endIdx = jsonStr.indexOf('```', startIdx);
                    jsonStr = jsonStr.substring(startIdx, endIdx).trim();
                  }
                  extractedData = JSON.parse(jsonStr);
                  console.log(`  ✓ Parsed JSON: Invoice ${extractedData.invoiceNumber || 'N/A'}`);
                  
                  // Rename PDF file to invoice number if available
                  if (extractedData.invoiceNumber) {
                    const originalExt = path.extname(pdf.filename);
                    renamedFilename = extractedData.invoiceNumber + originalExt;
                    console.log(`  ✓ Renamed PDF: ${pdf.filename} → ${renamedFilename}`);
                  } else {
                    console.log(`  ℹ️  No invoice number found, keeping original filename: ${pdf.filename}`);
                  }
                  
                  // Validate original bill numbers are 8 digits
                  const validationResult = validateBillNumbers(extractedData);
                  if (!validationResult.valid && retryCount === 0) {
                    console.log(`  ⚠️  Bill number validation failed: ${validationResult.reason}`);
                    console.log(`  🔄 Retrying with enhanced prompt (attempt 2/2)...`);
                    
                    // Retry once with enhanced prompt focusing on bill numbers
                    const retryPrompt = `CRITICAL: Previous extraction had invalid bill numbers.\n\n${validationResult.reason}\n\nPlease re-analyze this PDF and extract EXACTLY 8-digit bill numbers for each line item.\nRemember: Bill numbers are embedded in the Description column (look for N or W followed by 8 digits).\nIf the number spans multiple lines, concatenate to get exactly 8 digits total.\n\nAll line items MUST have valid 8-digit original bill numbers.\n\n` + createExtractionPrompt(pdf.filename);
                    
                    const retryResult = await processPdfWithClaude(
                      pdf.content,
                      pdf.filename,
                      parsed.subject || 'No Subject',
                      retryPrompt
                    );
                    
                    if (retryResult.success) {
                      let retryJsonStr = retryResult.analysis;
                      if (retryJsonStr.includes('```json')) {
                        const startIdx = retryJsonStr.indexOf('```json') + 7;
                        const endIdx = retryJsonStr.indexOf('```', startIdx);
                        retryJsonStr = retryJsonStr.substring(startIdx, endIdx).trim();
                      }
                      const retryExtractedData = JSON.parse(retryJsonStr);
                      const retryValidation = validateBillNumbers(retryExtractedData);
                      
                      if (retryValidation.valid) {
                        console.log(`  ✓ Retry successful - all bill numbers are now 8 digits`);
                        extractedData = retryExtractedData;
                      } else {
                        console.log(`  ⚠️  Retry still has invalid bill numbers: ${retryValidation.reason}`);
                        console.log(`  → Proceeding with original extraction`);
                      }
                    }
                  } else if (!validationResult.valid) {
                    console.log(`  ⚠️  Bill number validation failed: ${validationResult.reason}`);
                    console.log(`  → Max retries reached, proceeding with current data`);
                  }
                  
                } catch (e) {
                  console.error(`  ⚠️  Could not parse JSON from Claude response:`, e.message);
                }

                // Save result
                await saveResult({
                  ...result,
                  extractedData,
                  renamedFilename,
                  emailFrom: parsed.from?.text,
                  emailDate: parsed.date,
                  processedAt: new Date().toISOString()
                });

                // Upload to NetSuite if configured and data extracted successfully
                if (extractedData) {
                  await uploadToNetSuite(
                    pdf.content,
                    renamedFilename, // Use renamed filename with invoice number
                    extractedData,
                    parsed.subject || 'No Subject',
                    processor.netsuite // Pass folder IDs from matched processor
                  );
                }
                
                successCount++;
                processedCount++;
                console.log(`  📊 Progress: ${processedCount}/${pdfAttachments.length} (${successCount} success, ${failCount} failed)`);
                
                return { success: true, filename: pdf.filename };
              } else {
                failCount++;
                processedCount++;
                console.error(`  ✗ [${index + 1}/${pdfAttachments.length}] Failed: ${pdf.filename} - ${result.error}`);
                console.log(`  📊 Progress: ${processedCount}/${pdfAttachments.length} (${successCount} success, ${failCount} failed)`);
                return { success: false, filename: pdf.filename, error: result.error };
              }
            } catch (error) {
              // Check if it's a rate limit error and retry
              const isRateLimitError = error.message && error.message.includes('rate_limit_error');
              
              if (isRateLimitError && retryCount < RETRY_ATTEMPTS) {
                const delaySeconds = Math.pow(2, retryCount) * 10; // Exponential backoff: 10s, 20s, 40s
                console.warn(`  ⏸️  Rate limit hit for ${pdf.filename}. Retrying in ${delaySeconds}s... (attempt ${retryCount + 1}/${RETRY_ATTEMPTS})`);
                await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
                return processSinglePdf(pdf, index, retryCount + 1); // Retry
              }
              
              failCount++;
              processedCount++;
              console.error(`  ✗ [${index + 1}/${pdfAttachments.length}] Error processing ${pdf.filename}:`, error.message);
              console.log(`  📊 Progress: ${processedCount}/${pdfAttachments.length} (${successCount} success, ${failCount} failed)`);
              return { success: false, filename: pdf.filename, error: error.message };
            }
          };

          // Process PDFs in batches
          for (let i = 0; i < pdfAttachments.length; i += BATCH_SIZE) {
            const batch = pdfAttachments.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(pdfAttachments.length / BATCH_SIZE);
            
            console.log(`  🔄 Processing batch ${batchNum}/${totalBatches} (${batch.length} PDFs)...`);
            
            // Process batch concurrently
            const batchResults = await Promise.allSettled(
              batch.map((pdf, batchIndex) => processSinglePdf(pdf, i + batchIndex))
            );
            
            console.log(`  ✓ Batch ${batchNum}/${totalBatches} complete\n`);
            
            // Delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < pdfAttachments.length) {
              console.log(`  ⏸️  Waiting ${BATCH_DELAY_MS / 1000} seconds before next batch...`);
              await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
          }

          console.log(`\n  🎉 All PDFs processed: ${successCount} succeeded, ${failCount} failed`);

        } catch (error) {
          console.error(`  ✗ Error processing email #${seqno}:`, error.message);
          reject(error);
        }
      });
    });

    fetch.once('error', reject);
    fetch.once('end', () => {
      console.log(`✓ Completed processing email #${seqno}`);
      resolve();
    });
  });
}

/**
 * Fetches and processes new emails
 */
async function checkForNewEmails(imap) {
  return new Promise((resolve, reject) => {
    imap.openBox(CONFIG.polling.mailbox, false, async (err, box) => {
      if (err) {
        reject(err);
        return;
      }

      console.log(`\n🔍 Checking mailbox: ${CONFIG.polling.mailbox}`);
      console.log(`   Total messages: ${box.messages.total}`);
      console.log(`   Unread messages: ${box.messages.new}`);

      // Search for emails matching criteria
      imap.search([CONFIG.polling.searchCriteria], async (err, results) => {
        if (err) {
          reject(err);
          return;
        }

        if (!results || results.length === 0) {
          console.log('   ℹ️  No new messages to process');
          resolve();
          return;
        }

        console.log(`   📬 Found ${results.length} message(s) to process`);

        // Process each message sequentially
        try {
          for (const seqno of results) {
            await processEmail(seqno, imap);
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });
}

/**
 * Main polling loop
 */
async function startPolling() {
  console.log('🚀 Email PDF Processor starting...');
  validateConfig();

  console.log(`\n⚙️  Configuration:`);
  console.log(`   IMAP Host: ${CONFIG.imap.host}:${CONFIG.imap.port}`);
  console.log(`   IMAP User: ${CONFIG.imap.user}`);
  console.log(`   Mailbox: ${CONFIG.polling.mailbox}`);
  console.log(`   Search: ${CONFIG.polling.searchCriteria}`);
  console.log(`   Poll Interval: ${CONFIG.polling.intervalMs}ms (emails)`);
  console.log(`   Config Sync Interval: 600000ms (10 min)`);
  console.log(`   Mark as Read: ${CONFIG.polling.markAsRead}`);
  console.log(`   Claude Model: ${CONFIG.claude.model}`);
  console.log(`   Save PDFs: ${CONFIG.output.saveProcessedPdfs}`);
  console.log(`   Save Results: ${CONFIG.output.saveResults}`);
  console.log(`   NetSuite Integration: ${CONFIG.netsuite.enabled ? 'ENABLED' : 'DISABLED'}`);

  // Fetch initial processor configs from NetSuite
  await fetchNetSuiteConfigs();

  // Set up config refresh every 10 minutes (600000ms)
  if (CONFIG.netsuite.enabled) {
    setInterval(() => {
      fetchNetSuiteConfigs().catch(error => {
        console.error('Error fetching configs:', error.message);
      });
    }, 600000); // 10 minutes
  }

  const imap = new Imap(CONFIG.imap);

  imap.once('ready', () => {
    console.log('\n✓ Connected to IMAP server');

    // Initial check
    checkForNewEmails(imap).catch(error => {
      console.error('Error checking emails:', error.message);
    });

    // Set up polling interval
    setInterval(() => {
      checkForNewEmails(imap).catch(error => {
        console.error('Error checking emails:', error.message);
      });
    }, CONFIG.polling.intervalMs);
  });

  imap.once('error', (err) => {
    console.error('IMAP connection error:', err.message);
    process.exit(1);
  });

  imap.once('end', () => {
    console.log('IMAP connection ended');
  });

  imap.connect();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    imap.end();
    process.exit(0);
  });
}

// Start the application
if (require.main === module) {
  startPolling().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  processPdfWithClaude,
  checkForNewEmails,
  CONFIG
};
