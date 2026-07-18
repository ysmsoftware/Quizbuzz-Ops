import { Suspense } from 'react';
import OrganizationsView from '@/components/views/OrganizationsView';

export default function OrganizationsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Loading...</div>}>
      <OrganizationsView />
    </Suspense>
  );
}
