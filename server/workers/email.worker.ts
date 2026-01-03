import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES } from '../lib/queue';
import { getRedisClient, getRedisOptions } from '../lib/redis';
import { emailService } from '../email-service';

// Standard connection for worker (needs to be separate if blocking is used, but for simple jobs shared is okayish 
// BUT BullMQ docs recommend separate connection options for Workers to avoid blocking issues)
// However, since we wrapped `ioredis`, let's just use connection options pointing to the same place.

const redisUrl = process.env.REDIS_URL ||
    process.env.KV_URL ||
    process.env.STORAGE_REDIS_URL ||
    'redis://localhost:6379';

const baseOptions = getRedisOptions(redisUrl);

const workerOptions = {
    connection: {
        url: redisUrl, // This acts as the host/connection string for IORedis
        ...baseOptions, // Inject family: 4, tls, etc.
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    },
    concurrency: 5, // Process 5 emails at once
};

let emailWorker: Worker | null = null;

export const initEmailWorker = () => {
    if (emailWorker) return emailWorker;

    console.log('[WORKER] Initializing Email Worker...');

    emailWorker = new Worker(QUEUE_NAMES.EMAIL, async (job: Job) => {
        console.log(`[JOB] Processing job ${job.id} of type ${job.name}`);

        switch (job.name) {
            case 'send-welcome':
                const { email, name } = job.data;
                await emailService.sendWaitlistWelcomeEmail(email, name);
                console.log(`[JOB] Welcome email sent to ${email}`);
                return { sent: true, email };

            default:
                console.warn(`[JOB] Unknown job type: ${job.name}`);
                throw new Error(`Unknown job type: ${job.name}`);
        }
    }, workerOptions);

    emailWorker.on('completed', (job) => {
        console.log(`[JOB] Job ${job.id} completed!`);
    });

    emailWorker.on('failed', (job, err) => {
        console.error(`[JOB] Job ${job?.id} failed:`, err);
    });

    return emailWorker;
};
