const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Test both types
const testFiles = [
  { path: 'processed-pdfs/2026-01-01T16-40-32-968Z_2684000-7.pdf', type: 'Return Credit' },
  { path: 'processed-pdfs/2026-01-01T16-40-27-583Z_2684000-2.pdf', type: 'Warranty Credit' }
];

const prompt = `BILL NUMBER ANALYSIS - EMBEDDED IN DESCRIPTION

This is a Marcone credit memo. Bill numbers may NOT be in a separate column.
Instead, they are often EMBEDDED IN THE PRODUCT DESCRIPTION TEXT.

For each line item:
1. What is the FULL product description text (all text in the description field)?
2. Look for bill number patterns WITHIN the description:
   - HN followed by 7-10 digits (e.g., "HN67382688")
   - W followed by 7-10 digits (e.g., "W1234567")
   - N followed by 7-10 digits (e.g., "N67382688")
3. What is the NARDA value?
4. What is the total amount?

These bill number patterns appear as part of the product description, NOT in a separate column.

Return JSON with:
{
  "invoiceNumber": "the main invoice number at top",
  "documentType": "Warranty Credit or Return Credit",
  "lineItems": [
    {
      "lineNumber": 1,
      "fullDescription": "complete description text from PDF",
      "embeddedBillNumber": "extracted bill number or empty",
      "billNumberPattern": "HN, W, N, or none",
      "nardaNumber": "NF, CONCDA, etc.",
      "totalAmount": "($XX.XX)"
    }
  ]
}`;

(async () => {
  for (const testFile of testFiles) {
    console.log('\n' + '█'.repeat(80));
    console.log(`📋 ANALYZING: ${testFile.type}`);
    console.log('█'.repeat(80));
    console.log(`File: ${testFile.path.split('/').pop()}\n`);
    
    try {
      const pdfBuffer = fs.readFileSync(testFile.path);
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
      
      // Parse JSON
      let jsonStr = result;
      if (result.includes('```json')) {
        const startIdx = result.indexOf('```json') + 7;
        const endIdx = result.indexOf('```', startIdx);
        jsonStr = result.substring(startIdx, endIdx).trim();
      }
      
      const json = JSON.parse(jsonStr);
      
      console.log('🔍 ANALYSIS RESULTS:');
      console.log('─'.repeat(80));
      console.log(`Invoice Number: ${json.invoiceNumber}`);
      console.log(`Document Type: ${json.documentType || 'N/A'}`);
      
      console.log('\n📋 LINE ITEMS:');
      const withBillNum = json.lineItems.filter(item => item.embeddedBillNumber && item.embeddedBillNumber !== '').length;
      const withoutBillNum = json.lineItems.filter(item => !item.embeddedBillNumber || item.embeddedBillNumber === '').length;
      console.log(`  Total: ${json.lineItems.length}`);
      console.log(`  With Embedded Bill Numbers: ${withBillNum} ${withBillNum > 0 ? '✅' : '❌'}`);
      console.log(`  Without Bill Numbers: ${withoutBillNum}`);
      
      if (withBillNum > 0) {
        console.log('\n✅ ITEMS WITH EMBEDDED BILL NUMBERS:');
        json.lineItems.filter(item => item.embeddedBillNumber && item.embeddedBillNumber !== '').forEach(item => {
          console.log(`  Line ${item.lineNumber}:`);
          console.log(`    Description: ${item.fullDescription}`);
          console.log(`    Bill Number: ${item.embeddedBillNumber} (Pattern: ${item.billNumberPattern})`);
          console.log(`    NARDA: ${item.nardaNumber} | Amount: ${item.totalAmount}`);
        });
      }
      
      if (withoutBillNum > 0) {
        console.log('\n⚠️  ITEMS WITHOUT EMBEDDED BILL NUMBERS:');
        json.lineItems.filter(item => !item.embeddedBillNumber || item.embeddedBillNumber === '').forEach(item => {
          console.log(`  Line ${item.lineNumber}:`);
          console.log(`    Description: ${item.fullDescription}`);
          console.log(`    NARDA: ${item.nardaNumber} | Amount: ${item.totalAmount}`);
        });
      }
      
    } catch (e) {
      console.log(`\n❌ Error: ${e.message}`);
    }
  }
  
  console.log('\n' + '█'.repeat(80));
  console.log('ANALYSIS COMPLETE');
  console.log('█'.repeat(80));
})();
