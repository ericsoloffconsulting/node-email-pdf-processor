const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Sample a mix of PDFs - some we know are credits, some are invoices, some unknown
const testFiles = [
  'processed-pdfs/2026-01-01T16-40-32-968Z_2684000-7.pdf',  // Known credit (NF)
  'processed-pdfs/2026-01-01T16-40-58-655Z_2684000-1.pdf',  // Known credit (BOX)
  'processed-pdfs/2026-01-01T16-40-47-654Z_2684000-8.pdf',  // Known credit (CONCESSION)
  'processed-pdfs/2026-01-01T16-40-24-778Z_2684000-1.pdf',  // Known credit (J17052)
  'processed-pdfs/2026-01-01T16-40-41-953Z_Invoice_INV1665309.pdf',  // INV pattern
  'processed-pdfs/2026-01-01T16-40-18-636Z_2684000_91670848.pdf',  // Known invoice
  'processed-pdfs/2026-01-01T16-40-36-762Z_2684000_91717028.pdf',  // Known invoice
  'processed-pdfs/2026-01-01T16-40-51-836Z_2684000_91739503.pdf',  // Known invoice
  'processed-pdfs/2026-01-01T16-40-21-755Z_2684000_67641014.pdf',  // Small invoice
  'processed-pdfs/2026-01-01T16-40-27-583Z_2684000-2.pdf'  // Known credit (CONCDAM)
];

const prompt = `DOCUMENT HEADER ANALYSIS

Examine the TOP RIGHT CORNER of this PDF document and report:

1. What text/label appears in that area (e.g., "WARRANTY CREDIT", "CREDIT MEMO", "INVOICE", etc.)
2. The document total at the bottom (is it positive or negative/in parentheses?)
3. Invoice number and date

Look specifically in the header area where you'd typically see document type labels.

Return JSON with this exact structure:
{
  "topRightText": "exact text found in top right corner or header area",
  "invoiceNumber": "12345678",
  "invoiceDate": "MM/DD/YYYY",
  "documentTotal": "$123.45 or ($123.45)",
  "isNegativeTotal": true/false
}

Be precise about what text actually appears in the top right area.`;

(async () => {
  const results = [];
  
  for (const pdfPath of testFiles) {
    const filename = pdfPath.split('/').pop();
    console.log(`\nProcessing: ${filename}...`);
    
    try {
      const pdfBuffer = fs.readFileSync(pdfPath);
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
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
      let jsonStr = result;
      if (result.includes('```json')) {
        jsonStr = result.replace(/```json\n|\n```/g, '');
      }
      const jsonMatch = jsonStr.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      const json = JSON.parse(jsonStr);
      results.push({ filename, ...json });
      
    } catch (e) {
      console.log(`  Error: ${e.message}`);
      results.push({ filename, error: e.message });
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('DOCUMENT TYPE ANALYSIS RESULTS');
  console.log('='.repeat(80));
  
  // Group by top right text
  const byHeaderText = {};
  results.forEach(r => {
    if (!r.error) {
      const key = r.topRightText || 'NO TEXT FOUND';
      if (!byHeaderText[key]) byHeaderText[key] = [];
      byHeaderText[key].push(r);
    }
  });
  
  console.log('\n📋 DOCUMENTS GROUPED BY TOP RIGHT CORNER TEXT:\n');
  
  Object.keys(byHeaderText).sort().forEach(headerText => {
    const docs = byHeaderText[headerText];
    const negCount = docs.filter(d => d.isNegativeTotal).length;
    const posCount = docs.filter(d => !d.isNegativeTotal).length;
    
    console.log(`\n"${headerText}" (${docs.length} documents)`);
    console.log(`  Credits (negative): ${negCount}`);
    console.log(`  Invoices (positive): ${posCount}`);
    console.log(`  Examples:`);
    docs.slice(0, 3).forEach(d => {
      console.log(`    - INV#${d.invoiceNumber} | ${d.documentTotal} | ${d.isNegativeTotal ? '💳 CREDIT' : '📄 INVOICE'}`);
    });
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDATIONS:');
  console.log('='.repeat(80));
  
  const creditHeaders = Object.keys(byHeaderText).filter(key => {
    const docs = byHeaderText[key];
    const negativeRatio = docs.filter(d => d.isNegativeTotal).length / docs.length;
    return negativeRatio >= 0.8; // 80%+ are credits
  });
  
  console.log('\n✅ These header texts indicate CREDIT MEMOS:');
  creditHeaders.forEach(h => console.log(`   - "${h}"`));
  
  const invoiceHeaders = Object.keys(byHeaderText).filter(key => {
    const docs = byHeaderText[key];
    const positiveRatio = docs.filter(d => !d.isNegativeTotal).length / docs.length;
    return positiveRatio >= 0.8; // 80%+ are invoices
  });
  
  console.log('\n❌ These header texts indicate REGULAR INVOICES:');
  invoiceHeaders.forEach(h => console.log(`   - "${h}"`));
  
})();
