'use client';

import React from 'react';
import { Clock, Loader2, CheckCircle2, MailCheck, XCircle } from 'lucide-react';
import { OpsMessageStatus } from '@/lib/types';
import StatusBadge from '@/components/ui/StatusBadge';

const ICONS: Record<OpsMessageStatus, { icon: React.ElementType; spin?: boolean }> = {
  QUEUED: { icon: Clock },
  PROCESSING: { icon: Loader2, spin: true },
  SENT: { icon: CheckCircle2 },
  DELIVERED: { icon: MailCheck },
  FAILED: { icon: XCircle },
};

/** Message-log status pill: the shared StatusBadge plus a per-status icon. */
export default function MessageStatusBadge({ status, className = '' }: { status: OpsMessageStatus; className?: string }) {
  const { icon: Icon, spin } = ICONS[status] ?? ICONS.QUEUED;
  return (
    <StatusBadge
      kind="message"
      value={status}
      className={className}
      icon={<Icon className={`h-3 w-3 ${spin ? 'animate-spin' : ''}`} />}
    />
  );
}
