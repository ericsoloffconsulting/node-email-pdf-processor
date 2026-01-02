# Railway Deployment Guide

## Prerequisites
- ✅ Railway account created
- ✅ GitHub repository with this code
- ✅ Railway connected to GitHub repo

## Step 1: Configure Railway Project

1. **Go to Railway Dashboard**: https://railway.app/dashboard
2. **Create New Project** → "Deploy from GitHub repo"
3. **Select Repository**: Choose your email-pdf-processor repo
4. **Railway will auto-detect**: Node.js project and use `npm start`

## Step 2: Add Environment Variables

In Railway Dashboard → Your Project → Variables tab, add ALL variables from `.env`:

### Required Variables:

```env
# Email Configuration
IMAP_HOST=secure.emailsrvr.com
IMAP_PORT=993
IMAP_USER=apzonecapture@brayandscarff.com
IMAP_PASSWORD=BASAPZonecap#2025
IMAP_TLS=true
MAILBOX=INBOX
SEARCH_CRITERIA=UNSEEN
MARK_AS_READ=true
POLL_INTERVAL_MS=300000

# Claude API
ANTHROPIC_API_KEY=your-anthropic-api-key-here
CLAUDE_MODEL=claude-haiku-4-5-20251001

# Local Storage (optional - Railway has ephemeral storage)
SAVE_PDFS=false
SAVE_RESULTS=false

# NetSuite Integration
NETSUITE_ENABLED=true
NETSUITE_RESTLET_URL=https://8289753.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=4085&deploy=1
NETSUITE_ACCOUNT_ID=8289753
NETSUITE_CONSUMER_KEY=a00a854d9f0829e0ca4cc242707b35c52923829683f4c3c34775da8808c8b3f8
NETSUITE_CONSUMER_SECRET=eac8b87e58df58ecf4dd63ab08682701bbfb76db8838b335ca380dd7bd570c06
NETSUITE_TOKEN_ID=11555f6250bc06594725a14c5cf9d7bd0c3ccf922f595ff9fdebb2f56e3106d0
NETSUITE_TOKEN_SECRET=c2025fd740513253cd4ee8890fcd0feb4e14dfff9a120c34473ed765b448b020
```

**Important**: 
- Set `SAVE_PDFS=false` and `SAVE_RESULTS=false` on Railway (ephemeral storage)
- Set `POLL_INTERVAL_MS=300000` (5 minutes) to avoid excessive polling

## Step 3: Deploy

1. **Click "Deploy"** in Railway
2. Railway will:
   - Install Node.js dependencies (`npm install`)
   - Run `npm start` (which runs `node email-poller.js`)
   - Keep the process running 24/7

## Step 4: Monitor Deployment

### View Logs
1. Go to Railway Dashboard → Your Project
2. Click on your service
3. Click "Logs" tab
4. You should see:
   ```
   🚀 Email PDF Processor starting...
   ✓ Configuration validated
   ✓ Connected to IMAP server
   🔍 Checking mailbox: INBOX
   ```

### Check Status
- **Deployments Tab**: Shows deployment history
- **Metrics Tab**: Shows CPU/Memory usage
- **Logs Tab**: Real-time application logs

## Step 5: Verify It's Working

1. **Send test email** to apzonecapture@brayandscarff.com with PDF attachment
2. **Wait 5 minutes** (or whatever POLL_INTERVAL_MS is set to)
3. **Check Railway logs** for:
   ```
   📬 Found 1 message(s) to process
   📎 Found X PDF attachment(s)
   ✓ Uploaded to NetSuite successfully
   ```
4. **Check NetSuite File Cabinet** for uploaded files

## Troubleshooting

### "Module not found" errors
**Problem**: Dependencies not installed
**Solution**: Railway should auto-install. Check Deployments tab for build logs.

### "Connection refused" errors
**Problem**: IMAP credentials incorrect
**Solution**: Double-check IMAP variables in Railway dashboard

### "Rate limit" errors
**Problem**: Too many Claude API calls
**Solution**: Already optimized (batch size 3, 5s delays). Should not occur.

### Process exits immediately
**Problem**: Error in code or missing env variables
**Solution**: Check Railway logs for error messages

### No new emails processed
**Problem**: POLL_INTERVAL_MS too high or SEARCH_CRITERIA wrong
**Solution**: 
- Check SEARCH_CRITERIA=UNSEEN
- Verify email is actually unread
- Check POLL_INTERVAL_MS (300000 = 5 minutes)

## Important Notes

### Railway-Specific Considerations

1. **Ephemeral Storage**: Railway doesn't persist files between deployments
   - PDFs and JSON saved locally will be lost on restart
   - That's OK - we upload to NetSuite immediately
   - Set `SAVE_PDFS=false` to avoid wasting space

2. **Always-On**: Railway keeps your app running 24/7
   - No need for cron jobs or schedulers
   - The Node.js app polls continuously

3. **Auto-Deploy**: Push to GitHub → Railway auto-deploys
   - Very convenient for updates
   - Can disable in Railway settings if needed

4. **Logs**: Check regularly for issues
   - Logs are retained for 7 days
   - Use for debugging and monitoring

5. **Cost**: Railway has usage-based pricing
   - Free tier: $5 credit/month
   - Enough for this lightweight app
   - ~$0.01/hour = ~$7/month if exceeding free tier

## Updating the Code

1. **Make changes locally**
2. **Push to GitHub**: `git push origin main`
3. **Railway auto-deploys** (if enabled)
4. **Check logs** to verify deployment succeeded

## Stopping the Service

**To pause polling temporarily:**
1. Railway Dashboard → Your Project
2. Click service → Settings → Pause Service

**To resume:**
1. Settings → Resume Service

## Security Best Practices

- ✅ Never commit `.env` file to GitHub (already in .gitignore)
- ✅ Environment variables stored securely in Railway
- ✅ Use Railway's built-in secret management
- ✅ Rotate credentials every 90 days
- ✅ Monitor Railway logs for unauthorized access

## Success Checklist

- [ ] Railway project created and connected to GitHub
- [ ] All environment variables added in Railway dashboard
- [ ] Deployment successful (check Deployments tab)
- [ ] Logs show "Email PDF Processor starting..."
- [ ] Logs show "Connected to IMAP server"
- [ ] Test email processed and uploaded to NetSuite
- [ ] NetSuite File Cabinet shows uploaded files

---

**Estimated Setup Time**: 15-20 minutes

**Result**: Fully automated Marcone credit memo processing running 24/7 in the cloud! 🎉
