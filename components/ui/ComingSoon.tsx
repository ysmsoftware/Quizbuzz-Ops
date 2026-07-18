'use client';

import { CalendarRange, Sparkles, Receipt, Database, Calculator, CalendarClock } from 'lucide-react';
import { motion } from 'motion/react';

interface ComingSoonProps {
  sectionId: string;
}

const INFO: Record<string, { title: string; phase: string; desc: string; icon: any; highlights: string[] }> = {
  plans: {
    title: 'Subscription Plans Manager',
    phase: 'Phase 2',
    desc: 'Platform-owner configurations for editing subscription pricing tiers, feature toggles, limits, and customer onboarding flags.',
    icon: Sparkles,
    highlights: [
      'Toggle features (custom domains, custom branding) per pricing tier',
      'Update tier pricing (INR) and limits (max quizzes, max participants)',
      'Manage promotional coupon codes & subscription campaigns',
      'Set customer trial periods and self-service parameters',
    ],
  },
  billing: {
    title: 'Billing & Revenue Oversight',
    phase: 'Phase 3',
    desc: 'Deep financial reconciliation logs, invoice retrievals, automated payment failure alerts, and instant refund triggers.',
    icon: Receipt,
    highlights: [
      'Global MRR & ARR telemetry tracking (INR)',
      'Transaction list with search, filter, and export controls',
      'One-click refunds (destructive verification dialogs)',
      'Billing status indicators (PAID, PENDING, FAILED) with automatic warnings',
    ],
  },
  audit: {
    title: 'Security Audit Ledger',
    phase: 'Phase 3',
    desc: 'Full-system administration tracking. Record actions, overrides, status changes, and support impersonation events for total accountability.',
    icon: Database,
    highlights: [
      'Trace action sources (admin emails, physical roles, client IPs)',
      'Search and filter historical logs by target ID or operation types',
      'Export secure compliance logs for SOC2 auditing',
      'Impersonation session lifecycle logging and controls',
    ],
  },
  calculator: {
    title: 'Contest Cost & Calculator Tool',
    phase: 'Phase 4',
    desc: 'Simulate high-volume live contest resource allocations. Predict hosting overheads, database reads, and dynamic participant scale pricing.',
    icon: Calculator,
    highlights: [
      'Live estimate models for concurrent participant spikes (e.g. up to 10,000)',
      'Interactive sliders for question sizes and frequency intervals',
      'Calculate margin yields on custom enterprise quote bids',
      'Simulate infrastructure limits on Cloud SQL and container clusters',
    ],
  },
  bookings: {
    title: 'Proctored Bookings Scheduler',
    phase: 'Phase 4',
    desc: 'Schedule and manage premium human-proctored contests. High-density scheduling calendars for verifying exam authenticity.',
    icon: CalendarClock,
    highlights: [
      'Visual timeline of booked proctoring blocks',
      'Assign certified proctors to high-stakes university/corporate contests',
      'Verify video stream health and audio feed channels',
      'Automatic booking reminders and rescheduling triggers',
    ],
  },
};

export default function ComingSoon({ sectionId }: ComingSoonProps) {
  const detail = INFO[sectionId] || {
    title: 'Upcoming Administration Interface',
    phase: 'Future Phase',
    desc: 'This module is scheduled for development in a subsequent release.',
    icon: CalendarRange,
    highlights: ['Interactive dashboards', 'Dynamic mutations', 'Role-restricted access control'],
  };

  const Icon = detail.icon;

  return (
    <div id={`coming-soon-${sectionId}`} className="flex flex-col items-center justify-center py-12 px-4 text-center max-w-2xl mx-auto font-sans h-full min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="p-5 bg-primary/10 rounded-2xl text-primary mb-6 shadow-sm"
      >
        <Icon className="h-10 w-10 text-primary" />
      </motion.div>

      <span className="px-2.5 py-0.5 bg-accent/15 text-accent-foreground text-xs font-bold uppercase tracking-widest rounded-md mb-3 font-mono">
        {detail.phase} Feature
      </span>

      <h2 className="text-3xl font-bold tracking-tight text-foreground font-sans">
        {detail.title}
      </h2>
      
      <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
        {detail.desc}
      </p>

      {/* Decorative Blueprint Sheet */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="mt-8 w-full bg-card border border-border/40 rounded-xl p-6 text-left shadow-sm"
      >
        <h4 className="text-xs font-bold text-foreground/80 uppercase tracking-wider mb-4 border-b border-border/40 pb-2">
          Scheduled Module Deliverables
        </h4>
        <ul className="space-y-3">
          {detail.highlights.map((item, index) => (
            <li key={index} className="flex gap-2.5 items-start text-xs text-muted-foreground leading-normal">
              <span className="font-mono text-primary font-bold shrink-0">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mt-8 font-mono">
        QuizBuzz Internal Operations Platform Framework
      </p>
    </div>
  );
}
