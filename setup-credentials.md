# VeeFore API Credentials Setup Guide

## Core Required Credentials (Essential for basic functionality)

### 1. OpenAI API Key
- **Purpose**: Powers AI content generation, DALL-E image creation, thumbnails
- **Where to get**: https://platform.openai.com/api-keys
- **Format**: `sk-proj-...` (starts with sk-proj or sk-)
- **Add to Replit Secrets as**: `OPENAI_API_KEY`

### 2. SendGrid Email Service
- **Purpose**: Sends user verification emails and notifications
- **Where to get**: https://app.sendgrid.com/settings/api_keys
- **Credentials needed**:
  - `SENDGRID_API_KEY` (format: SG.xxxxx)
  - `SENDGRID_FROM_EMAIL` (your verified sender email)

### 3. Firebase Authentication
- **Purpose**: User login/signup system
- **Where to get**: https://console.firebase.google.com/
- **Credentials needed**:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_APP_ID`
  - `FIREBASE_SERVICE_ACCOUNT_KEY` (entire JSON object)

### 4. Security Keys (Generated for you)
- **Purpose**: Secure user sessions and JWT tokens
- **Use these generated secure keys**:
  - `JWT_SECRET`: `db9ab0bb32c99885d33aae14250d9388a6dc4a05301d54ad6eb2f35d7cb7066a`
  - `SESSION_SECRET`: `0d24eea6f069363b3fe741b211c3e994e4369cea9489d01cc34eb75c10d1cc75`

## Optional Social Media APIs (Add later)

### Instagram Business API
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`

### Twitter API v2
- `TWITTER_API_KEY`
- `TWITTER_API_SECRET`
- `TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_TOKEN_SECRET`

## Payment Processing (Add when needed)
### Razorpay (for Indian payments)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

### Stripe (for international payments)
- `STRIPE_SECRET_KEY`
- `VITE_STRIPE_PUBLIC_KEY`

## How to Add to Replit:
1. Go to your Replit project
2. Click on "Secrets" in the left sidebar (lock icon)
3. Add each key-value pair
4. Restart your app

## Priority Order:
1. **First**: OpenAI, SendGrid, Firebase, JWT/Session secrets
2. **Second**: Instagram, Twitter APIs for social features
3. **Third**: Payment processing when monetizing