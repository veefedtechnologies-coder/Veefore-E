import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { waitlistUserRepository } from '../../repositories/WaitlistUserRepository';
import { generateReferralCode } from '../../storage/converters';
import { emailService } from '../../email-service';

const router = Router();

// ============================================
// SECURITY UTILITIES
// ============================================

// Sanitize string input - remove potential XSS/injection characters
const sanitizeString = (input: string): string => {
    if (typeof input !== 'string') return '';
    return input
        .trim()
        .replace(/[<>'";&$`\\]/g, '') // Remove dangerous characters
        .replace(/\s+/g, ' ')          // Normalize whitespace
        .substring(0, 500);            // Limit length
};

// Validate and normalize email - strict format check
const sanitizeEmail = (email: string): string | null => {
    if (typeof email !== 'string') return null;

    const normalized = email.toLowerCase().trim();

    // Length check (RFC 5321 limits)
    if (normalized.length < 3 || normalized.length > 254) return null;

    // Strict email regex - no special characters that could enable injection
    const strictEmailRegex = /^[a-z0-9]([a-z0-9._+-]*[a-z0-9])?@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/i;
    if (!strictEmailRegex.test(normalized)) return null;

    // Block common injection patterns
    const injectionPatterns = [
        /\$|\{|\}|\[|\]/,          // NoSQL injection
        /--|;|'|"|`/,               // SQL injection
        /<|>|script/i,              // XSS
        /\x00|\x0d|\x0a/,           // Null/CRLF injection
    ];

    for (const pattern of injectionPatterns) {
        if (pattern.test(normalized)) return null;
    }

    return normalized;
};

// ============================================
// INPUT VALIDATION SCHEMAS (Strict)
// ============================================

const waitlistSchema = z.object({
    name: z.string()
        .min(1, "Name is required")
        .max(100, "Name too long")
        .transform(sanitizeString)
        .refine(val => val.length >= 1, "Name is required"),
    email: z.string()
        .email("Invalid email address")
        .max(254, "Email too long")
        .transform(val => sanitizeEmail(val))
        .refine((val): val is string => val !== null, "Invalid email format"),
    role: z.string().max(50).optional().transform(val => val ? sanitizeString(val) : undefined),
    questionnaire: z.record(z.unknown()).optional().transform(val => {
        // Sanitize questionnaire values
        if (!val) return undefined;
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(val)) {
            const sanitizedKey = sanitizeString(key).substring(0, 50);
            if (typeof value === 'string') {
                sanitized[sanitizedKey] = sanitizeString(value);
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                sanitized[sanitizedKey] = value;
            }
            // Skip other types for security
        }
        return sanitized;
    })
});

const emailCheckSchema = z.object({
    email: z.string()
        .email("Invalid email address")
        .max(254, "Email too long")
});

// ============================================
// RATE LIMITING (In-memory, per-IP)
// ============================================

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;     // 10 requests per minute

const checkRateLimit = (ip: string): boolean => {
    const now = Date.now();
    const entry = rateLimitStore.get(ip);

    if (!entry || now > entry.resetTime) {
        rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }

    if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
        return false;
    }

    entry.count++;
    return true;
};

// Cleanup old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitStore.entries()) {
        if (now > entry.resetTime) {
            rateLimitStore.delete(ip);
        }
    }
}, 5 * 60 * 1000); // Every 5 minutes

// ============================================
// ROUTES
// ============================================

// Check if email already exists on waitlist
router.get('/check-email', async (req: Request, res: Response) => {
    try {
        // Rate limiting
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        if (!checkRateLimit(clientIp)) {
            return res.status(429).json({ error: "Too many requests. Please try again later." });
        }

        // Validate email parameter
        const emailParam = req.query.email;
        if (typeof emailParam !== 'string') {
            return res.status(400).json({ error: "Email is required" });
        }

        // Sanitize and validate email
        const email = sanitizeEmail(emailParam);
        if (!email) {
            return res.status(400).json({ error: "Invalid email format" });
        }

        // Safe database query with sanitized email
        const existingUser = await waitlistUserRepository.findByEmail(email);

        res.json({
            exists: !!existingUser,
            message: existingUser ? "This email is already on the waitlist. We'll be in touch soon!" : null
        });
    } catch (error) {
        console.error('[WAITLIST] Error checking email:', error);
        res.status(500).json({ error: "Failed to check email" });
    }
});

// Join the waitlist
router.post('/join', async (req: Request, res: Response) => {
    try {
        // Rate limiting
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        if (!checkRateLimit(clientIp)) {
            return res.status(429).json({ error: "Too many requests. Please try again later." });
        }

        // Validate and sanitize all input
        const validatedData = waitlistSchema.parse(req.body);

        // Check for duplicate email (using sanitized email)
        const existingUser = await waitlistUserRepository.findByEmail(validatedData.email);
        if (existingUser) {
            return res.status(400).json({
                error: "This email is already on the waitlist. We'll be in touch soon!"
            });
        }

        const { name, email, role, questionnaire } = validatedData;

        // Create new waitlist user with sanitized data
        const newUser = await waitlistUserRepository.createWithDefaults({
            name,
            email,
            referralCode: generateReferralCode(),
            metadata: {
                role,
                questionnaire,
                source: 'web_modal_v1',
                // Sanitize user agent
                userAgent: sanitizeString(req.get('User-Agent') || 'unknown').substring(0, 200),
                ip: clientIp // Log IP for audit trail
            }
        });

        // Send welcome email (don't await - fire and forget)
        emailService.sendWaitlistWelcomeEmail(email, name).catch(err => {
            console.error('[WAITLIST] Failed to send welcome email:', err);
        });

        // Don't expose internal database IDs - use a safe identifier
        res.status(201).json({
            message: "Successfully joined the waitlist",
            success: true
        });
    } catch (error: any) {
        console.error('[WAITLIST] Error joining waitlist:', error);

        if (error instanceof z.ZodError) {
            // Return generic error message - don't expose validation details that could help attackers
            return res.status(400).json({ error: "Invalid input. Please check your information." });
        }

        // Generic error - never expose stack traces in production
        res.status(500).json({ error: "Failed to join waitlist. Please try again." });
    }
});

export default router;
