# AP Assist Transaction Validation - System Diagram

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EMAIL PROCESSING PHASE                          │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │ Email Server │
    │ (IMAP/Gmail) │
    └──────┬───────┘
           │ PDF Attachment
           ▼
    ┌──────────────────┐
    │  Railway Node.js │ ◄─── email-poller.js
    │  Email Poller    │
    └──────┬───────────┘
           │ 1. Extract PDF
           │ 2. Call Claude API (extract data)
           │ 3. Send PDF + JSON to NetSuite
           ▼
    ┌──────────────────┐
    │ NetSuite RESTlet │ ◄─── node_pdf_receiver_restlet.js
    │ (Receiver)       │
    └──────┬───────────┘
           │ Save files to folders
           ▼
    ┌──────────────────┐
    │ File Cabinet     │
    │ - PDF folder     │
    │ - JSON folder    │
    └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    TRANSACTION CREATION PHASE                           │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐
    │ Scheduled Script │ ◄─── AP Assist Marcone Bill Credits.js
    │ (Processor)      │
    └──────┬───────────┘
           │ 1. Read JSON files from folder
           │ 2. Parse credit memo data
           │ 3. Create transactions
           ▼
    ┌──────────────────────────────────────────────────────────┐
    │                NetSuite Transactions                     │
    │                                                          │
    │  Vendor Credit           OR          Journal Entry       │
    │  ┌──────────────┐                   ┌──────────────┐   │
    │  │ Header:      │                   │ Header:      │   │
    │  │ - Vendor     │                   │ - Customer   │   │
    │  │ - Amount     │                   │ - Amount     │   │
    │  │ - Date       │                   │ - Date       │   │
    │  │              │                   │              │   │
    │  │ Lines:       │                   │ Lines:       │   │
    │  │ - Items      │                   │ - Debits     │   │
    │  │ - Accounts   │                   │ - Credits    │   │
    │  │ - Amounts    │                   │ - Entities   │   │
    │  │              │                   │              │   │
    │  │ Flags:       │                   │ Flags:       │   │
    │  │ ✓ Processed  │                   │ ✓ Processed  │   │
    │  │ ✗ Validated  │                   │ ✗ Validated  │   │
    │  │              │                   │              │   │
    │  │ Files:       │                   │ Files:       │   │
    │  │ 📄 PDF       │                   │ 📄 PDF       │   │
    │  │ 📄 JSON      │                   │ 📄 JSON      │   │
    │  └──────────────┘                   └──────────────┘   │
    └──────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      VALIDATION PHASE (NEW)                             │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐
    │ Scheduled Script │ ◄─── transaction_validation_scheduled.js
    │ (Validator)      │      (Runs hourly/daily)
    │                  │
    │ Searches for:    │
    │ - Processed = ✓  │
    │ - Validated = ✗  │
    └──────┬───────────┘
           │ Found 5 transactions to validate
           ▼
    ┌──────────────────────────────────────────────┐
    │  Transaction Validation Library              │
    │  (transaction_validation_library.js)         │
    │                                              │
    │  For each transaction:                       │
    │  1. Load transaction record                  │
    │  2. Extract header fields                    │
    │  3. Extract line items                       │
    │  4. Load attached JSON file                  │
    │  5. Load attached PDF file (optional)        │
    │  6. Format as markdown                       │
    │  7. Build validation prompt                  │
    └──────┬───────────────────────────────────────┘
           │ Prepared validation package
           ▼
    ┌──────────────────────────────────────────────┐
    │  Claude API Library                          │
    │  (claude_api_library.js)                     │
    │                                              │
    │  1. Send to Claude API                       │
    │  2. Model: Sonnet 3.5                        │
    │  3. Enable prompt caching                    │
    │  4. Receive validation report                │
    └──────┬───────────────────────────────────────┘
           │ Validation result
           ▼
    ┌──────────────────────────────────────────────┐
    │  Claude AI Analysis                          │
    │                                              │
    │  Compares:                                   │
    │  - NetSuite amounts ←→ JSON amounts          │
    │  - NetSuite accounts ←→ Expected accounts    │
    │  - NetSuite entities ←→ JSON entities        │
    │  - Line count ←→ JSON line count             │
    │  - NARDA patterns ←→ JSON patterns           │
    │                                              │
    │  Returns:                                    │
    │  ✓ PASS or ✗ FAIL                           │
    │  + Detailed validation report                │
    │  + Critical issues list                      │
    │  + Warnings                                  │
    │  + Recommendation (APPROVE/REJECT)           │
    └──────┬───────────────────────────────────────┘
           │ Validation complete
           ▼
    ┌──────────────────────────────────────────────┐
    │  Update Transaction                          │
    │                                              │
    │  Set fields:                                 │
    │  - Validated = ✓                             │
    │  - Validation Date = Today                   │
    │  - Validation Pass = ✓ or ✗                 │
    │  - Validation Notes = Report                 │
    │                                              │
    │  If critical issues:                         │
    │  - Validation Fail = ✓                       │
    │  - Flag for review                           │
    └──────┬───────────────────────────────────────┘
           │
           ▼
    ┌──────────────────────────────────────────────┐
    │  Email Summary Report                        │
    │                                              │
    │  To: accounting@company.com                  │
    │                                              │
    │  Subject: AP Assist Validation Report        │
    │                                              │
    │  Total Validated: 5                          │
    │  Passed: 4 (80%)                             │
    │  Failed: 1 (20%)                             │
    │  Critical Issues: 1                          │
    │                                              │
    │  Failed Transaction Details:                 │
    │  - VC-12345: Amount mismatch ($0.05)         │
    │  - Recommendation: Review and correct        │
    └──────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         REVIEW PHASE                                    │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐
    │  Saved Search    │ ◄─── "AP Assist - Failed Validations"
    │  (Dashboard)     │
    └──────┬───────────┘
           │ Shows flagged transactions
           ▼
    ┌──────────────────────────────────────────────┐
    │  Accountant Reviews                          │
    │                                              │
    │  Transaction: VC-12345                       │
    │  Issue: Amount mismatch on line 2            │
    │  Expected: $124.95                           │
    │  Actual: $125.00                             │
    │                                              │
    │  Action: Correct transaction or approve      │
    └──────┬───────────────────────────────────────┘
           │
           ▼
    ┌──────────────────┐
    │  Transaction     │
    │  Corrected       │
    │  OR              │
    │  Approved        │
    └──────────────────┘
```

## Key Integration Points

### 1. Railway → NetSuite (Existing)
- **Purpose:** Email polling and PDF extraction
- **Technology:** Node.js + Claude API
- **Deployed:** Railway
- **Script:** email-poller.js → node_pdf_receiver_restlet.js

### 2. NetSuite Processing (Existing)
- **Purpose:** Create transactions from extracted data
- **Technology:** SuiteScript 2.1
- **Script:** AP Assist Marcone Bill Credits.js

### 3. NetSuite Validation (NEW)
- **Purpose:** Validate transactions against source
- **Technology:** SuiteScript 2.1 + Claude API
- **Scripts:**
  - transaction_validation_library.js
  - claude_api_library.js
  - transaction_validation_scheduled.js

## Why Direct NetSuite → Claude?

```
❌ APPROACH 1: Through Railway (Complex, Unnecessary)
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ NetSuite │ → │ Railway  │ → │ Claude   │ → │ Railway  │ → │ NetSuite │
│          │    │ (proxy)  │    │   API    │    │ (return) │    │ (update) │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
   ↑                                                                   │
   └───────────────────────── Data round-trip ────────────────────────┘

Problems:
- Requires exposing NetSuite data externally
- More points of failure
- Higher latency
- Duplicate API integration code
- Railway must handle NetSuite auth
- More complex error handling

✓ APPROACH 2: Direct (Simple, Secure, Fast)
┌──────────┐    ┌──────────┐    ┌──────────┐
│ NetSuite │ → │ Claude   │ → │ NetSuite │
│          │    │   API    │    │ (update) │
└──────────┘    └──────────┘    └──────────┘
      ↑                              │
      └────── Data stays local ──────┘

Benefits:
- Data never leaves NetSuite (except to Claude)
- Uses existing claude_api_library.js
- Simpler architecture
- Better governance control
- Easier to debug
- No Railway dependency for validation
```

## Data Format Examples

### Transaction Data (Sent to Claude)

```markdown
# NetSuite Transaction Summary

**Record Type:** vendorcredit
**Record ID:** 12345
**Extracted At:** 2026-01-02T10:30:00Z

## Transaction Header

| Field | Value |
|-------|-------|
| tranid | VC-12345 |
| trandate | 01/02/2026 |
| entity | Marcone Appliance Parts (2106) |
| total | $524.95 |
| memo | Marcone Credit Memo 67718694 |
| custbody_narda_number | J12345 |

## Line Items (3 lines)

### Line 1 - item
- **item:** Widget Part #123
- **quantity:** 2
- **rate:** $150.00
- **amount:** $300.00
- **account:** 111 - Accounts Payable
- **custcol_narda_number:** J12345

### Line 2 - item
- **item:** Gadget Part #456
- **quantity:** 1
- **rate:** $124.95
- **amount:** $124.95
- **account:** 111 - Accounts Payable
- **custcol_narda_number:** J12345

### Line 3 - expense
- **account:** 367 - Freight
- **amount:** $100.00
- **memo:** Delivery charges
- **custcol_narda_number:** J12345

## Attached Files (2 files)
- **2026-01-02T09-15-00_marcone_67718694.json** (JSON, 2.5 KB)
- **2026-01-02T09-15-00_marcone_67718694.pdf** (PDF, 45 KB)

---

## Source JSON Data

```json
{
  "invoiceNumber": "67718694",
  "totalAmount": 524.95,
  "lineItems": [
    {
      "description": "Widget Part #123",
      "quantity": 2,
      "unitPrice": 150.00,
      "amount": 300.00,
      "nardaNumber": "J12345"
    },
    {
      "description": "Gadget Part #456",
      "quantity": 1,
      "unitPrice": 124.95,
      "amount": 124.95,
      "nardaNumber": "J12345"
    }
  ],
  "deliveryAmount": 100.00
}
```
```

### Claude Response Example

```
# VALIDATION REPORT

## Status: ✓ PASS

## Critical Issues
None found.

## Warnings
- PDF shows delivery date 12/30/2025 but transaction dated 01/02/2026
  (This is normal for year-end processing)

## Summary
Transaction data matches source JSON perfectly:
- Header total: $524.95 ✓
- Line 1 amount: $300.00 ✓
- Line 2 amount: $124.95 ✓
- Freight amount: $100.00 ✓
- NARDA number J12345 applied to all lines ✓
- Vendor entity correct (Marcone 2106) ✓
- Account assignments correct ✓

All amounts, accounts, entities, and references validated successfully.

## Recommendation
**APPROVE** - Transaction is accurate and ready for posting.
```

## Cost Analysis per Transaction

### With Prompt Caching Enabled

```
First Transaction (Cold Cache):
┌─────────────────────┬────────────┬──────────┐
│ Component           │ Tokens     │ Cost     │
├─────────────────────┼────────────┼──────────┤
│ System Prompt       │ 500        │ $0.0015  │
│ Transaction Data    │ 1,500      │ $0.0045  │
│ JSON Data           │ 800        │ $0.0024  │
│ Output              │ 600        │ $0.0180  │
├─────────────────────┼────────────┼──────────┤
│ TOTAL               │ 3,400      │ $0.0264  │
└─────────────────────┴────────────┴──────────┘

Subsequent Transactions (Hot Cache - within 5 min):
┌─────────────────────┬────────────┬──────────┐
│ Component           │ Tokens     │ Cost     │
├─────────────────────┼────────────┼──────────┤
│ System Prompt       │ 500 (read) │ $0.0001  │
│ Transaction Data    │ 1,500      │ $0.0045  │
│ JSON Data           │ 800        │ $0.0024  │
│ Output              │ 600        │ $0.0180  │
├─────────────────────┼────────────┼──────────┤
│ TOTAL               │ 3,400      │ $0.0250  │
└─────────────────────┴────────────┴──────────┘

10 Transactions in Batch:
= 1 cold + 9 hot
= $0.0264 + (9 × $0.0250)
= $0.0264 + $0.2250
= $0.2514 (~$0.25)
```

## Performance Metrics

### Expected Processing Times

```
Per Transaction Validation:
┌─────────────────────────┬──────────┐
│ Step                    │ Time     │
├─────────────────────────┼──────────┤
│ Load transaction        │ 0.5s     │
│ Extract data            │ 0.3s     │
│ Load files              │ 0.4s     │
│ Format markdown         │ 0.2s     │
│ Build prompt            │ 0.1s     │
│ Call Claude API         │ 3-5s     │
│ Parse response          │ 0.2s     │
│ Update transaction      │ 0.5s     │
├─────────────────────────┼──────────┤
│ TOTAL                   │ 5-7s     │
└─────────────────────────┴──────────┘

Batch of 10 Transactions:
= 10 × 6s (avg)
= 60 seconds (~1 minute)

With parallel processing (future):
= Can reduce to ~15-20 seconds
```

## Success Metrics

### Week 1 Targets
- ✓ All transactions flagged for validation
- ✓ Validation runs without errors
- ✓ Pass rate: 70-90%
- ✓ Email reports sent reliably

### Month 1 Targets
- ✓ Pass rate: 85-95%
- ✓ Error catch rate: 2-5 issues per 100 transactions
- ✓ Manual review time reduced by 70%
- ✓ Zero critical errors reaching GL

### Ongoing Monitoring
- Track pass rate trends
- Monitor false positive rate
- Measure time savings
- Calculate ROI (errors caught vs. cost)

---

**Created:** January 2, 2026  
**System:** AP Assist Transaction Validation  
**Technology Stack:** NetSuite SuiteScript 2.1 + Claude AI (Sonnet 3.5)
