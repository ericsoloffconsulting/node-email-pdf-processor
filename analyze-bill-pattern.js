const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Sample several credit memos to understand bill number patterns
const testFiles = [
  'processed-pdfs/2026-01-01T16-40-32-968Z_2684000-7.pdf',  // Return Credit - N66811026
  'processed-pdfs/2026-01-01T16-40-27-583Z_2684000-2.pdf',  // Warranty Credit - N66987285
  'processed-pdfs/2026-01-01T16-40-58-655Z_2684000-1.pdf',  // Return Credit - BOX
  'processed-pdfs/2026-01-01T16-40-47-654Z_2684000-8.pdf',  // Return Credit - CONCESSION
  'processed-pdfs/2026-01-01T16-40-24-778Z_2684000-1.pdf'   // J17052
];

const prompt = `BILL NUMBER PATTERN ANALYSIS

For each line item in this credit memo, extract the COMPLETE description text.

Bill numbers follow this pattern:
- Letter N or W followed by 6-8 digits
- Example: "BURNRHEAN66811026" → Bill# is "N66811026" (N + 8 digits)
- Example: "HEATER DEN66987285" → Bill# is "N66987285" (N + 8 digits, ignore DE prefix)
- The letters BEFORE N or W are irrelevant (bleeding from description)

For each line:
1. Full description text
2. Extract N[6-8 digits] or W[6-8 digits] pattern (if present)
3. NARDA value
4. Total amount

Return JSON:
{
  "invoiceNumber": "12345678",
  "lineItems": [
    {
      "lineNumber": 1,
      "fullDescription": "complete text",
      "billNumber": "N12345678 or W12345678 or empty",
      "digitCount": "number of digits after N/W",
      "nardaNumber": "NF, CONCDA, etc.",
      "totalAmount": "($XX.XX)"
    }
  ]
}`;

(async () => {
  const allResults = [];
  
  for (const pdfPath of testFiles) {
    const filename = pdfPath.split('/').pop();
    console.log(`\nProcessing: ${filename}...`);
    
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
      let jsonStr = result;
      if (result.includes('```json')) {
        const startIdx = result.indexOf('```json') + 7;
        const endIdx = result.indexOf('```', startIdx);
        jsonStr = result.substring(startIdx, endIdx).trim();
      }
      
      const json = JSON.parse(jsonStr);
      allResults.push({ filename, ...json });
      
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log('BILL NUMBER PATTERN ANALYSIS');
  console.log('═'.repeat(80));
  
  const billNumbers = [];
  allResults.forEach(doc => {
    doc.lineItems.forEach(item => {
      if (item.billNumber && item.billNumber !== '') {
        billNumbers.push({
          invoice: doc.invoiceNumber,
          description: item.fullDescription,
          billNumber: item.billNumber,
          digitCount: item.digitCount,
          narda: item.nardaNumber
        });
      }
    });
  });
  
  console.log(`\n✅ FOUND ${billNumbers.length} LINE ITEMS WITH BILL NUMBERS:\n`);
  
  billNumbers.forEach((item, idx) => {
    console.log(`${idx + 1}. Description: "${item.description}"`);
    console.log(`   Bill Number: ${item.billNumber} (${item.digitCount} digits)`);
    console.log(`   NARDA: ${item.narda} | Invoice: ${item.invoice}\n`);
  });
  
  // Digit count statistics
  const digitCounts = {};
  billNumbers.forEach(item => {
    const count = item.digitCount || 'unknown';
    digitCounts[count] = (digitCounts[count] || 0) + 1;
  });
  
  console.log('═'.repeat(80));
  console.log('DIGIT COUNT STATISTICS:');
  console.log('═'.repeat(80));
  Object.keys(digitCounts).sort().forEach(count => {
    console.log(`  ${count} digits: ${digitCounts[count]} occurrences`);
  });
  
  // Pattern analysis
  const nPattern = billNumbers.filter(item => item.billNumber.startsWith('N')).length;
  const wPattern = billNumbers.filter(item => item.billNumber.startsWith('W')).length;
  
  console.log('\n═'.repeat(80));
  console.log('PATTERN PREFIX STATISTICS:');
  console.log('═'.repeat(80));
  console.log(`  N pattern: ${nPattern} occurrences`);
  console.log(`  W pattern: ${wPattern} occurrences`);
  
})();
