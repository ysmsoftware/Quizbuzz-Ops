import React from 'react';
import { Tone, StatusKind, StatusMeta, statusMeta } from '@/lib/constants/status';

// Literal class names so Tailwind can see them. Colours come from the --tone-* tokens in
// globals.css, which define light AND dark values — no `dark:` variants needed.
const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-tone-success-bg text-tone-success-fg border-tone-success-border',
  warning: 'bg-tone-warning-bg text-tone-warning-fg border-tone-warning-border',
  danger: 'bg-tone-danger-bg text-tone-danger-fg border-tone-danger-border',
  info: 'bg-tone-info-bg text-tone-info-fg border-tone-info-border',
  neutral: 'bg-tone-neutral-bg text-tone-neutral-fg border-tone-neutral-border',
  accent: 'bg-tone-accent-bg text-tone-accent-fg border-tone-accent-border',
};

interface BaseProps {
  className?: string;
  icon?: React.ReactNode;
}

type Props = BaseProps &
  (
    | { kind: StatusKind; value: string | null | undefined; meta?: never; tone?: never; children?: never }
    | { meta: StatusMeta; kind?: never; value?: never; tone?: never; children?: never }
    | { tone: Tone; children: React.ReactNode; pulse?: boolean; kind?: never; value?: never; meta?: never }
  );

/**
 * The one status pill. Pass `kind` + `value` (looked up in lib/constants/status.ts) for
 * enum-backed statuses, or `tone` + children for an ad-hoc label.
 */
export default function StatusBadge(props: Props) {
  const meta: StatusMeta =
    'kind' in props && props.kind
      ? statusMeta(props.kind, props.value)
      : 'meta' in props && props.meta
        ? props.meta
        : { label: '', tone: props.tone as Tone, pulse: (props as { pulse?: boolean }).pulse };

  const label = 'children' in props && props.children ? props.children : meta.label;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${TONE_CLASS[meta.tone]} ${
        meta.pulse ? 'animate-pulse' : ''
      } ${props.className ?? ''}`}
    >
      {props.icon}
      {label}
    </span>
  );
}
