const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Test the J pattern document specifically
const testFiles = [
  'processed-pdfs/2026-01-01T16-40-24-778Z_2684000-1.pdf'  // J17052 document
];

const prompt = `MARCONE DOCUMENT TYPE DETECTION AND EXTRACTION

STEP 1: DOCUMENT TYPE DETECTION
=================================
Check the top right corner for these phrases:
  - "WARRANTY CREDIT"
  - "RETURN CREDIT" 
  - "CREDIT MEMO"

If found: This is a CREDIT MEMO - proceed with extraction
If NOT found: Set isCreditMemo=false, skip line items, return error message

VALID NARDA PATTERNS (whitelist):
✓ CONCDA, CONCDAM (with or without spaces)
✓ CONCESSION
✓ NF (with or without spaces)
✓ CORE (for vendor credits)
✓ J followed by ANY characters (J17052, J1234, etc.) - If it starts with capital J in the NARDA column, it's VALID
✓ INV###### (INV followed by 6+ digits)
✓ SHORT, BOX
✗ Part numbers, manufacturer codes (BSH, GEH, WPL, SPE)

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
   • Bill Number: EMBEDDED IN PRODUCT DESCRIPTION - Look for:
     * Letter N followed by 7-8 digits (e.g., "BURNRHEAN66811026" → "N66811026")
     * Letter W followed by 7-8 digits (e.g., "GLASS-DOOW91738138" → "W91738138")
     * CRITICAL: Bill numbers are ALWAYS 7-8 digits total
     * If you find N or W with less than 7 digits on current line, YOU MUST check next line
     * Example: "REGULATORN668110" on line 1 + "26" on line 2 = "N66811026" (8 digits)
     * Concatenate text across lines to complete the 7-8 digit sequence
     * NEVER return a partial bill number with only 6 digits or less
     * Extract just the N or W + complete 7-8 digits ("N66811026" not "N668110")
     * If no valid 7-8 digit N/W pattern found after checking both lines, leave empty string
   • Sales Order Number: Look below product description for text starting with "SOASER" (all caps). Extract the FULL value including prefix (e.g., "SOASER12345" → "SOASER12345"). Leave empty string if not found.

CRITICAL: 
• The NARDA column is typically located BETWEEN the product description and the part number
• DO NOT extract from the "Make" column (which contains manufacturer codes like BSH, GEH, WPL, SPE)
• For J pattern: ANY value starting with capital J in NARDA column is valid (J17052, J1234, J123456, etc.)
• Bill numbers are EMBEDDED in description text, not in separate column
• Description may wrap to next line - concatenate lines to find complete bill number
• Focus on the letter N or W as the START of the bill number pattern
• Look for the specific NARDA patterns listed above in the correct column position

VALIDATION RULES:
• If isCreditMemo=false, return empty lineItems array and include reason in validationError
• Document Total MUST equal: (sum of line item totals) + delivery amount
• If totals don't match, include "validationError" field explaining discrepancy

Return ONLY valid JSON:
{
  "isCreditMemo": true/false,
  "invoiceNumber": "12345678",
  "invoiceDate": "MM/DD/YYYY",
  "poNumber": "ABC123 or empty",
  "deliveryAmount": "$0.00",
  "documentTotal": "($123.45)",
  "lineItems": [
    {
      "nardaNumber": "NF",
      "totalAmount": "($42.24)",
      "originalBillNumber": "N66811026",
      "salesOrderNumber": "12345"
    }
  ],
  "validationError": "error message if any"
}`;

(async () => {
  for (const pdfPath of testFiles) {
    const filename = pdfPath.split('/').pop();
    console.log('\n' + '█'.repeat(80));
    console.log(`FILE: ${filename}`);
    console.log('█'.repeat(80));
    
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
      console.log('\n📄 RAW CLAUDE RESPONSE:');
      console.log('─'.repeat(80));
      console.log(result);
      console.log('─'.repeat(80));
      
      // Parse JSON
      let jsonStr = result;
      if (result.includes('```json')) {
        const startIdx = result.indexOf('```json') + 7;
        const endIdx = result.indexOf('```', startIdx);
        jsonStr = result.substring(startIdx, endIdx).trim();
      }
      
      const json = JSON.parse(jsonStr);
      
      console.log('\n🔍 PARSED JSON (Pretty-Printed):');
      console.log('─'.repeat(80));
      console.log(JSON.stringify(json, null, 2));
      console.log('─'.repeat(80));
      
      console.log(`\n📊 Token Usage: ${message.usage.input_tokens} input, ${message.usage.output_tokens} output`);
      
    } catch (e) {
      console.log(`\n❌ Error: ${e.message}`);
    }
  }
  
  console.log('\n' + '█'.repeat(80));
  console.log('ANALYSIS COMPLETE');
  console.log('█'.repeat(80));
})();
