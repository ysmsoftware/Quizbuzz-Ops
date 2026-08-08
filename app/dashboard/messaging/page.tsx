import { Suspense } from 'react';
import MessagingView from '@/components/views/MessagingView';

export default function MessagingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Loading...</div>}>
      <MessagingView />
    </Suspense>
  );
}
