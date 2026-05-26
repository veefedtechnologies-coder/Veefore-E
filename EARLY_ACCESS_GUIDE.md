# VeeFore Early Access System Guide

## Current Status

The VeeFore early access system is currently configured to work with **only one approved email**: `arpitchoudhary128@gmail.com`

## How It Works

### 1. Device Fingerprinting
- The system uses IP address + User Agent to identify devices
- When a user joins the waitlist, their device fingerprint is stored
- Only devices that joined the waitlist can access the app

### 2. Email Validation
- Users must sign in with the exact email they used to join the waitlist
- The system checks if the email has `status: 'early_access'` in the database
- If not approved, users see the access restricted modal

### 3. Current Approved Users
Currently only these users have early access:
- `arpitchoudhary128@gmail.com` (status: 'early_access')

## How to Add More Users

### Option 1: Using the Script (Recommended)
1. Edit `add-early-access-user.js`
2. Change the email and name in the `newUser` object
3. Run: `node add-early-access-user.js`

### Option 2: Direct Database Method
Connect to MongoDB and run:
```javascript
db.waitlist_users.insertOne({
  email: 'newuser@example.com',
  name: 'New User Name',
  status: 'early_access',
  referralCode: 'REF' + Date.now(),
  joinedAt: new Date(),
  approvedAt: new Date(),
  updatedAt: new Date(),
  deviceFingerprint: {
    ip: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});
```

### Option 3: Through Admin Panel
1. Access the admin panel at `/admin`
2. Use the "Upgrade User" feature
3. Promote waitlist users to early access

## Testing the System

1. **Add a new user** using one of the methods above
2. **Try signing in** with that email address
3. **Should work** - user gets access to the app
4. **Try with different email** - should show access restricted modal

## Technical Implementation

### Database Structure
```javascript
// waitlist_users collection
{
  _id: ObjectId,
  email: String,
  name: String,
  status: 'waitlist' | 'early_access',
  referralCode: String,
  joinedAt: Date,
  approvedAt: Date,
  updatedAt: Date,
  deviceFingerprint: {
    ip: String,
    userAgent: String
  }
}
```

### API Endpoints
- `GET /api/early-access/check-device` - Check if device is on waitlist
- `POST /api/early-access/join` - Join waitlist
- `GET /api/early-access/status/:email` - Check user status
- `POST /api/early-access/promote/:id` - Promote user to early access

### Authentication Flow
1. User signs in with Google/Email
2. System checks if email exists in waitlist_users
3. If exists and status is 'early_access', allow access
4. If not, show access restricted modal with approved email

## Security Features

### Device Fingerprinting
- Prevents multiple waitlist entries from same device
- Flexible matching (handles IP changes, different browsers)
- Stores device info for user identification

### Email Validation
- Only approved emails can access the app
- System shows the specific approved email in error messages
- Automatic sign-out of unauthorized users

## Current Limitations

1. **Single Email**: Only `arpitchoudhary128@gmail.com` is approved
2. **Manual Management**: New users must be added manually
3. **No Self-Service**: Users can't upgrade themselves

## Recommendations

1. **Add More Test Users**: Use the script to add more approved emails
2. **Admin Dashboard**: Use the admin panel for user management
3. **Bulk Operations**: Use the bulk upgrade feature for multiple users
4. **Monitoring**: Check the console logs for authentication events

## Example Usage

```bash
# Add a new early access user
node add-early-access-user.js

# Check current users
node debug-early-access-users.js

# Promote user via admin API
curl -X POST http://localhost:5000/api/early-access/promote/USER_ID
```

## Support

For issues with the early access system:
1. Check the console logs for authentication events
2. Verify user exists in waitlist_users collection
3. Ensure user has status: 'early_access'
4. Check device fingerprint matching