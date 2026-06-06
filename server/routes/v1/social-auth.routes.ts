import { Router, Request, Response } from 'express';
import { socialAccountService } from '../../services';
import { InstagramOAuthService } from '../../instagram-oauth';
import { MongoStorage } from '../../mongodb-storage';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

/**
 * Handle OAuth Authorize Redirect
 * URL: /api/v1/social-auth/:platform/authorize
 */
router.get('/:platform/authorize', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const workspaceId = req.query.workspaceId as string;

    if (!workspaceId) {
      return res.status(400).send('Missing workspaceId');
    }

    if (platform === 'instagram') {
      const storage = new MongoStorage();
      await storage.connect();
      const oauthService = new InstagramOAuthService(storage as any);
      
      // Use the advanced unified flow URL that requests both Facebook and Instagram scopes
      // (Since exchangeFacebookCodeForToken expects standard FB flow)
      const authUrl = oauthService.getAdvancedAuthUrl(workspaceId);
      
      return res.redirect(authUrl);
    }
    
    // Placeholder for other platforms
    return res.status(400).send(`OAuth for ${platform} is not yet fully implemented on the backend.`);
  } catch (error: any) {
    console.error(`[OAUTH] Error generating auth URL:`, error);
    return res.status(500).send('Failed to generate authorization URL');
  }
});

/**
 * Handle Instagram OAuth Callback
 * URL: /api/v1/social-auth/instagram/callback
 */
router.get('/instagram/callback', async (req: Request, res: Response) => {
  const logPath = path.join(process.cwd(), 'debug-trace.log');
  const logToFile = (msg: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`;
    fs.appendFileSync(logPath, entry);
  };

  try {
    logToFile('Callback hit!', { query: req.query, headers: req.headers });
  } catch (e) {
    console.error('Failed to log to file', e);
  }

  const { code, state, error, error_reason, error_description } = req.query;

  // P1-FIX: Parse encoded state if present (used by both Standard and Advanced flows)
  let workspaceId = state as string;
  let flow = 'standard';

  if (state && typeof state === 'string') {
    try {
      // Check if it's base64 encoded JSON
      if (state.includes('{') === false) {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        workspaceId = decoded.workspaceId;
        flow = decoded.flow || 'standard';
        logToFile('Decoded state from callback', { workspaceId, flow });
      }
    } catch (e) {
      logToFile('State was not base64/JSON, using as raw workspaceId', { workspaceId });
    }
  }

  if (error) {
    logToFile('🚨 Instagram Auth Error', { error, error_reason, error_description });
    res.setHeader('Content-Type', 'text/html');
    return res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fafafa;">
          <div style="text-align: center; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h1 style="color: #e1306c;">Connection Failed</h1>
            <p>${error_description || 'You denied the request or an error occurred.'}</p>
            <button onclick="window.close()" style="background: #e1306c; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">Close Window</button>
          </div>
          <script>
            // Tell the mobile app about the error if needed
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'AUTH_ERROR', error: '${error_description}' }));
            }
          </script>
        </body>
      </html>
    `);
  }

  if (!code || !workspaceId) {
    logToFile('🚨 Missing params', { code: !!code, workspaceId: !!workspaceId });
    return res.status(400).send('Missing code or state parameter');
  }

  try {
    const authBaseUrl = process.env.SOCIAL_AUTH_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
    const redirectUri = `${authBaseUrl}/api/v1/social-auth/instagram/callback`;

    logToFile('Exchanging code for token via OAuth Service...', { authBaseUrl, redirectUri });

    // Use the industrial-grade OAuth Service which handles long-lived tokens and Page IDs
    const storage = new MongoStorage();
    await storage.connect();
    const oauthService = new InstagramOAuthService(storage as any);

    // Unified Flow: Always execute Facebook exchange, as standard Instagram login is deprecated
    logToFile('Executing unified flow (Facebook exchange)...');
    let accountInfo = await oauthService.exchangeFacebookCodeForToken(code as string, workspaceId as string, redirectUri);

    logToFile('Account connected successfully via OAuth Service', { username: accountInfo.username });

    // Finalize state
    logToFile('✅ [SOCIAL-AUTH] Success');

    // Determine redirect URL to the app
    const appUrl = process.env.VITE_APP_URL || process.env.BASE_URL || 'http://localhost:5173';

    // 4. Redirect immediately to Settings > Social Accounts
    const successRedirectUrl = `${appUrl}/settings?tab=social&connected=instagram&username=${accountInfo.username}`;
    return res.redirect(successRedirectUrl);
  } catch (err: any) {
    logToFile('🚨 Callback Error', { message: err.message, stack: err.stack, response: err.response?.data });

    const appUrl = process.env.VITE_APP_URL || process.env.BASE_URL || 'http://localhost:5173';

    // Detect if this is a reused/expired OAuth code (happens when user refreshes the callback page)
    const isCodeReused = err.message?.includes('token exchange failed: 400') || err.message?.includes('code has been used');

    // Specialized error handling for "Already Connected"
    const isAlreadyConnected = err.message?.includes('already connected') || err.errorCode === 'INSTAGRAM_ALREADY_CONNECTED';
    
    let errorTitle = 'Connection Failed';
    let errorColor = '#e1306c';
    let errorMessage = err.message || 'Internal server error during authentication callback.';
    let subMessage = 'Please ensure you are connecting an account that isn\'t already used in another workspace.';
    
    if (isCodeReused) {
      errorTitle = 'Page Expired';
      errorColor = '#f39c12';
      errorMessage = 'This authentication link has already been used. Your account may already be connected.';
      subMessage = 'Please go back to the dashboard to check your connection status.';
    } else if (isAlreadyConnected) {
      errorTitle = 'Account Already Connected';
      errorColor = '#f39c12';
    }

    const errorRedirectUrl = `${appUrl}/settings?tab=social`;
    return res.status(isAlreadyConnected ? 409 : isCodeReused ? 410 : 500).type('html').send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${errorTitle} — VeeFore</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
          <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Inter', -apple-system, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #080810; overflow: hidden; position: relative; }
            .orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
            .orb-1 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(239,68,68,0.3) 0%, transparent 70%); top: -150px; left: -150px; }
            .orb-2 { width: 400px; height: 400px; background: radial-gradient(circle, rgba(245,158,11,0.2) 0%, transparent 70%); bottom: -100px; right: -100px; }
            .card { position: relative; z-index: 10; background: rgba(255,255,255,0.05); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.10); border-radius: 28px; padding: 52px 44px; max-width: 460px; width: 90%; text-align: center; box-shadow: 0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08); animation: cardIn 0.6s cubic-bezier(0.16,1,0.3,1) both; }
            @keyframes cardIn { from { opacity:0; transform: translateY(32px) scale(0.97); } to { opacity:1; transform: translateY(0) scale(1); } }
            .icon-ring { width: 88px; height: 88px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 28px; animation: popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.3s both; }
            .icon-ring-warn { background: linear-gradient(135deg, #f59e0b, #fbbf24); box-shadow: 0 0 0 16px rgba(245,158,11,0.12), 0 8px 32px rgba(245,158,11,0.35); }
            .icon-ring-err  { background: linear-gradient(135deg, #ef4444, #dc2626); box-shadow: 0 0 0 16px rgba(239,68,68,0.12), 0 8px 32px rgba(239,68,68,0.35); }
            @keyframes popIn { from { opacity:0; transform: scale(0.4); } to { opacity:1; transform: scale(1); } }
            h1 { color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 12px; }
            .msg { color: rgba(255,255,255,0.6); font-size: 15px; line-height: 1.65; margin-bottom: 8px; }
            .sub { color: rgba(255,255,255,0.35); font-size: 13px; margin-bottom: 28px; }
            .divider { height: 1px; background: rgba(255,255,255,0.08); margin: 24px 0; }
            .btn { display: inline-flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: white; text-decoration: none; padding: 13px 32px; border-radius: 14px; font-weight: 600; font-size: 15px; transition: background 0.2s, transform 0.2s; }
            .btn:hover { background: rgba(255,255,255,0.16); transform: translateY(-2px); }
          </style>
        </head>
        <body>
          <div class="orb orb-1"></div>
          <div class="orb orb-2"></div>
          <div class="card">
            <div class="icon-ring ${isCodeReused ? 'icon-ring-warn' : 'icon-ring-err'}">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${isCodeReused ? '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="13"></line><circle cx="12" cy="17" r="0.5" fill="white"></circle>' : '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'}</svg>
            </div>
            <h1>${errorTitle}</h1>
            <p class="msg">${errorMessage}</p>
            <p class="sub">${subMessage}</p>
            <div class="divider"></div>
            <a href="${errorRedirectUrl}" class="btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              Back to Social Accounts
            </a>
          </div>
          <script>
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'AUTH_ERROR', error: '${errorMessage.replace(/'/g, "\\'")}' }));
            }
          </script>
        </body>
      </html>
    `);
  }
});

export default router;
