# Email PDF Processor

Automatically poll an IMAP email server for new emails with PDF attachments and process them with Claude AI for analysis.

## Features

- 📧 **IMAP Email Polling** - Continuously monitors your inbox for new emails
- 📄 **PDF Extraction** - Automatically detects and extracts PDF attachments
- 🤖 **Claude AI Processing** - Sends PDFs directly to Claude for analysis (no JSON conversion needed!)
- 💾 **Optional Storage** - Save processed PDFs and analysis results to disk
- 🔄 **Automatic Processing** - Marks emails as read after processing (configurable)
- ⚙️ **Highly Configurable** - All settings via environment variables

## Quick Start

### 1. Install Dependencies

```bash
cd email-pdf-processor
npm install
```

### 2. Configure Environment

Copy the example environment file and edit with your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Email Configuration
IMAP_HOST=imap.gmail.com
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=your-app-password

# Claude API Key
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Run the Processor

```bash
npm start
```

The script will:
1. Connect to your IMAP server
2. Check for unread emails with PDF attachments
3. Send each PDF to Claude for analysis
4. Display the analysis results
5. Continue polling at the configured interval

## Configuration Options

All configuration is done via environment variables in the `.env` file:

### Email Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `IMAP_HOST` | - | IMAP server hostname (e.g., `imap.gmail.com`) |
| `IMAP_PORT` | `993` | IMAP server port |
| `IMAP_USER` | - | Your email address |
| `IMAP_PASSWORD` | - | Your email password or app password |
| `IMAP_TLS` | `true` | Use TLS encryption |
| `IMAP_MAILBOX` | `INBOX` | Mailbox to monitor |
| `SEARCH_CRITERIA` | `UNSEEN` | Email search criteria (`UNSEEN`, `ALL`, etc.) |

### Claude AI Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | - | Your Claude API key from console.anthropic.com |
| `CLAUDE_MODEL` | `claude-sonnet-4-5-20250929` | Claude model to use |
| `CLAUDE_MAX_TOKENS` | `4096` | Maximum response length |

Available models:
- `claude-opus-4-5-20251101` - Most capable, highest cost
- `claude-sonnet-4-5-20250929` - Balanced (recommended)
- `claude-haiku-4-5-20251001` - Fastest, lowest cost

### Processing Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL_MS` | `60000` | How often to check email (milliseconds) |
| `MARK_AS_READ` | `true` | Mark processed emails as read |
| `SAVE_PDFS` | `true` | Save PDF attachments to disk |
| `OUTPUT_DIR` | `./processed-pdfs` | Directory for saved PDFs |
| `SAVE_RESULTS` | `true` | Save analysis results to disk |
| `RESULTS_DIR` | `./results` | Directory for analysis JSON files |

## Email Provider Setup

### Gmail

1. Enable IMAP in Gmail settings
2. Create an App Password (if 2FA is enabled):
   - Go to Google Account → Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
3. Use these settings:
   ```env
   IMAP_HOST=imap.gmail.com
   IMAP_PORT=993
   IMAP_USER=your-email@gmail.com
   IMAP_PASSWORD=your-16-char-app-password
   ```

### Outlook/Office 365

```env
IMAP_HOST=outlook.office365.com
IMAP_PORT=993
```

### Yahoo Mail

```env
IMAP_HOST=imap.mail.yahoo.com
IMAP_PORT=993
```

### iCloud

```env
IMAP_HOST=imap.mail.me.com
IMAP_PORT=993
```

## How PDFs are Sent to Claude

**Important:** Claude's API supports PDFs natively - you do **NOT** need to convert them to JSON!

PDFs are sent as base64-encoded documents in the API request:

```javascript
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 4096,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdfBase64  // PDF as base64 string
          }
        },
        {
          type: 'text',
          text: 'Please analyze this PDF...'
        }
      ]
    }
  ]
});
```

Claude can directly read and analyze PDF content, extracting text, understanding structure, and providing insights.

## Customizing PDF Analysis

To customize what Claude analyzes in the PDFs, modify the `processPdfWithClaude` function in `email-poller.js`:

```javascript
const prompt = `Please analyze this PDF and:
1. Extract all invoice data
2. Identify the vendor and customer
3. Calculate the total amount
4. Flag any discrepancies

Document: ${filename}
Email: ${emailSubject}`;
```

## Output Files

### Processed PDFs (if enabled)

Saved to `./processed-pdfs/` with format:
```
2026-01-01T12-30-45-123Z_invoice.pdf
```

### Analysis Results (if enabled)

Saved to `./results/` as JSON files:
```json
{
  "success": true,
  "analysis": "Summary of the PDF content...",
  "filename": "invoice.pdf",
  "emailSubject": "Invoice #12345",
  "model": "claude-sonnet-4-5-20250929",
  "usage": {
    "input_tokens": 15234,
    "output_tokens": 892
  },
  "emailFrom": "sender@example.com",
  "emailDate": "2026-01-01T12:30:00.000Z",
  "processedAt": "2026-01-01T12:31:00.000Z"
}
```

## Example Output

```
🚀 Email PDF Processor starting...
✓ Configuration validated

⚙️  Configuration:
   IMAP Host: imap.gmail.com:993
   IMAP User: your-email@gmail.com
   Mailbox: INBOX
   Search: UNSEEN
   Poll Interval: 60000ms
   Mark as Read: true
   Claude Model: claude-sonnet-4-5-20250929

✓ Connected to IMAP server

🔍 Checking mailbox: INBOX
   Total messages: 152
   Unread messages: 3
   📬 Found 2 message(s) to process

📧 Processing email #150
  From: vendor@example.com
  Subject: Invoice #12345
  Date: 2026-01-01T10:30:00.000Z
  📎 Found 1 PDF attachment(s)
  Processing: invoice.pdf
  📄 Processing PDF with Claude: invoice.pdf (245.32 KB)
  ✓ Analysis complete (12456 in / 892 out tokens)

  📊 Analysis for invoice.pdf:
  ────────────────────────────────────────────────────────────
  This PDF contains Invoice #12345 dated January 1, 2026.

  Key Information:
  - Vendor: ACME Corporation
  - Total Amount: $12,450.00
  - Due Date: January 31, 2026
  - Payment Terms: Net 30

  Action Items:
  1. Review line items for accuracy
  2. Approve payment by January 24, 2026
  3. Forward to accounting department
  ────────────────────────────────────────────────────────────

  💾 Saved PDF to: ./processed-pdfs/2026-01-01T10-31-00-123Z_invoice.pdf
  💾 Saved analysis to: ./results/analysis_2026-01-01T10-31-00-456Z.json

✓ Completed processing email #150
```

## Error Handling

The script includes robust error handling:
- Invalid PDFs are skipped with error logging
- API failures are caught and logged
- IMAP connection errors trigger reconnection
- Individual email processing errors don't stop the poller

## Stopping the Processor

Press `Ctrl+C` to gracefully shutdown:

```
🛑 Shutting down gracefully...
IMAP connection ended
```

## Security Notes

- **Never commit your `.env` file** - it contains sensitive credentials
- Use app passwords instead of your main email password when possible
- Restrict file permissions on `.env`: `chmod 600 .env`
- Consider using a dedicated email account for automated processing
- Store the `.env` file securely on your local machine

## Troubleshooting

### "Missing required environment variables"

Make sure your `.env` file exists and contains all required variables:
- `IMAP_USER`
- `IMAP_PASSWORD`
- `IMAP_HOST`
- `ANTHROPIC_API_KEY`

### "IMAP connection error: Invalid credentials"

- Check your email and password are correct
- For Gmail, ensure you're using an App Password (not your regular password)
- Verify IMAP is enabled in your email provider settings

### "No new messages to process"

- Check that `SEARCH_CRITERIA` is set correctly (`UNSEEN` for unread emails)
- Verify emails actually contain PDF attachments
- Try setting `SEARCH_CRITERIA=ALL` to process all emails (temporarily)

### "Claude API error"

- Verify your `ANTHROPIC_API_KEY` is valid
- Check you have sufficient API credits
- Ensure the PDF isn't too large (Claude has file size limits)

## License

ISC
