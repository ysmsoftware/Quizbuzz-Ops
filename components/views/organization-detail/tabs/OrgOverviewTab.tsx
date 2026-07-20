'use client';

import React from 'react';
import { Globe, User, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { Organization, Contest, Member, SubscriptionPlan } from '@/lib/types';

interface OrgOverviewTabProps {
  organization: Organization;
  contests: Contest[];
  members: Member[];
  participantsCount: number;
  paymentAggregates: {
    collected: number;
    pending: number;
    refunded: number;
  };
  currentPlan?: SubscriptionPlan;
}

export default function OrgOverviewTab({
  organization,
  contests,
  members,
  participantsCount,
  paymentAggregates,
  currentPlan,
}: OrgOverviewTabProps) {
  return (
    <div className="space-y-6 font-sans">
      {/* Stat Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border/40 rounded-xl p-5 shadow-sm space-y-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Quizzes Hosted</span>
          <h3 className="text-2xl font-bold font-mono text-foreground">{(organization as any).contestCount || contests.length}</h3>
          <span className="text-[11px] text-muted-foreground block">
            {contests.filter(c => c.status === 'COMPLETED').length} completed • {contests.filter(c => c.status === 'PUBLISHED' || c.status === 'LIVE').length} scheduled
          </span>
        </div>

        <div className="bg-card border border-border/40 rounded-xl p-5 shadow-sm space-y-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Total Registrations</span>
          <h3 className="text-2xl font-bold font-mono text-foreground">{((organization as any).participantCount || participantsCount).toLocaleString('en-IN')}</h3>
          <span className="text-[11px] text-muted-foreground block">Across all hosted trivia and exams</span>
        </div>

        <div className="bg-card border border-border/40 rounded-xl p-5 shadow-sm space-y-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Total Revenue Log</span>
          <h3 className="text-2xl font-bold font-mono text-foreground">₹{paymentAggregates.collected.toLocaleString('en-IN')}</h3>
          <span className="text-[11px] text-muted-foreground block">Includes renewal subs + user reg tickets</span>
        </div>
      </div>

      {/* Profile & Contact Specs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-sans">
        {/* Primary Profile Details */}
        <div className="bg-card border border-border/40 rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-foreground pb-2 border-b border-border/30 flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Tenant Metadata & Setup
          </h3>
          
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Organization ID</span>
              <span className="font-mono text-foreground text-[11px] truncate block">{organization.id}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Tenant Slug</span>
              <span className="font-mono text-foreground font-semibold">{organization.slug}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Subscribed Plan</span>
              <span className="font-semibold text-primary">{currentPlan?.name || organization.planId}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Operational State</span>
              <span className="font-bold text-emerald-600">{organization.status}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Creation Timestamp</span>
              <span className="text-muted-foreground font-mono">{format(new Date(organization.createdAt), 'yyyy-MM-dd HH:mm')}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Staff Member Accounts</span>
              <span className="text-foreground font-mono font-bold">{(organization as any).memberCount || members.length} admins</span>
            </div>
          </div>
        </div>

        {/* Owner Contact Information */}
        <div className="bg-card border border-border/40 rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-foreground pb-2 border-b border-border/30 flex items-center gap-2">
            <User className="h-4 w-4 text-primary" /> Owner / Administrative Contact
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Account Owner Name</span>
              <span className="font-semibold text-foreground">{organization.ownerName}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Owner Email Address</span>
              <a href={`mailto:${organization.ownerEmail}`} className="font-mono text-primary hover:underline">{organization.ownerEmail}</a>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Official Web Domain</span>
              <a href={organization.website} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1 mt-0.5">
                <span>{organization.website}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
