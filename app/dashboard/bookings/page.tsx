import { Suspense } from 'react';
import BookingsView from '@/components/views/BookingsView';

export default function BookingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Loading...</div>}>
      <BookingsView />
    </Suspense>
  );
}
