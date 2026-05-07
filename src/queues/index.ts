import { Queue } from 'bullmq';
import { config } from '../config';

const connection = { host: config.redis.host, port: config.redis.port };

export const importQueue = new Queue('radient-import', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export const matchQueue = new Queue('radient-match', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

export const youtubeQueue = new Queue('radient-youtube', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 10000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

export const syncQueue = new Queue('radient-sync', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

console.log('[Queues] BullMQ queues initialized');
