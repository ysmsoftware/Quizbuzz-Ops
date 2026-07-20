import { Suspense } from 'react';
import OrganizationDetailView from '@/components/views/OrganizationDetailView';

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Loading organization details...</div>}>
      <OrganizationDetailView orgId={orgId} />
    </Suspense>
  );
}
