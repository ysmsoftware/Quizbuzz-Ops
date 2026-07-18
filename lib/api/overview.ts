'use client';

import { getDatabase } from '@/lib/data/db';
import { simulateLatency } from '@/lib/api/utils';
import { Organization, Contest, ContestStatus } from '@/lib/types';

export interface PlatformStats {
  organizations: {
    total: number;
    active: number;
    suspended: number;
    deleted: number;
  };
  contests: {
    total: number;
    statusBreakdown: Record<ContestStatus, number>;
  };
  participants: {
    total: number;
  };
  revenue: {
    totalAllTime: number;
    thisMonth: number;
  };
  growthTrend: Array<{ week: string; orgs: number }>;
  upcomingContests: Array<{
    id: string;
    title: string;
    orgName: string;
    orgId: string;
    startTime: string;
    participantCount: number;
    status: ContestStatus;
  }>;
  recentOrganizations: Array<{
    id: string;
    name: string;
    slug: string;
    planId: string;
    logoUrl: string;
    createdAt: string;
  }>;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  await simulateLatency(400, 750); // Simulate network roundtrip
  const db = getDatabase();

  const impersonatedOrgId = typeof window !== 'undefined' ? localStorage.getItem('quizbuzz_impersonated_org_id') : null;

  let orgs = db.organizations;
  let contests = db.contests;
  let billing = db.billing;
  const participants = db.participants;

  if (impersonatedOrgId) {
    orgs = db.organizations.filter(o => o.id === impersonatedOrgId);
    contests = db.contests.filter(c => c.organizationId === impersonatedOrgId || c.orgId === impersonatedOrgId);
    billing = db.billing.filter(b => b.orgId === impersonatedOrgId);
  }

  // 1. Organizations counts
  const totalOrgs = orgs.filter(o => o.status !== 'DELETED').length;
  const activeOrgs = orgs.filter(o => o.status === 'ACTIVE').length;
  const suspendedOrgs = orgs.filter(o => o.status === 'SUSPENDED').length;
  const deletedOrgs = orgs.filter(o => o.status === 'DELETED').length;

  // 2. Contests status breakdown
  const statusBreakdown: Record<ContestStatus, number> = {
    DRAFT: 0,
    PUBLISHED: 0,
    REGISTRATION_CLOSED: 0,
    LIVE: 0,
    EVALUATION: 0,
    RESULTS_OUT: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };

  contests.forEach(c => {
    if (statusBreakdown[c.status] !== undefined) {
      statusBreakdown[c.status]++;
    }
  });

  // 3. Participants
  const totalSeededParticipantsCount = participants.length;
  const totalAggregatedParticipantsCount = contests.reduce((sum, c) => sum + (c.participantCount || 0), 0);
  const finalParticipantsCount = totalAggregatedParticipantsCount > 0 ? totalAggregatedParticipantsCount : totalSeededParticipantsCount;

  // 4. Revenue calculation
  const billingAllTimePaid = billing.filter(b => b.status === 'PAID').reduce((sum, b) => sum + b.amountINR, 0);
  const contestAllTimePaid = contests.filter(c => c.status === 'COMPLETED' || c.status === 'RESULTS_OUT' || c.status === 'LIVE').reduce((sum, c) => sum + (c.revenueCollected || 0), 0);
  const totalAllTimeRevenue = billingAllTimePaid + contestAllTimePaid;

  const cutoffDate = new Date('2026-06-01T00:00:00Z');
  const billingThisMonthPaid = billing
    .filter(b => b.status === 'PAID' && new Date(b.paymentDate) >= cutoffDate)
    .reduce((sum, b) => sum + b.amountINR, 0);
  const contestThisMonthPaid = contests
    .filter(c => (c.status === 'COMPLETED' || c.status === 'LIVE' || c.status === 'RESULTS_OUT') && new Date(c.startTime) >= cutoffDate)
    .reduce((sum, c) => sum + (c.revenueCollected || 0), 0);
  const totalThisMonthRevenue = billingThisMonthPaid + contestThisMonthPaid;

  // 5. Growth trend
  const baseDate = new Date('2026-07-01T23:59:59Z');
  const growthTrend = [];
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(baseDate.getTime() - (i + 1) * 7 * 24 * 3600 * 1000);
    const weekEnd = new Date(baseDate.getTime() - i * 7 * 24 * 3600 * 1000);
    
    const count = orgs.filter(o => {
      const created = new Date(o.createdAt);
      return o.status !== 'DELETED' && created >= weekStart && created < weekEnd;
    }).length;

    const label = weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    growthTrend.push({
      week: label,
      orgs: count
    });
  }

  // 6. Upcoming contests
  const now = new Date('2026-07-01T22:27:01-07:00');
  const next7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  
  const upcomingContests = contests
    .filter(c => {
      const start = new Date(c.startTime);
      return (c.status === 'PUBLISHED' || c.status === 'LIVE' || c.status === 'REGISTRATION_CLOSED') &&
             start >= now && start <= next7Days;
    })
    .map(c => {
      const org = orgs.find(o => o.id === c.organizationId || o.id === c.orgId);
      return {
        id: c.id,
        title: c.title,
        orgName: org ? org.name : 'Unknown Organization',
        orgId: c.organizationId || c.orgId,
        startTime: c.startTime,
        participantCount: c.participantCount,
        status: c.status
      };
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  // 7. Recently created organizations
  const recentOrganizations = [...orgs]
    .filter(o => o.status !== 'DELETED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map(o => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      planId: o.planId,
      logoUrl: o.logoUrl,
      createdAt: o.createdAt
    }));

  return {
    organizations: {
      total: totalOrgs,
      active: activeOrgs,
      suspended: suspendedOrgs,
      deleted: deletedOrgs
    },
    contests: {
      total: contests.length,
      statusBreakdown
    },
    participants: {
      total: finalParticipantsCount
    },
    revenue: {
      totalAllTime: totalAllTimeRevenue,
      thisMonth: totalThisMonthRevenue
    },
    growthTrend,
    upcomingContests,
    recentOrganizations
  };
}
