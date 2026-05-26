# Quick Instagram Webhook Setup Checklist

## 🚀 Your Webhook URL
```
https://your-replit-app.replit.app/webhook/instagram-comments
```

## ✅ Step-by-Step Setup

### 1. Go to Meta for Developers
- Visit: https://developers.facebook.com
- Log in with your Facebook account
- Go to "My Apps"

### 2. Find Your App
- Select your existing Facebook App
- If you don't have one, create a new app

### 3. Add Instagram Product
- In left sidebar: Products → Add Product
- Find "Instagram" and click "Set Up"

### 4. Configure Webhooks
- In left sidebar: Instagram → Configuration
- Click "Add Webhook"
- Enter these details:

**Callback URL:**
```
https://your-replit-app.replit.app/webhook/instagram-comments
```

**Verify Token:**
```
veefore-124
```

**Subscription Fields:**
- ☑️ comments

### 5. Test Verification
- Click "Verify and Save"
- Should show green checkmark ✅

### 6. Environment Check
Your VeeFore app already has these configured:
- ✅ INSTAGRAM_WEBHOOK_VERIFY_TOKEN
- ✅ Instagram account connected (@rahulc1020)
- ✅ Webhook handler ready

## 🧪 Test Your Setup

### Quick Test
1. Post on your Instagram Business account
2. Have someone comment on the post
3. Check if they receive an automated DM

### Debug Test
Use this URL to test webhook verification:
```
https://your-replit-app.replit.app/webhook/instagram-comments?hub.mode=subscribe&hub.verify_token=veefore-124&hub.challenge=test123
```

Should return: `test123`

## 🔧 If Something Goes Wrong

### Webhook Not Verifying
- Check the URL is exactly right
- Make sure your Replit app is running
- Verify the token matches `veefore-124`

### No DMs Being Sent
- Ensure you have a PAGE_ACCESS_TOKEN configured
- Check Instagram account has messaging permissions
- Verify the account is a Business account

## 📞 Need Help?
- Check the full setup guide: `INSTAGRAM_WEBHOOK_SETUP_GUIDE.md`
- Use test endpoint: `POST /api/test-instagram-webhook`
- Monitor app logs for webhook events

---
*Your Instagram comment webhook system is ready to go! Just complete the Meta for Developers configuration above.*