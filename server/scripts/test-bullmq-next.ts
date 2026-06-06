import { metricsQueue } from '../queues/metricsQueue';

async function run() {
  if (metricsQueue) {
    const jobs = await metricsQueue.getRepeatableJobs();
    console.log(jobs.map(j => ({ id: j.id, next: j.next, key: j.key })));
  } else {
    console.log('No queue');
  }
  process.exit(0);
}
run();
