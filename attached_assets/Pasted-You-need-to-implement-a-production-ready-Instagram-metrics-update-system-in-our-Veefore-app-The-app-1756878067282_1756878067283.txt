You need to implement a production-ready Instagram metrics update system in our Veefore app. The app supports workspaces (multiple users collaborating in one workspace), so all logic must respect workspace boundaries.

🔹 Tech Stack

Backend: Express + TypeScript

Database: MongoDB

Queue: Redis + BullMQ

Real-time: WebSockets

Instagram API: Graph API + Webhooks

🔹 Requirements

1. Automatic Metrics Updates

Fetch metrics automatically (followers, likes, comments, reach, impressions, engagement rate, media updates).

No manual "sync" button — background updates only.

Always return latest cached data instantly.

Updates are scoped to workspace (metrics belong to a workspace, not just a user).

2. Rate-Limit Safety

Use BullMQ + Redis job queue for scheduling API requests.

Multi-token strategy:

Each user connects their Instagram account → generates long-lived token.

System user token for global jobs.

Distribute requests across tokens within a workspace.

Rotate tokens if one is rate-limited.

Implement exponential backoff retries for 429 errors.

Store last API call timestamp per user per workspace.

Use BullMQ limiter option to control request frequency.

3. Smart Polling + Caching & Delta Updates

Smart polling strategy:

Poll less frequently for stable metrics (followers, impressions).

Poll more frequently for dynamic metrics (comments, likes).

Use adaptive intervals based on account activity.

Always prioritize webhook events → poll only if no webhook activity.

Store metrics in MongoDB under workspaceId.

Always serve cached metrics instantly.

Fetch only delta changes (e.g., last 7 days insights).

Update DB only when values change.

4. Webhooks for Real-time Triggers

Implement Express route /api/webhooks/instagram.

Subscribe to push events:

New comments

Mentions

Story insights (e.g., story expiration and insight updates)

Messages (Instagram Direct for business accounts)

Account review update events

Media updates (e.g., new posts, story updates)

Note: Instagram webhooks do not support likes events. Likes must be tracked via polling only.

Any other Instagram-supported events.

On webhook event:

Update DB within correct workspaceId.

Push updates via WebSocket to workspace members.

5. Real-time Workspace Updates

WebSocket server must support workspace rooms.

When metrics change in DB:

Emit metrics:update event to that workspace room.

Frontend:

Connect via WebSocket.

Join workspace channel.

Show cached data instantly.

Auto-refresh when updates arrive.

6. Error Handling & Logging

Catch rate-limit errors (429) → retry with backoff.

Handle token expiration → refresh or mark invalid.

Log API failures in a Logs collection with workspaceId.

Friendly fallback: “Fetching latest data, please wait.”

🔹 Implementation Steps

1. Setup Job Queue

Install BullMQ + Redis.

Create metricsQueue.

Define job: fetchWorkspaceMetrics(workspaceId, userId, token).

Worker processes jobs with rate-limiting.

Schedule smart polling intervals per metric type.

2. MongoDB Models

User:

userId

workspaceId

instagramToken

lastFetchedAt

tokenStatus

Workspace:

workspaceId

members: [userIds]

Metrics:

workspaceId

followers

likes

comments

reach

impressions

engagementRate

lastUpdated

3. Express API Routes

GET /api/workspaces/:workspaceId/metrics

Returns cached metrics.

Adds background job to refresh metrics.

POST /api/webhooks/instagram

Handles webhook events.

Updates metrics in DB for the correct workspaceId.

Broadcasts update via WebSocket.

4. Worker Logic

Fetch metrics via Instagram Graph API using valid token.

Compare with last stored values (delta update).

Save only changed values.

Respect smart polling intervals.

Emit update to the workspace WebSocket room.

5. Token Manager Utility

Manage pool of tokens per workspace.

Rotate tokens on rate-limit errors.

Refresh or replace expired tokens.

Function: getWorkspaceToken(workspaceId): string.

6. WebSockets

Setup WebSocket server.

Users join their workspaceId room.

When DB metrics update, broadcast metrics:update event to that workspace.

Frontend subscribes by workspaceId.

🔹 Deliverables (Code to Generate)

models/User.ts → User schema with workspace link.

models/Workspace.ts → Workspace schema.

models/Metrics.ts → Metrics schema scoped to workspace.

queues/metricsQueue.ts → BullMQ setup.

workers/metricsWorker.ts → Background job for fetching metrics + smart polling.

routes/metrics.ts → /api/workspaces/:workspaceId/metrics.

routes/webhooks.ts → /api/webhooks/instagram.

services/tokenManager.ts → Token rotation + rate-limit handling.

services/instagramApi.ts → Wrapper for Graph API calls.

services/realtime.ts → WebSocket setup with workspace rooms.

utils/logger.ts → Error + retry logging.

🔹 Key Rules

All metrics and tokens must be scoped by workspace.

Always serve cached data first.

Background jobs + smart polling keep metrics fresh automatically.

Spread API calls across tokens in workspace.

Push updates in real-time to all workspace members.

Users should never see a rate-limit error or empty dashboard.

Final Note:

Code must be modular, workspace-aware, and production-grade. Ensure jobs, tokens, smart polling, and updates always respect workspace boundaries.

🚨 Important Instruction

Implement features step by step, not all at once.

Start with models → then job queue → then worker → then routes → then services → then WebSockets.

After finishing each module, run and test locally to ensure no errors before moving to the next.

Use TypeScript types everywhere to avoid runtime issues.

Follow the structure exactly as described above — do not skip models, services, or queue setup.

If an API endpoint is unavailable (e.g., likes via webhook), fallback to polling as specified.

This way the system will be error-free and production-ready.

✅ Step-by-Step Implementation Checklist

Models

Create User.ts, Workspace.ts, and Metrics.ts schemas in MongoDB.

Queue Setup

Setup Redis + BullMQ.

Create metricsQueue.ts.

Worker

Implement metricsWorker.ts to fetch metrics + smart polling.

Services

Build instagramApi.ts, tokenManager.ts, and realtime.ts.

Routes

Add /api/workspaces/:workspaceId/metrics.

Add /api/webhooks/instagram.

WebSockets

Setup workspace rooms.

Emit metrics:update on data changes.

Utils + Logging

Add logger.ts.

Ensure errors and retries are logged by workspaceId.

Testing

Test each step locally after completion.

Verify metrics update automatically without manual sync.

Verify rate-limiting safety by simulating multiple requests.

Verify webhooks deliver comments, mentions, story insights, messages, and account review events correctly.

Follow this order strictly to avoid errors.

