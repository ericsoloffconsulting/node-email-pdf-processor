const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const pdfPath = 'processed-pdfs/2026-01-01T16-40-32-968Z_2684000-7.pdf';

const prompt = `DETAILED LINE ITEM ANALYSIS - INVOICE 67617313

This PDF has 3 line items with NARDA "NF". I need you to examine Line Item #2 (the REGULATOR line) very carefully.

For Line Item #2:
1. What is the EXACT product description text (word-for-word, character-for-character)?
2. Is the description on one line or multiple lines?
3. If multiple lines, what text appears on EACH line?
4. Look for patterns: Letter N followed by digits, or Letter W followed by digits
5. Are the digits: N668110 (6 digits) or N66811026 (8 digits)?
6. Is there a line break or spacing issue that might be splitting the number?

Please be extremely precise about:
- Exact character sequences
- Spaces, line breaks, special characters
- Where the N or W appears in relation to surrounding text
- Whether digits continue on the next line

Return JSON with detailed analysis:
{
  "lineItem2": {
    "fullDescriptionLine1": "exact text from first line",
    "fullDescriptionLine2": "exact text from second line if exists",
    "nPattern": "the N or W pattern you found",
    "digitsAfterN": "all digits following N or W",
    "digitCount": number,
    "possibleIssues": "description of any spacing/line break issues",
    "recommendation": "what the correct bill number should be"
  }
}`;

(async () => {
  console.log('Investigating 6-digit bill number extraction...\n');
  console.log('PDF: 2026-01-01T16-40-32-968Z_2684000-7.pdf');
  console.log('Invoice: 67617313');
  console.log('Line Item: #2 (REGULATOR)\n');
  
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
    console.log('📄 RAW CLAUDE ANALYSIS:');
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
    
    console.log('\n🔍 DETAILED FINDINGS:');
    console.log('─'.repeat(80));
    const item = json.lineItem2;
    console.log(`Line 1 Text: "${item.fullDescriptionLine1}"`);
    if (item.fullDescriptionLine2) {
      console.log(`Line 2 Text: "${item.fullDescriptionLine2}"`);
    }
    console.log(`\nPattern Found: ${item.nPattern}`);
    console.log(`Digits After Pattern: ${item.digitsAfterN}`);
    console.log(`Digit Count: ${item.digitCount}`);
    console.log(`\nPossible Issues:\n  ${item.possibleIssues}`);
    console.log(`\n💡 RECOMMENDATION:\n  ${item.recommendation}`);
    console.log('─'.repeat(80));
    
    console.log(`\n📊 Token Usage: ${message.usage.input_tokens} input, ${message.usage.output_tokens} output`);
    
  } catch (e) {
    console.log(`\n❌ Error: ${e.message}`);
    console.log(e.stack);
  }
})();
