import cron from 'node-cron';
import { runOverrideExpiryJob } from './override-expiry.job';
import { runSubscriptionReconciliationJob } from './subscription-reconciliation.job';

let isInitialized = false;

export function initializeBackgroundJobs() {
  if (isInitialized) return;
  isInitialized = true;

  console.log('⏰ Initializing platform background cron scheduler...');

  // Hourly override expiry check
  cron.schedule('0 * * * *', async () => {
    try {
      await runOverrideExpiryJob();
    } catch (err) {
      console.error('[CRON ERROR] Override expiry job failed:', err);
    }
  });

  // Nightly subscription limits cache reconciliation
  cron.schedule('0 2 * * *', async () => {
    try {
      await runSubscriptionReconciliationJob();
    } catch (err) {
      console.error('[CRON ERROR] Subscription reconciliation job failed:', err);
    }
  });
}
