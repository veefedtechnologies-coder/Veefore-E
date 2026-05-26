# Instagram Comment Webhook Setup Guide

## Overview
This guide walks you through setting up Instagram comment webhooks in Meta for Developers to enable automatic DM responses when users comment on your posts.

## Prerequisites
- Instagram Business Account connected to VeeFore
- Meta for Developers account
- Facebook App with Instagram Basic Display permissions

## Step-by-Step Setup

### 1. Access Meta for Developers
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Log in with your Facebook account
3. Navigate to "My Apps" in the top menu

### 2. Select Your App
1. Find your existing Facebook App or create a new one
2. Click on your app to access the dashboard
3. Make sure you have Instagram Basic Display product added

### 3. Configure Webhooks
1. In the left sidebar, click on "Webhooks"
2. Click "Add Subscription" for Instagram
3. Configure the following settings:

#### Webhook Configuration
- **Callback URL**: `https://your-replit-app.replit.app/webhook/instagram-comments`
- **Verify Token**: `veefore-124` (or your configured token)
- **Subscription Fields**: Check "comments"

### 4. Webhook URL Format
Replace `your-replit-app` with your actual Replit app name:
```
https://your-app-name.replit.app/webhook/instagram-comments
```

### 5. Verify Setup
1. Click "Verify and Save" in Meta for Developers
2. The system should successfully verify your webhook
3. You should see a green checkmark indicating successful verification

## Environment Variables Required

Ensure these environment variables are set in your Replit app:

```bash
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=veefore-124
PAGE_ACCESS_TOKEN=your_page_access_token
INSTAGRAM_APP_SECRET=your_app_secret
INSTAGRAM_APP_ID=your_app_id
```

## Testing the Webhook

### Manual Test
1. Go to your Replit app
2. Use the test endpoint: `POST /api/test-instagram-webhook`
3. This will verify your configuration

### Live Test
1. Post something on your connected Instagram Business account
2. Have someone comment on the post
3. Check your app logs to see webhook events being received
4. The commenter should receive an automated DM with your configured template

## Troubleshooting

### Common Issues

#### Webhook Verification Failed
- Check that your verify token matches exactly
- Ensure your Replit app is running and accessible
- Verify the webhook URL is correct

#### No DMs Being Sent
- Check that you have a valid PAGE_ACCESS_TOKEN
- Ensure the Instagram account has proper permissions
- Verify DM templates are configured

#### Permission Errors
- Make sure your Facebook App has Instagram permissions
- Check that the Instagram account is a Business account
- Verify the page access token has messaging permissions

### Debug Endpoints

Test your webhook configuration:
```bash
# Test webhook verification
curl "https://your-app.replit.app/webhook/instagram-comments?hub.mode=subscribe&hub.verify_token=veefore-124&hub.challenge=test123"

# Test system configuration
curl -X POST "https://your-app.replit.app/api/test-instagram-webhook" \
  -H "Authorization: Bearer your_auth_token"
```

## Current System Status

✅ **Webhook Handler**: Implemented and working
✅ **Verification Endpoint**: `/webhook/instagram-comments` (GET)
✅ **Event Processing**: `/webhook/instagram-comments` (POST)
✅ **DM Template System**: MongoDB-based template storage
✅ **Instagram Account**: @rahulc1020 (PageID: 17841474747481653)

## Next Steps

1. Complete Meta for Developers webhook setup
2. Test with a real Instagram comment
3. Monitor webhook events in app logs
4. Configure custom DM templates as needed

## Support

If you encounter issues:
1. Check the app console logs for error messages
2. Use the test endpoint to verify configuration
3. Ensure all environment variables are properly set
4. Verify Instagram Business account permissions