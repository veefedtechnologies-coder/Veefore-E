import { z } from 'zod';

const requiredSecretSchema = z.string().min(1, 'Required secret is missing');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters').optional(),

  MONGODB_URI: z.string().url().optional(),
  MONGO_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),

  REDIS_URL: z.string().optional(),
  KV_URL: z.string().optional(),
  STORAGE_REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),

  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  INSTAGRAM_CLIENT_ID: z.string().optional(),
  INSTAGRAM_CLIENT_SECRET: z.string().optional(),
  INSTAGRAM_REDIRECT_URL: z.string().optional(),
  INSTAGRAM_WEBHOOK_SECRET: z.string().optional(),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),

  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),

  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),

  SENDGRID_API_KEY: z.string().optional(),
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),

  ELEVENLABS_API_KEY: z.string().optional(),
  HEDRA_API_KEY: z.string().optional(),
  CLIPDROP_API_KEY: z.string().optional(),

  CORS_ORIGIN: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  CLIENT_URL: z.string().optional(),
  PUBLIC_URL: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),

  ENABLE_CSP: z.string().optional(),
  ENABLE_IFRAME_COMPAT: z.string().optional(),
  ENABLE_PROMETHEUS_METRICS: z.string().optional(),
  ENABLE_TEST_FIXTURES: z.string().optional(),
  ENABLE_PUBLIC_INSTAGRAM_AUTH: z.string().optional(),
  CORS_EMERGENCY_LOCKDOWN: z.string().optional(),

  BACKUP_PATH: z.string().optional(),
  DATA_PROCESSING_LOCATION: z.string().optional(),
  PRIVACY_POLICY_VERSION: z.string().optional(),

  CF_TUNNEL_HOSTNAME: z.string().optional(),
  HOSTNAME: z.string().optional(),
  NODE_ID: z.string().optional(),

  CSRF_SECRET: z.string().optional(),
  DEFAULT_ADMIN_PASSWORD: z.string().optional(),
  PAGE_ACCESS_TOKEN: z.string().optional(),

  OPENAI_MAX_TOKENS: z.coerce.number().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let validatedEnv: Env | null = null;

export function validateEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }

  console.log('[ENV] Validating environment variables...');

  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map(err => {
      return `  - ${err.path.join('.')}: ${err.message}`;
    }).join('\n');

    console.error('\n[ENV] ❌ CRITICAL: Environment validation failed!\n');
    console.error('Missing or invalid environment variables:\n' + errors);
    console.error('\nPlease configure the required secrets in Replit Secrets or .env file.\n');

    if (process.env.NODE_ENV === 'production') {
      throw new Error('Environment validation failed. Cannot start in production with invalid configuration.');
    } else {
      console.warn('[ENV] ⚠️  Continuing in development mode with missing secrets (some features may not work)');
    }
  }

  validatedEnv = result.success ? result.data : (EnvSchema.parse({
    ...process.env,
    JWT_SECRET: process.env.JWT_SECRET || 'development-only-secret-key',
  }) as Env);

  const warnings: string[] = [];

  if (!validatedEnv.OPENAI_API_KEY) {
    warnings.push('OPENAI_API_KEY not set - AI content generation will not work');
  }
  if (!validatedEnv.MONGODB_URI && !validatedEnv.MONGO_URL) {
    warnings.push('MONGODB_URI not set - using default connection or fallback');
  }
  if (!validatedEnv.REDIS_URL && !validatedEnv.KV_URL && !validatedEnv.STORAGE_REDIS_URL) {
    warnings.push('REDIS_URL (or Vercel Upstash) not set - using in-memory fallback for caching');
  }
  if (!validatedEnv.INSTAGRAM_APP_ID || !validatedEnv.INSTAGRAM_APP_SECRET) {
    warnings.push('Instagram OAuth credentials not configured - Instagram integration disabled');
  }
  if (!validatedEnv.SESSION_SECRET) {
    warnings.push('SESSION_SECRET not set - using fallback (not recommended for production)');
  }

  if (warnings.length > 0) {
    console.warn('\n[ENV] ⚠️  Configuration warnings:');
    warnings.forEach(w => console.warn('  - ' + w));
    console.warn('');
  }

  console.log('[ENV] ✅ Environment validation completed');
  console.log(`[ENV] Mode: ${validatedEnv.NODE_ENV}`);
  console.log(`[ENV] Port: ${validatedEnv.PORT}`);

  return validatedEnv;
}

export const env = new Proxy({} as Env, {
  get(_, prop: string) {
    if (!validatedEnv) {
      validateEnv();
    }
    return validatedEnv![prop as keyof Env];
  }
});

export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return env.NODE_ENV === 'development';
}

export function getMongoUri(): string {
  return env.MONGODB_URI || env.MONGO_URL || 'mongodb://localhost:27017/veefore';
}

export function getRedisConfig(): { url?: string; host?: string; port?: number; password?: string; tls?: boolean } | null {
  if (env.REDIS_URL) {
    return { url: env.REDIS_URL };
  }
  if (env.REDIS_HOST) {
    return {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT || 6379,
      password: env.REDIS_PASSWORD,
      tls: env.REDIS_TLS === 'true',
    };
  }
  return null;
}

export function hasAICapabilities(): boolean {
  return !!(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.GEMINI_API_KEY);
}

export function hasInstagramIntegration(): boolean {
  return !!(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET);
}

export function hasEmailCapabilities(): boolean {
  return !!(env.SENDGRID_API_KEY || (env.GMAIL_USER && env.GMAIL_APP_PASSWORD));
}

export function hasPaymentCapabilities(): boolean {
  return !!(env.STRIPE_SECRET_KEY || env.RAZORPAY_KEY_ID);
}
