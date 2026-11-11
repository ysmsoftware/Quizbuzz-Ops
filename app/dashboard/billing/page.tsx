'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import BillingView from '@/components/views/BillingView';
import BillingSettingsView from '@/components/views/BillingSettingsView';

const TABS = [
  { id: 'revenue', label: 'Revenue', href: '/dashboard/billing' },
  { id: 'settings', label: 'Settings', href: '/dashboard/billing?tab=settings' },
];

function BillingTabs() {
  const tab = useSearchParams().get('tab') === 'settings' ? 'settings' : 'revenue';
  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-border/50" role="tablist">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            role="tab"
            aria-selected={tab === t.id}
            className={`px-4 py-2 text-xs font-semibold -mb-px border-b-2 transition-colors ${
              tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {tab === 'settings' ? <BillingSettingsView /> : <BillingView />}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Loading...</div>}>
      <BillingTabs />
    </Suspense>
  );
}
