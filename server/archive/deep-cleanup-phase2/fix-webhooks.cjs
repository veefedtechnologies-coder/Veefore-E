const fs = require('fs');
let code = fs.readFileSync('routes/webhooks.ts', 'utf8');

// Remove the comments block
code = code.replace(/\/\/ Queue webhook processing job for comprehensive metrics update\s+await MetricsQueueManager\.processWebhookEvent\([\s\S]*?,\s*'comments'\s*\);/g, '');

// Remove mentions block
code = code.replace(/await MetricsQueueManager\.processWebhookEvent\([\s\S]*?,\s*'mentions'\s*\);/g, '');

// Remove story_insights block
code = code.replace(/await MetricsQueueManager\.processWebhookEvent\([\s\S]*?,\s*'story_insights'\s*\);/g, '');

// Remove messages block (including try/catch)
code = code.replace(/try\s*\{\s*await MetricsQueueManager\.processWebhookEvent\([\s\S]*?,\s*'messages'\s*\);\s*\}\s*catch\s*\(err\)\s*\{\s*console\.error[^}]+\};\s*\}/g, '');

// Remove media_updates block
code = code.replace(/await MetricsQueueManager\.processWebhookEvent\([\s\S]*?,\s*'media_updates'\s*\);/g, '');

// Remove account_review_update block
code = code.replace(/await MetricsQueueManager\.processWebhookEvent\([\s\S]*?,\s*'account_review_update'\s*\);/g, '');

// Remove live_comments block
code = code.replace(/await MetricsQueueManager\.processWebhookEvent\([\s\S]*?,\s*'live_comments'\s*\);/g, '');

fs.writeFileSync('routes/webhooks.ts', code);
console.log('Removed MetricsQueueManager.processWebhookEvent calls');
