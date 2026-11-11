import { redirect } from 'next/navigation';

// Billing Settings now lives as a tab on the Billing page; this keeps old links working.
export default function BillingSettingsRedirect() {
  redirect('/dashboard/billing?tab=settings');
}
