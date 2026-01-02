const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const testFiles = [
  'processed-pdfs/2026-01-01T16-40-45-469Z_2684000-9.pdf',
  'processed-pdfs/2026-01-01T16-40-36-762Z_2684000_91717028.pdf',
  'processed-pdfs/2026-01-01T16-40-57-943Z_2684000-1.pdf',
  'processed-pdfs/2026-01-01T16-41-10-388Z_2684000_69441226.pdf',
  'processed-pdfs/2026-01-01T16-41-13-662Z_2684000-1.pdf',
  'processed-pdfs/2026-01-01T16-40-21-755Z_2684000_67641014.pdf',
  'processed-pdfs/2026-01-01T16-40-18-636Z_2684000_91670848.pdf',
  'processed-pdfs/2026-01-01T16-40-32-637Z_2684000_91703594.pdf',
  'processed-pdfs/2026-01-01T16-40-40-087Z_2684000-5.pdf',
  'processed-pdfs/2026-01-01T16-40-51-836Z_2684000_91739503.pdf'
];

const prompt = `MARCONE CREDIT MEMO EXTRACTION WITH VALIDATION

VALID NARDA PATTERNS - Extract if matches:
✓ CONCDA, CONCDAM, CONCESSION, NF, CORE (vendor credits)
✓ J##### (J followed by 4-6 digits - journal entries)
✓ INV###### (INV followed by 6+ digits)
✓ SHORT, BOX
✗ Part numbers, other text

EXTRACT FROM PDF:
1. Invoice Number: 8-digit number at top left
2. Invoice Date: MM/DD/YYYY format
3. PO Number: Look in top right corner area, labeled as "P.O. Number" or "PO#" (may be empty/blank)
4. Delivery Amount: Dollar amount with $ symbol (from delivery line)
5. Document Total: The grand total at bottom of PDF (with $ and parentheses if credit, e.g. "($136.68)" or "$0.00")
6. Line Items - for EACH line with valid NARDA:
   • NARDA Number: Pattern above, remove spaces ("CONCDA M" → "CONCDAM", "N F" → "NF")
   • Total Amount: With ( ) and $ (e.g., "($42.24)")
   • Bill Number: 6-10 digits, strip letter prefixes ("N67382688" → "67382688")
     If no bill# visible, use invoice number OR leave empty string
   • Sales Order Number: Look below product description for text starting with "SOASER" (all caps). Extract the number after "SOASER" (e.g., "SOASER12345" → "12345"). Leave empty string if not found.

VALIDATION RULES:
• Document Total MUST equal: (sum of line item totals) + delivery amount
• If totals don't match, include "validationError" field explaining discrepancy
• Include J##### patterns - these are valid journal entries
• Remove ALL spaces from NARDA values before output
• For journal entries (J#####), bill number may be blank or same as invoice
• PO Number is optional - if not found, use empty string ""
• Sales Order Number is optional - if not found, use empty string ""
• Output ONLY valid JSON, no explanations

EXAMPLE OUTPUT:
{"invoiceNumber":"67718510","invoiceDate":"09/11/2025","poNumber":"12345","deliveryAmount":"$0.00","documentTotal":"($94.58)","lineItems":[{"nardaNumber":"J17157","totalAmount":"($94.58)","originalBillNumber":"","salesOrderNumber":"67890"}],"validationError":""}`;

async function getPageCount(pdfPath) {
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    return pdfDoc.getPageCount();
  } catch (e) {
    return 'Unknown';
  }
}

(async () => {
  let totalCount = 0;
  let singlePageCount = 0;
  let multiPageCount = 0;
  
  for (const pdfPath of testFiles) {
    totalCount++;
    const filename = pdfPath.split('/').pop();
    const pageCount = await getPageCount(pdfPath);
    
    console.log('\n' + '='.repeat(70));
    console.log(`[${totalCount}/10] ${filename}`);
    console.log(`Pages: ${pageCount}`);
    console.log('─'.repeat(70));
    
    if (pageCount === 1) singlePageCount++;
    else if (pageCount > 1) multiPageCount++;
    
    try {
      const pdfBuffer = fs.readFileSync(pdfPath);
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
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
      
      // Extract JSON - handle cases where Claude adds explanation after JSON
      let jsonStr = result;
      if (result.includes('```json')) {
        jsonStr = result.replace(/```json\n|\n```/g, '');
      }
      const jsonMatch = jsonStr.match(/\{[\s\S]*?\}(?=\s*$|\s*\n\n|\s*\*\*)/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      const json = JSON.parse(jsonStr);
      
      console.log(`📄 Invoice: ${json.invoiceNumber}`);
      console.log(`📅 Date: ${json.invoiceDate}`);
      console.log(`🔖 PO: ${json.poNumber || 'N/A'}`);
      console.log(`📦 Delivery: ${json.deliveryAmount || '$0.00'}`);
      console.log(`💵 Document Total: ${json.documentTotal || 'N/A'}`);
      console.log(`📋 Line Items: ${json.lineItems ? json.lineItems.length : 0}`);
      
      if (json.lineItems && json.lineItems.length > 0) {
        console.log('\n📊 LINE ITEM DETAILS:');
        json.lineItems.forEach((item, idx) => {
          console.log(`\n  Item ${idx + 1}:`);
          console.log(`    NARDA: ${item.nardaNumber}`);
          console.log(`    Amount: ${item.totalAmount}`);
          console.log(`    Bill#: ${item.originalBillNumber || 'N/A'}`);
          console.log(`    SO#: ${item.salesOrderNumber || 'N/A'}`);
        });
        
        // Calculate total credit amount from line items
        const lineItemsTotal = json.lineItems.reduce((sum, item) => {
          const amount = parseFloat(item.totalAmount.replace(/[($),]/g, ''));
          return sum + amount;
        }, 0);
        console.log(`\n💰 Line Items Total: ($${lineItemsTotal.toFixed(2)})`);
        
        // Parse delivery amount
        const deliveryAmount = parseFloat((json.deliveryAmount || '$0.00').replace(/[($),]/g, ''));
        if (deliveryAmount > 0) {
          console.log(`📦 Delivery Charge: $${deliveryAmount.toFixed(2)}`);
        }
        
        // Calculate expected total
        const calculatedTotal = lineItemsTotal + deliveryAmount;
        console.log(`🧮 Calculated Total: ($${calculatedTotal.toFixed(2)})`);
        
        // Parse document total
        const docTotal = json.documentTotal ? parseFloat(json.documentTotal.replace(/[($),]/g, '')) : 0;
        console.log(`📄 Document Total: ($${docTotal.toFixed(2)})`);
        
        // Validation check
        const diff = Math.abs(calculatedTotal - docTotal);
        if (diff < 0.01) {
          console.log('\n✅ VALIDATION: Totals match perfectly!');
        } else {
          console.log(`\n❌ VALIDATION ERROR: Difference of $${diff.toFixed(2)}`);
        }
        
        if (json.validationError) {
          console.log(`⚠️  Claude reported: ${json.validationError}`);
        }
      } else {
        console.log('\nℹ️  No line items (regular invoice, not a credit memo)');
      }
      
      console.log(`\n✓ SUCCESS [${message.usage.input_tokens} tokens]`);
      
    } catch (e) {
      console.log(`✗ ERROR: ${e.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY:');
  console.log(`Single-page PDFs: ${singlePageCount}`);
  console.log(`Multi-page PDFs: ${multiPageCount}`);
  console.log(`Success rate: ${totalCount}/${testFiles.length}`);
  console.log('='.repeat(70));
})();
