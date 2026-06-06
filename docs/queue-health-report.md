# Queue Health Report

## 1. Current State
The backend heavily relies on BullMQ for asynchronous processing, deduplication, and resilient API interaction. Four primary queues orchestrate traffic:
1. `metricsQueue` (`metrics-fetch`): Background data polling, token refreshes, and daily snapshots.
2. `webhookQueue` (`process-webhook`): Immediate asynchronous offloading of Meta webhook payloads.
3. `automationQueue` (`process-comment`): Dedicated worker for parsing comments and sending auto-DMs.
4. `messageQueue` (`process-message`): Throttled queue for message dispatching.

## 2. Metrics
- **Concurrency:** `automationWorker` processes 5 concurrent jobs.
- **Retry Mechanism:** Standardized to 3 attempts using `exponential` backoff (3s, 9s, 27s).
- **Cleanup Strategy:** Completed jobs capped at 500 records; failed jobs capped at 100 records.
- **Latency:** Webhook payloads transition to background processing in under 5ms, yielding immediate HTTP 200 responses to Meta.

## 3. Bottlenecks
- **Queue Saturation (Theoretical):** If Meta sends a burst of 100,000 webhooks in 60 seconds (e.g., viral post), the `webhookQueue` could grow significantly. Since the worker concurrency is high, it can handle it, but Redis memory usage will spike momentarily.

## 4. Risk Assessment
- **Ghost Jobs:** The `MetricsQueueManager` was previously scheduling invalid cron expressions (`*/720`). This was corrected to milliseconds (`every`), eliminating the risk of jobs failing to schedule or ghosting.
- **Deadlocks:** The queue system utilizes deterministic `jobId` deduplication. If a job fails and gets locked, it drops out after 3 retries, ensuring the system doesn't infinitely loop on bad payloads.
- **Redis Dependency:** High. The entire automation and polling system completely stalls without a valid `REDIS_URL`.

## 5. Recommendations
- **Bull Board Integration:** Integrate `@bull-board/express` into an admin-only route to provide visual dashboards for queue lengths, active workers, and failure logs.
- **Monitor Exponential Backoff:** Ensure that Meta's 1-hour rate limits are handled accurately by `TokenManager` to pause specific workspace queues rather than continuously retrying jobs that will inevitably fail.
