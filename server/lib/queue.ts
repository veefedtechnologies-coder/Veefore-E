import { Queue } from 'bullmq';
import { getRedisClient } from './redis';

// Define names for our queues
export const QUEUE_NAMES = {
    EMAIL: 'email-queue',
};

// Singleton queue instance
let emailQueue: Queue | null = null;

export const getEmailQueue = (): Queue => {
    if (!emailQueue) {
        const connection = getRedisClient();

        emailQueue = new Queue(QUEUE_NAMES.EMAIL, {
            connection,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000, // 1s, 2s, 4s
                },
                removeOnComplete: true, // Auto-remove successful jobs to save Redis space
                removeOnFail: { count: 1000 }, // Keep last 1000 failed jobs for debugging
            },
        });

        console.log('[QUEUE] Email queue initialized');
    }

    return emailQueue;
};

// Initializer for all queues (can be called at startup)
export const initQueues = () => {
    getEmailQueue();
};
