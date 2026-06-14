# Shared Authentication Module

Consolidated email/password authentication logic for Main_App and Admin_Panel.

## Overview

The `EmailAuthController` provides common authentication functionality:
- User registration with email/password
- Login with credentials validation  
- Password hashing with bcrypt (12 salt rounds)
- Email verification with 6-digit OTP codes
- Password reset with secure tokens
- Support for both Main_App and Admin_Panel workflows

**Requirements:** 5.2, 6.3  
**Task:** 11.3

## Installation

```typescript
import { EmailAuthController } from '@/server/shared/auth';
```

## Usage

### 1. Implement Required Interfaces

The controller requires two dependencies:

#### EmailService Interface
```typescript
interface EmailService {
  sendVerificationEmail(email: string, code: string, firstName?: string): Promise<boolean>;
  sendPasswordResetEmail(email: string, token: string, firstName?: string): Promise<boolean>;
  generateOTP(): string;
  generateExpiry(): Date;
}
```

#### UserRepository Interface
```typescript
interface UserRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  create(data: Partial<AuthUser>): Promise<AuthUser>;
  update(id: string, data: Partial<AuthUser>): Promise<AuthUser>;
}
```

### 2. Instantiate Controller

```typescript
import { EmailAuthController } from '@/server/shared/auth';
import { emailService } from '@/services/email-service';
import { userRepository } from '@/repositories/user-repository';

const emailAuthController = new EmailAuthController(emailService, userRepository);
```

### 3. Use in Routes

#### Registration
```typescript
router.post('/register', emailAuthController.register.bind(emailAuthController));
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account.",
  "data": {
    "email": "user@example.com",
    "requiresVerification": true
  }
}
```

#### Login
```typescript
router.post('/login', emailAuthController.login.bind(emailAuthController));
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "123",
      "email": "user@example.com",
      "isEmailVerified": true
    }
  }
}
```

#### Email Verification
```typescript
router.post('/verify-email', emailAuthController.verifyEmail.bind(emailAuthController));
```

**Request:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

#### Forgot Password
```typescript
router.post('/forgot-password', emailAuthController.forgotPassword.bind(emailAuthController));
```

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

#### Reset Password
```typescript
router.post('/reset-password', emailAuthController.resetPassword.bind(emailAuthController));
```

**Request:**
```json
{
  "email": "user@example.com",
  "token": "secure-reset-token",
  "newPassword": "NewSecurePassword456"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Password has been reset successfully"
}
```

## Security Features

### Password Hashing
- Uses bcrypt with 12 salt rounds
- Passwords never stored in plain text
- Secure password comparison

### Email Verification
- 6-digit OTP codes
- 15-minute expiration
- Single-use codes (cleared after verification)

### Password Reset
- Secure random tokens (32 bytes hex)
- 1-hour expiration
- Tokens cleared after reset
- Email enumeration protection (always returns success)

### Input Validation
- Email format validation with strict regex
- Password minimum length (8 characters)
- Email normalization (lowercase, trimmed)
- Field presence validation

## Utility Methods

The controller also exposes utility methods for direct use:

```typescript
// Password hashing
const hashedPassword = await emailAuthController.hashPassword('MyPassword123');
const isValid = await emailAuthController.comparePassword('MyPassword123', hashedPassword);

// Token generation
const verificationCode = emailAuthController.generateVerificationCode(); // "123456"
const verificationExpiry = emailAuthController.generateVerificationExpiry(); // Date + 15 min
const resetToken = emailAuthController.generatePasswordResetToken(); // 64-char hex
const resetExpiry = emailAuthController.generatePasswordResetExpiry(); // Date + 1 hour
```

## Error Handling

All methods return structured error responses:

```json
{
  "success": false,
  "message": "Error description"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created (registration)
- `400` - Bad request (validation errors)
- `401` - Unauthorized (invalid credentials)
- `403` - Forbidden (unverified email)
- `404` - Not found (user doesn't exist)
- `409` - Conflict (user already exists)
- `500` - Internal server error

## Workflow Support

### Main Application Workflow
1. User registers → receives verification email
2. User verifies email → account activated
3. User logs in → creates session

### Admin Panel Workflow
1. Admin created by super admin → receives credentials
2. Admin resets password → secure token flow
3. Admin logs in → creates authenticated session

## Example Integration

```typescript
// server/routes/auth.routes.ts
import { Router } from 'express';
import { EmailAuthController } from '@/server/shared/auth';
import { emailService } from '@/services/email-service';
import { userRepository } from '@/repositories/user-repository';

const router = Router();
const emailAuthController = new EmailAuthController(emailService, userRepository);

// Registration & Verification
router.post('/register', emailAuthController.register.bind(emailAuthController));
router.post('/verify-email', emailAuthController.verifyEmail.bind(emailAuthController));

// Login
router.post('/login', emailAuthController.login.bind(emailAuthController));

// Password Reset
router.post('/forgot-password', emailAuthController.forgotPassword.bind(emailAuthController));
router.post('/reset-password', emailAuthController.resetPassword.bind(emailAuthController));

export default router;
```

## Testing

Unit tests should mock `EmailService` and `UserRepository` dependencies:

```typescript
import { EmailAuthController } from '@/server/shared/auth';

describe('EmailAuthController', () => {
  let controller: EmailAuthController;
  let mockEmailService: jest.Mocked<EmailService>;
  let mockUserRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    mockEmailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(true),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
      generateOTP: jest.fn().mockReturnValue('123456'),
      generateExpiry: jest.fn().mockReturnValue(new Date())
    };

    mockUserRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: '1', email: 'test@example.com' }),
      update: jest.fn().mockResolvedValue({ id: '1', email: 'test@example.com' })
    };

    controller = new EmailAuthController(mockEmailService, mockUserRepository);
  });

  // Test cases...
});
```

## Migration Guide

### Migrating from Main_App AuthController

**Before:**
```typescript
// server/controllers/AuthController.ts
class AuthController {
  sendVerificationEmail(req, res) { /* ... */ }
  verifyEmail(req, res) { /* ... */ }
}
```

**After:**
```typescript
import { EmailAuthController } from '@/server/shared/auth';
const emailAuthController = new EmailAuthController(emailService, userRepository);
router.post('/verify-email', emailAuthController.verifyEmail.bind(emailAuthController));
```

### Migrating from Admin Panel authController

**Before:**
```typescript
// admin-panel/server/controllers/authController.ts
export class AuthController {
  static async login(req, res) { /* ... */ }
}
```

**After:**
```typescript
import { EmailAuthController } from '@/server/shared/auth';
const emailAuthController = new EmailAuthController(emailService, adminRepository);
router.post('/login', emailAuthController.login.bind(emailAuthController));
```

## File Structure

```
server/shared/auth/
├── controllers/
│   ├── EmailAuthController.ts    # Main controller (~590 lines)
│   └── index.ts                   # Controller exports
├── index.ts                       # Module exports
└── README.md                      # This file
```

## Dependencies

- `express` - HTTP server framework
- `bcryptjs` - Password hashing
- `crypto` - Token generation

## License

Internal use only - Veefore project.
