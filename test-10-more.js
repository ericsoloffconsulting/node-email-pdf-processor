const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const testFiles = [
  'processed-pdfs/2026-01-01T16-40-47-938Z_2684000-1.pdf',
  'processed-pdfs/2026-01-01T16-40-31-245Z_2684000-6.pdf',
  'processed-pdfs/2026-01-01T16-40-21-432Z_2684000_91676281.pdf',
  'processed-pdfs/2026-01-01T16-40-40-375Z_2684000-6.pdf',
  'processed-pdfs/2026-01-01T16-40-35-327Z_2684000_91712124.pdf',
  'processed-pdfs/2026-01-01T16-40-35-163Z_2684000-1.pdf',
  'processed-pdfs/2026-01-01T16-41-08-720Z_2684000_91764311.pdf',
  'processed-pdfs/2026-01-01T16-41-06-196Z_2684000_91761720.pdf',
  'processed-pdfs/2026-01-01T16-40-45-906Z_2684000-7.pdf',
  'processed-pdfs/2026-01-01T16-40-45-881Z_2684000_91730139.pdf',
  'processed-pdfs/2026-01-01T16-41-08-131Z_2684000_91763892.pdf',
  'processed-pdfs/2026-01-01T16-40-58-146Z_2684000_91750871.pdf',
  'processed-pdfs/2026-01-01T16-40-45-550Z_2684000_91731190.pdf',
  'processed-pdfs/2026-01-01T16-40-40-861Z_2684000-4.pdf',
  'processed-pdfs/2026-01-01T16-41-02-286Z_2684000_91755843.pdf',
  'processed-pdfs/2026-01-01T16-40-38-516Z_2684000-5.pdf'
];

const prompt = `MARCONE CREDIT MEMO EXTRACTION

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
4. Delivery Amount: Dollar amount with $ symbol
5. Line Items - for EACH line with valid NARDA:
   • NARDA Number: Pattern above, remove spaces ("CONCDA M" → "CONCDAM", "N F" → "NF")
   • Total Amount: With ( ) and $ (e.g., "($42.24)")
   • Bill Number: 6-10 digits, strip letter prefixes ("N67382688" → "67382688")
     If no bill# visible, use invoice number OR leave empty string

RULES:
• Include J##### patterns - these are valid journal entries
• Remove ALL spaces from NARDA values before output
• For journal entries (J#####), bill number may be blank or same as invoice
• PO Number is optional - if not found, use empty string ""
• Output ONLY valid JSON, no explanations

EXAMPLE OUTPUT:
{"invoiceNumber":"67718510","invoiceDate":"09/11/2025","poNumber":"12345","deliveryAmount":"$0.00","lineItems":[{"nardaNumber":"J17157","totalAmount":"($94.58)","originalBillNumber":""}]}`;

(async () => {
  let successCount = 0;
  let totalCount = 0;
  const results = [];
  let hasDelivery = 0;
  let multiLineItems = 0;
  
  for (const pdfPath of testFiles) {
    totalCount++;
    const filename = pdfPath.split('/').pop();
    console.log(`\n[${totalCount}/16] ${filename}`);
    
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
      // If there's text after the closing }, extract just the JSON object
      const jsonMatch = jsonStr.match(/\{[\s\S]*?\}(?=\s*$|\s*\n\n|\s*\*\*)/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      const json = JSON.parse(jsonStr);
      
      if (json.invoiceNumber && json.invoiceDate) {
        const itemCount = json.lineItems ? json.lineItems.length : 0;
        const narda = json.lineItems && json.lineItems.length > 0 ? json.lineItems.map(i => i.nardaNumber).join(', ') : 'NONE';
        const delivery = json.deliveryAmount || '$0.00';
        const po = json.poNumber || '';
        
        // Check for special NARDA types
        const hasBoxShort = narda.includes('BOX') || narda.includes('SHORT');
        const hasCore = narda.includes('CORE');
        const hasConcession = narda.includes('CONCESSION');
        const hasInv = narda.match(/INV\d+/);
        
        const poDisplay = po ? ` | PO: ${po}` : '';
        
        if (delivery !== '$0.00' && !delivery.includes('($')) {
          hasDelivery++;
          console.log(`✓ INV#${json.invoiceNumber} | ${json.invoiceDate}${poDisplay} | ${itemCount} item(s) | 💰 DELIVERY: ${delivery} | NARDA: ${narda}`);
        } else if (hasBoxShort || hasCore || hasConcession || hasInv) {
          console.log(`✓ INV#${json.invoiceNumber} | ${json.invoiceDate}${poDisplay} | ${itemCount} item(s) | 🎯 SPECIAL: ${narda}`);
        } else {
          console.log(`✓ INV#${json.invoiceNumber} | ${json.invoiceDate}${poDisplay} | ${itemCount} item(s) | NARDA: ${narda}`);
        }
        
        if (itemCount > 1) multiLineItems++;
        
        successCount++;
        results.push({ filename, invoice: json.invoiceNumber, items: itemCount, narda, delivery, po });
      } else {
        console.log('⚠ INCOMPLETE');
        results.push({ filename, status: 'INCOMPLETE' });
      }
    } catch (e) {
      console.log('✗ ERROR:', e.message.substring(0, 60));
      results.push({ filename, status: 'ERROR' });
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`SUCCESS RATE: ${successCount}/${totalCount} = ${Math.round(successCount/totalCount*100)}%`);
  console.log(`PDFs with delivery charges: ${hasDelivery}`);
  console.log(`PDFs with multiple line items: ${multiLineItems}`);
  console.log('='.repeat(70));
  
  if (hasDelivery > 0) {
    console.log('\n🚚 DELIVERY CHARGES FOUND:');
    results.filter(r => r.delivery && r.delivery !== '$0.00' && !r.delivery.includes('($'))
      .forEach(r => console.log(`  - INV#${r.invoice}: ${r.delivery}`));
  }
  
  if (multiLineItems > 0) {
    console.log('\n📋 MULTIPLE LINE ITEMS:');
    results.filter(r => r.items > 1)
      .forEach(r => console.log(`  - INV#${r.invoice}: ${r.items} items (${r.narda})`));
  }
})();
