# Instagram OAuth Configuration Setup

## Current Issue
The Instagram OAuth is failing because the redirect URI in your Facebook Developer App doesn't match the Replit domain.

## Required Configuration

### 1. Facebook Developer Console Setup
Go to [Facebook for Developers](https://developers.facebook.com/) and update your Instagram Basic Display app:

**Current Replit Domain:** `393861ee-ce5d-42cd-9ffd-40f54ad0f848-00-ppbc7nwodik9.kirk.replit.dev`

**Required Redirect URI:** `https://393861ee-ce5d-42cd-9ffd-40f54ad0f848-00-ppbc7nwodik9.kirk.replit.dev/api/instagram/callback`

### 2. Steps to Fix:

1. **Login to Facebook for Developers**
   - Go to https://developers.facebook.com/
   - Navigate to your Instagram Basic Display app

2. **Update OAuth Redirect URIs**
   - Go to Instagram Basic Display → Basic Display
   - In "OAuth Redirect URIs" section, add:
     ```
     https://393861ee-ce5d-42cd-9ffd-40f54ad0f848-00-ppbc7nwodik9.kirk.replit.dev/api/instagram/callback
     ```

3. **Update Valid OAuth Redirect URIs**
   - In your app settings, ensure this exact URL is listed
   - Remove any old localhost URLs
   - Save changes

4. **Webhook Configuration** (Optional)
   - Webhook URL: `https://393861ee-ce5d-42cd-9ffd-40f54ad0f848-00-ppbc7nwodik9.kirk.replit.dev/webhook/instagram`
   - Verify Token: Use the value from `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` secret

### 3. Test the Integration
After updating the Facebook Developer settings:
1. Go to VeeFore onboarding page
2. Click "Connect Instagram"
3. The OAuth flow should work without errors

## Current Configuration
- **App ID:** Already configured in Replit Secrets
- **App Secret:** Already configured in Replit Secrets  
- **Redirect URI:** Automatically uses current Replit domain
- **Webhook Verify Token:** Already configured in Replit Secrets

## Important Notes
- The redirect URI must match exactly (including https://)
- Any time you get a new Replit domain, you'll need to update this
- Instagram Business API requires app review for production use