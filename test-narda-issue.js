const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// PDFs that had invalid NARDA warnings + known credit memos for comparison
const testFiles = [
  'processed-pdfs/2026-01-01T16-40-32-968Z_2684000-7.pdf',  // Warranty Credit (NF) - should process
  'processed-pdfs/2026-01-01T16-40-58-655Z_2684000-1.pdf',  // Return Credit (BOX) - NEW TYPE, should process
  'processed-pdfs/2026-01-01T16-40-47-654Z_2684000-8.pdf',  // Return Credit (CONCESSION) - should process
  'processed-pdfs/2026-01-01T16-40-18-636Z_2684000_91670848.pdf',  // Regular invoice - should skip
  'processed-pdfs/2026-01-01T16-40-27-583Z_2684000-2.pdf'  // Warranty Credit (CONCDAM) - should process
];

const prompt = `MARCONE DOCUMENT TYPE DETECTION AND EXTRACTION

STEP 1: DETERMINE DOCUMENT TYPE
Look in the top right corner of the PDF for the phrase "WARRANTY CREDIT" or "CREDIT MEMO" or similar credit-related text.
If found: This is a CREDIT MEMO - proceed with extraction
If NOT found: This is a REGULAR INVOICE - set isCreditMemo=false and skip line item extraction

STEP 2: IF CREDIT MEMO, EXTRACT DATA

VALID NARDA PATTERNS - Extract if matches:
✓ CONCDA, CONCDAM, CONCESSION, NF, CORE (vendor credits)
✓ J##### (J followed by 4-6 digits - journal entries)
✓ INV###### (INV followed by 6+ digits)
✓ SHORT, BOX
✗ Part numbers, other text

EXTRACT FROM PDF:
1. isCreditMemo: true/false (based on presence of "WARRANTY CREDIT", "RETURN CREDIT", or "CREDIT MEMO" text in top right corner)
2. Invoice Number: 8-digit number at top left
3. Invoice Date: MM/DD/YYYY format
4. PO Number: Look in top right corner area, labeled as "P.O. Number" or "PO#" (may be empty/blank)
5. Delivery Amount: Dollar amount with $ symbol (from delivery line)
6. Document Total: The grand total at bottom of PDF (with $ and parentheses if credit, e.g. "($136.68)" or "$0.00")
7. Line Items - ONLY IF isCreditMemo=true, for EACH line with valid NARDA:
   • NARDA Number: Pattern above, remove spaces ("CONCDA M" → "CONCDAM", "N F" → "NF")
   • Total Amount: With ( ) and $ (e.g., "($42.24)")
   • Bill Number: Look in the product description text for patterns:
     - N followed by 7-8 digits (e.g., "BURNRHEAN66811026" → "N66811026")
     - W followed by 7-8 digits (e.g., "H.V.DIODEW91656473" → "W91656473")
     The letters BEFORE N or W are part of the description (ignore them)
     Extract ONLY the N or W + digits portion
     If no N/W pattern found, leave empty string
   • Sales Order Number: Look below product description for text starting with "SOASER" (all caps). Extract the number after "SOASER" (e.g., "SOASER12345" → "12345"). Leave empty string if not found.

CRITICAL: The NARDA column is typically located BETWEEN the product description and the part number. 
DO NOT extract from the "Make" column (which contains manufacturer codes like BSH, GEH, WPL, SPE).
Look for the specific NARDA patterns listed above in the correct column position.

VALIDATION RULES:
• If isCreditMemo=false, return empty lineItems array and include reason in validationError
• Document Total MUST equal: (sum of line item totals) + delivery amount
• If totals don't match, include "validationError" field explaining discrepancy
• Output ONLY valid JSON, no explanations

EXAMPLE OUTPUT (Credit Memo):
{"isCreditMemo":true,"invoiceNumber":"67718510","invoiceDate":"09/11/2025","poNumber":"12345","deliveryAmount":"$0.00","documentTotal":"($94.58)","lineItems":[{"nardaNumber":"J17157","totalAmount":"($94.58)","originalBillNumber":"","salesOrderNumber":"67890"}],"validationError":""}

EXAMPLE OUTPUT (Regular Invoice):
{"isCreditMemo":false,"invoiceNumber":"91670848","invoiceDate":"09/04/2025","poNumber":"","deliveryAmount":"$9.49","documentTotal":"$700.32","lineItems":[],"validationError":"Not a credit memo - no WARRANTY CREDIT text found in document"}`;

(async () => {
  for (const pdfPath of testFiles) {
    const filename = pdfPath.split('/').pop();
    console.log('\n' + '='.repeat(80));
    console.log(`FILE: ${filename}`);
    console.log('='.repeat(80));
    
    try {
      const pdfBuffer = fs.readFileSync(pdfPath);
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3072,
        messages: [{
          role: 'user',
          content: [{
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBuffer.toString('base64') }
          }, {
            type: 'text',
            text: prompt
          }]
        }]
      });
      
      const result = message.content.find(b => b.type === 'text').text;
      
      // Extract JSON
      let jsonStr = result;
      if (result.includes('```json')) {
        jsonStr = result.replace(/```json\n|\n```/g, '');
      }
      const jsonMatch = jsonStr.match(/\{[\s\S]*?\}(?=\s*$|\s*\n\n|\s*\*\*)/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      const json = JSON.parse(jsonStr);
      
      console.log(`\n📄 Invoice: ${json.invoiceNumber} | Date: ${json.invoiceDate}`);
      console.log(`📦 Delivery: ${json.deliveryAmount || '$0.00'} | Total: ${json.documentTotal || 'N/A'}`);
      console.log(`\n🔍 IS CREDIT MEMO: ${json.isCreditMemo ? '✅ YES' : '❌ NO'}`);
      
      if (!json.isCreditMemo) {
        console.log(`\n⚠️  SKIPPED - NOT A CREDIT MEMO`);
        if (json.validationError) {
          console.log(`Reason: ${json.validationError}`);
        }
        console.log(`\n👉 This document should be ignored for bill credit processing`);
      } else if (json.lineItems && json.lineItems.length > 0) {
        console.log(`\n📋 FOUND ${json.lineItems.length} LINE ITEMS:\n`);
        
        json.lineItems.slice(0, 5).forEach((item, idx) => {
          console.log(`Item ${idx + 1}:`);
          console.log(`  NARDA: "${item.nardaNumber}" ${item.nardaNumber ? '' : '❌ EMPTY'}`);
          console.log(`  Amount: ${item.totalAmount}`);
          console.log(`  SO#: ${item.salesOrderNumber || 'N/A'}`);
          console.log('');
        });
        
        if (json.lineItems.length > 5) {
          console.log(`... and ${json.lineItems.length - 5} more items\n`);
        }
        
        // Show validation warning if present
        if (json.validationError) {
          console.log(`⚠️  VALIDATION WARNING:\n${json.validationError}\n`);
        }
        
        // Analyze NARDA values
        const nardaValues = json.lineItems.map(i => i.nardaNumber).filter(n => n);
        const uniqueNarda = [...new Set(nardaValues)];
        console.log(`NARDA VALUES EXTRACTED: ${uniqueNarda.length > 0 ? uniqueNarda.join(', ') : 'NONE'}`);
        
        // Check if these are manufacturer codes
        const manufacturerCodes = ['BSH', 'GEH', 'WPL', 'SPE', 'FP'];
        const foundManufacturers = uniqueNarda.filter(n => manufacturerCodes.includes(n));
        if (foundManufacturers.length > 0) {
          console.log(`\n🚨 PROBLEM DETECTED: These look like MANUFACTURER codes from the "Make" column:`);
          console.log(`   ${foundManufacturers.join(', ')}`);
          console.log(`   These should NOT be in the NARDA field!`);
        }
      } else {
        console.log('\nNo line items extracted');
      }
      
      console.log(`\n[Tokens: ${message.usage.input_tokens}]`);
      
    } catch (e) {
      console.log(`\n❌ ERROR: ${e.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('ANALYSIS COMPLETE');
  console.log('='.repeat(80));
})();
