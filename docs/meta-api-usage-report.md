# Meta API Usage Report

## 1. Current State
Veefore limits its reliance on the Meta Graph API by leveraging Webhooks as the primary ingestion method for likes, comments, mentions, and messages. The API is exclusively queried for initial account connection syncs, daily global snapshots, and infrequent (120-minute) background smart-polling fallbacks.

## 2. Metrics
- **Base Polling Frequency:** 1 full API snapshot every 120 minutes (2 hours) per active workspace.
- **Initial Connection Cost:** 1 comprehensive fetch per new Instagram OAuth flow.
- **Webhook Updates:** Costs 0 API calls. (Data arrives via Meta push).
- **Direct Messaging:** Automation triggers exactly 1 API call per DM sent (throttled).
- **Total API Fetches per Session (Frontend):** 0 (Frontend hits local MongoDB exclusively).

## 3. Bottlenecks
- **Demographic Limitations:** Meta restricts audience demographics data (active time, city, gender) to Accounts with more than 100 followers. The system handles this gracefully, but users with small accounts will see no demographic data regardless of how many API calls are made.
- **Media Refresh Spikes:** A `media_update` webhook triggers an immediate `fetch-metrics` targeted job. If a user posts frequently, this could cause sequential Meta API fetches, though it is deduplicated (delayed by 10 seconds).

## 4. Risk Assessment
- **Rate Limiting:** Safe. Meta allows 200 calls per hour per user. With a polling frequency of once every 2 hours, Veefore uses < 1% of the allotted polling limit.
- **Duplicate Calls:** Eliminated. The `MetricsQueueManager` consolidated 5 separate polling intervals into a single `all` job, avoiding duplicate full-account syncs that previously wasted API limits.
- **OAuth Re-Auth Rate:** Handled safely via `TokenManager.refreshToken()` using the long-lived token exchange endpoint in the background.

## 5. Recommendations
- **Dynamic Adjustments:** Monitor if inactive accounts (no webhooks received for 7 days) can have their polling interval expanded from 120 minutes to 24 hours to save even more bandwidth.
- **Daily Snapshot Alignment:** Align the global `daily-snapshot` cron job with the standard smart-polling interval to avoid pulling data twice in the same hour.
