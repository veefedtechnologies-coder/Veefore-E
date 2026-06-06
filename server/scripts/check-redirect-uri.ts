import dotenv from 'dotenv';
import path from 'path';

// Load .env the same way the server does
dotenv.config({ path: path.join(process.cwd(), '.env') });

console.log('=== REDIRECT URI DIAGNOSTIC ===\n');

console.log('Environment Variables:');
console.log('INSTAGRAM_REDIRECT_URL:', process.env.INSTAGRAM_REDIRECT_URL || 'NOT SET');
console.log('SOCIAL_AUTH_BASE_URL:', process.env.SOCIAL_AUTH_BASE_URL || 'NOT SET');
console.log('BASE_URL:', process.env.BASE_URL || 'NOT SET');
console.log('PUBLIC_URL:', process.env.PUBLIC_URL || 'NOT SET');

// Replicate the exact logic from instagram-oauth.ts
const getRedirectUri = () => {
    if (process.env.INSTAGRAM_REDIRECT_URL) return process.env.INSTAGRAM_REDIRECT_URL;
    const base = (() => {
        if (process.env.SOCIAL_AUTH_BASE_URL) return process.env.SOCIAL_AUTH_BASE_URL;
        if (process.env.BASE_URL) return process.env.BASE_URL;
        if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
        if (process.env.CF_TUNNEL_HOSTNAME) return `https://${process.env.CF_TUNNEL_HOSTNAME}`;
        if (process.env.VITE_APP_URL) return process.env.VITE_APP_URL;
        if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
        if (process.env.REPL_SLUG && process.env.REPL_OWNER) return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
        return process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:5000';
    })();
    return `${base}/api/v1/social-auth/instagram/callback`;
};

const redirectUri = getRedirectUri();

console.log('\n=== RESULT ===');
console.log('Redirect URI that will be used:', redirectUri);
console.log('\nThis should match one of the URLs in your Meta app settings!');
