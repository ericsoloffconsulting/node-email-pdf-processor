# Marcone Email PDF Processor - Setup Complete

## Status: ✅ CONFIGURED & TESTED

### What Was Accomplished

1. **Email Server Connection** ✅
   - Successfully connected to Rackspace IMAP server (secure.emailsrvr.com)
   - Email: apzonecapture@brayandscarff.com
   - Password issue resolved (quoted in .env to handle # character)
   - Processed 400+ emails successfully

2. **Claude API Integration** ✅
   - API key configured and validated
   - Successfully processed multiple PDFs before hitting rate limits
   - Example: Invoice #91669141 analyzed with 4,246 input tokens

3. **Marcone-Specific Extraction Prompt** ✅
   - Created comprehensive extraction prompt for credit memos
   - Targets all required fields for NetSuite bill credit creation
   - See: `marcone-extraction-prompt.txt`

### Required Data Fields (Configured for Extraction)

**Document-Level:**
- Invoice Number (7-8 digits)
- Invoice Date (MM/DD/YYYY)
- Delivery Amount (optional)

**Line Items (repeating):**
- NARDA Number (CONCDA, NF, CORE, J####, INV####, SHORT, BOX, etc.)
- Total Amount (currency with parentheses)
- Original Bill Number (8-10 digits, strips letter prefixes)

### Output Format

```json
{
  "invoiceNumber": "61234567",
  "invoiceDate": "10/15/2025",
  "deliveryAmount": "$9.49",
  "lineItems": [
    {
      "nardaNumber": "CONCDA",
      "totalAmount": "($24.08)",
      "originalBillNumber": "68260858"
    }
  ],
  "extractionNotes": "Brief notes"
}
```

## Current Issue

⚠️ **API Credits Exhausted**: The Claude API key `bas-rackspace-email` has run out of credits.

### To Continue Testing

**Option 1: Add Credits**
- Visit: https://console.anthropic.com/
- Add credits to the `bas-rackspace-email` API key

**Option 2: Test Mode**
- Set `SEARCH_CRITERIA=SEEN` in `.env` to reprocess already-read emails
- Adjust `POLL_INTERVAL_MS` to reduce frequency

## Files Created/Modified

1. **`.env`** - Production configuration with credentials
2. **`marcone-extraction-prompt.txt`** - Complete reference prompt
3. **`email-poller.js`** - Updated with Marcone-specific extraction logic
4. **`processed-pdfs/`** - 400+ Marcone invoice PDFs saved
5. **`results/`** - 8 successful Claude analyses before rate limit

## Next Steps

1. **Add API Credits** to continue processing
2. **Test with Credit Memos** - The processor is configured but needs credits to test on actual credit memo PDFs (files with NARDA numbers like CONCDA, NF, CORE)
3. **NetSuite Integration** - Once extraction is validated, integrate JSON output with existing NetSuite script
4. **Mark Old Emails as Read** - Prevent reprocessing 400+ backlog emails

## Running the Processor

```bash
cd email-pdf-processor
node email-poller.js
```

Press `Ctrl+C` to stop.

## Configuration Notes

- **Rate Limit**: 30,000 tokens/minute (hit this limit processing backlog)
- **Email Polling**: Every 60 seconds (configurable)
- **Mark as Read**: Enabled (processed emails marked as read)
- **PDF Storage**: Enabled (saves all PDFs locally)
- **Results Storage**: Enabled (saves Claude analysis as JSON)

## Email Subject Patterns

All processed emails from: `no-replies@marcone.com`

Subjects:
- "Marcone Instant Invoice Notification"
- "Marcone Instant Invoice Notification (PO: MO######)"
- "Credits processed by Marcone for 2684000 for date MM/DD/YYYY"

**Note**: The "Credits processed" emails are likely to contain the NARDA credit memo PDFs we need!
