'use client';

import React from 'react';
import { Clock, Loader2, CheckCircle2, MailCheck, XCircle } from 'lucide-react';
import { OpsMessageStatus } from '@/lib/types';

const STATUS_STYLES: Record<OpsMessageStatus, { label: string; className: string; icon: React.ElementType; pulse?: boolean }> = {
  QUEUED: { label: 'Queued', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  PROCESSING: { label: 'Processing', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Loader2, pulse: true },
  SENT: { label: 'Sent', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  DELIVERED: { label: 'Delivered', className: 'bg-teal-50 text-teal-700 border-teal-200', icon: MailCheck },
  FAILED: { label: 'Failed', className: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle },
};

interface MessageStatusBadgeProps {
  status: OpsMessageStatus;
  className?: string;
}

/** Shared status pill for message log rows — same visual language as the payments/audit-log status badges elsewhere in the dashboard. */
export default function MessageStatusBadge({ status, className = '' }: MessageStatusBadgeProps) {
  const config = STATUS_STYLES[status] ?? STATUS_STYLES.QUEUED;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide ${config.className} ${className}`}
    >
      <Icon className={`h-3 w-3 ${config.pulse ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  );
}
