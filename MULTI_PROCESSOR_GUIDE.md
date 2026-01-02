# Multi-Processor Email Routing Guide

## Overview

The email processor now supports **multiple email types**, each with different:
- FROM/SUBJECT matching criteria
- NetSuite folder destinations
- Processing rules

This allows you to handle Marcone credits, vendor invoices, and other email types with a single application.

## How It Works

### 1. Email Matching

When an email arrives, the system:
1. Checks FROM address and SUBJECT line
2. Matches against defined processors in order
3. Uses the first matching processor's configuration
4. Skips emails that don't match any processor

### 2. Processor Configuration

Processors are defined in `email-poller.js`:

```javascript
const EMAIL_PROCESSORS = [
  {
    name: 'marcone_credits',
    enabled: process.env.MARCONE_ENABLED !== 'false',
    criteria: {
      from: 'no-replies@marcone.com',
      subjectContains: 'Credits processed by Marcone for 2684000'
    },
    netsuite: {
      pdfFolderId: process.env.MARCONE_PDF_FOLDER_ID,
      jsonFolderId: process.env.MARCONE_JSON_FOLDER_ID
    },
    claudePrompt: 'marcone'
  }
  // Add more processors here...
];
```

### 3. Environment Variables

Add to Railway Variables (or local `.env`):

**For Marcone Credits:**
```env
MARCONE_ENABLED=true
MARCONE_PDF_FOLDER_ID=12345    # NetSuite folder ID for PDFs
MARCONE_JSON_FOLDER_ID=12346   # NetSuite folder ID for JSON files
```

**For Additional Processors (example):**
```env
VENDOR_ENABLED=true
VENDOR_PDF_FOLDER_ID=23456
VENDOR_JSON_FOLDER_ID=23457
```

## Adding a New Processor

### Step 1: Add Processor Definition

Edit `email-poller.js` and add to `EMAIL_PROCESSORS` array:

```javascript
const EMAIL_PROCESSORS = [
  // Existing Marcone processor...
  
  // NEW: Vendor Invoices
  {
    name: 'vendor_invoices',
    enabled: process.env.VENDOR_ENABLED === 'true',
    criteria: {
      from: 'invoices@vendor.com',
      subjectContains: 'Invoice'  // Partial match
    },
    netsuite: {
      pdfFolderId: process.env.VENDOR_PDF_FOLDER_ID,
      jsonFolderId: process.env.VENDOR_JSON_FOLDER_ID
    },
    claudePrompt: 'vendor_invoice' // Could add custom prompts later
  }
];
```

### Step 2: Add Environment Variables

**Railway Dashboard → Variables:**
```
VENDOR_ENABLED=true
VENDOR_PDF_FOLDER_ID=23456
VENDOR_JSON_FOLDER_ID=23457
```

**Local `.env` file:**
```env
VENDOR_ENABLED=true
VENDOR_PDF_FOLDER_ID=23456
VENDOR_JSON_FOLDER_ID=23457
```

### Step 3: Create NetSuite Folders

1. Go to Documents > Files > File Cabinet
2. Create two folders:
   - `Vendor_PDFs_Unprocessed` (note the folder ID: e.g., 23456)
   - `Vendor_JSON_Unprocessed` (note the folder ID: e.g., 23457)
3. Use these IDs in environment variables

### Step 4: Commit & Deploy

```bash
cd ~/path/to/node-email-pdf-processor
git add -A
git commit -m "Add vendor invoice processor"
git push origin main
```

Railway will auto-deploy with new configuration.

## Email Matching Rules

### FROM Field Matching
- Case-insensitive partial match
- Checks against `email.from.text` or `email.from.value[0].address`
- Examples:
  - `'no-replies@marcone.com'` matches "no-replies@marcone.com"
  - `'vendor.com'` matches "invoices@vendor.com"

### SUBJECT Field Matching
- Case-sensitive partial match (contains)
- Examples:
  - `'Credits processed by Marcone'` matches full subject with date suffix
  - `'Invoice'` matches any subject containing "Invoice"
  - `'PO#'` matches purchase orders

## Example Use Cases

### 1. Marcone Credit Memos (Current)
```javascript
{
  name: 'marcone_credits',
  criteria: {
    from: 'no-replies@marcone.com',
    subjectContains: 'Credits processed by Marcone for 2684000'
  }
}
```

### 2. Multiple Vendors
```javascript
{
  name: 'vendor_a_invoices',
  criteria: {
    from: '@vendora.com',
    subjectContains: 'Invoice'
  }
},
{
  name: 'vendor_b_invoices',
  criteria: {
    from: '@vendorb.com',
    subjectContains: 'Invoice'
  }
}
```

### 3. Different Document Types
```javascript
{
  name: 'purchase_orders',
  criteria: {
    from: 'orders@supplier.com',
    subjectContains: 'PO#'
  }
},
{
  name: 'packing_slips',
  criteria: {
    from: 'shipping@supplier.com',
    subjectContains: 'Packing Slip'
  }
}
```

## Logs & Debugging

When an email is processed, logs show:

```
📧 Processing email #123
  From: no-replies@marcone.com
  Subject: Credits processed by Marcone for 2684000 - 01/02/2026
  ✓ Matched processor: marcone_credits
  📎 Found 1 PDF attachment(s)
  📤 Uploading to NetSuite RESTlet...
    PDF Folder ID: 12345
    JSON Folder ID: 12346
  ✓ Uploaded to NetSuite successfully
```

If no processor matches:
```
📧 Processing email #124
  From: spam@unknown.com
  Subject: Unknown email
  ⚠️  No matching processor for this email
  ⏭️  Skipping - no matching processor for this email
```

## Current Configuration

**Marcone Credits:**
- FROM: `no-replies@marcone.com`
- SUBJECT contains: `Credits processed by Marcone for 2684000`
- PDF Folder: Set `MARCONE_PDF_FOLDER_ID`
- JSON Folder: Set `MARCONE_JSON_FOLDER_ID`

## Next Steps

1. **Set Marcone folder IDs** in Railway variables
2. **Test** by marking a Marcone email as unread
3. **Monitor logs** to verify correct folder routing
4. **Add more processors** as needed for other email types

## NetSuite RESTlet Updates

The RESTlet now accepts dynamic folder IDs:

```javascript
POST https://account.restlets.api.netsuite.com/...
{
  "pdfBase64": "...",
  "pdfFilename": "file.pdf",
  "extractedData": {...},
  "pdfFolderId": "12345",      // Dynamic!
  "jsonFolderId": "12346"      // Dynamic!
}
```

Falls back to script parameters if not provided.
