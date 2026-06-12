# Firebase Token Flow - Visual Diagram

## 🔴 BEFORE (Broken Flow)

```
┌──────────────────────────────────────────────────────────────┐
│                    INITIAL LOGIN                              │
└──────────────────────────────────────────────────────────────┘

User → Google OAuth → Server
                      ├─ Creates Custom Token
                      └─ Stores Custom Token in Cookie
                                    ↓
                      Client gets Custom Token
                                    ↓
                      signInWithCustomToken()
                                    ↓
                      Firebase returns ID Token
                                    ↓
                      ❌ Cookie still has Custom Token!

┌──────────────────────────────────────────────────────────────┐
│               TOKEN REFRESH (55 mins later)                   │
└──────────────────────────────────────────────────────────────┘

Client → POST /api/auth/refresh
              ↓
       Server reads Cookie (Custom Token)
              ↓
       Server: verifyIdToken(Custom Token)
              ↓
       ❌ FAIL! "Invalid or expired token"
              ↓
       Returns 401 Error
```

## ✅ AFTER (Fixed Flow)

```
┌──────────────────────────────────────────────────────────────┐
│                    INITIAL LOGIN                              │
└──────────────────────────────────────────────────────────────┘

User → Google OAuth → Server
                      ├─ Creates Custom Token
                      └─ Stores Custom Token in Cookie
                                    ↓
                      Client calls /api/auth/session
                                    ↓
                      Gets Custom Token
                                    ↓
                      signInWithCustomToken()
                                    ↓
                      Firebase returns ID Token
                                    ↓
                      POST /api/auth/update-token
                                    ↓
                      ✅ Cookie updated with ID Token

┌──────────────────────────────────────────────────────────────┐
│               TOKEN REFRESH (55 mins later)                   │
└──────────────────────────────────────────────────────────────┘

Client → POST /api/auth/refresh
              ↓
       Server reads Cookie (ID Token)
              ↓
       Server: verifyIdToken(ID Token)
              ↓
       ✅ SUCCESS!
              ↓
       Creates new Custom Token
              ↓
       Returns Custom Token in response
              ↓
       Client: signInWithCustomToken()
              ↓
       Firebase returns new ID Token
              ↓
       Client: POST /api/auth/update-token
              ↓
       ✅ Cookie updated with new ID Token
```

## Key Difference

### Before
```
Cookie: Custom Token → Server tries to verify as ID Token → ❌ FAIL
```

### After
```
Cookie: ID Token → Server verifies as ID Token → ✅ SUCCESS
```

## Token Type Comparison

| Token Type | Created By | Used For | Can Be Verified? |
|------------|-----------|----------|------------------|
| **Custom Token** | Firebase Admin SDK (Server) | Authenticating with Firebase Client SDK | ❌ No direct verification |
| **ID Token** | Firebase Client SDK | Making authenticated requests | ✅ Yes, with verifyIdToken() |

## The Fix in One Sentence

**We now ensure the cookie always contains an ID Token (which can be verified) instead of a Custom Token (which cannot be verified).**
