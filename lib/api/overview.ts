'use client';

import { apiRequest } from '@/lib/api/utils';
import { orgLogoFallback } from '@/lib/format';
import { ContestStatus } from '@/lib/types';
import type { InstitutionPlatformStats } from '@/server/features/institution/institution.types';
import type { PlatformOverviewStats, OrgGrowthPoint, UpcomingContest, RecentOrg } from '@/server/features/overview/overview.types';

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
    byStatus: Record<string, number>;
  };
  revenue: {
    totalAllTime: number;
    thisMonth: number;
  };
  /** Institution-mode adoption across the platform; null if it couldn't be computed. */
  institution: InstitutionPlatformStats | null;
  growthTrend: Array<{ week: string; orgs: number }>;
  upcomingContests: Array<{
    id: string;
    title: string;
    orgName: string;
    orgId: string;
    startTime: string;
    endTime: string;
    participantCount: number;
    status: ContestStatus;
    timingMode: 'SCHEDULED' | 'WINDOW';
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
  const [statsData, growthData, upcomingData, recentData] = await Promise.all([
    apiRequest<PlatformOverviewStats>('/api/v1/ops/overview/stats'),
    apiRequest<OrgGrowthPoint[]>('/api/v1/ops/overview/org-growth'),
    apiRequest<UpcomingContest[]>('/api/v1/ops/overview/upcoming-contests'),
    apiRequest<RecentOrg[]>('/api/v1/ops/overview/recent-orgs'),
  ]);

  const defaultStatusBreakdown: Record<ContestStatus, number> = {
    DRAFT: 0,
    PUBLISHED: 0,
    REGISTRATION_CLOSED: 0,
    LIVE: 0,
    EVALUATION: 0,
    RESULTS_OUT: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };

  const statusBreakdown = {
    ...defaultStatusBreakdown,
    ...(statsData.contests?.byStatus || {}),
  };

  const growthTrend = (growthData || []).map((point) => ({
    week: point.week,
    orgs: point.count,
  }));

  const upcomingContests = (upcomingData || []).map((contest) => ({
    id: contest.id,
    title: contest.title,
    orgName: contest.organizationName || 'Unknown Org',
    orgId: contest.organizationId || '',
    startTime: contest.startTime,
    endTime: contest.endTime,
    participantCount: contest.participantCount || 0,
    status: contest.status as ContestStatus,
    timingMode: (contest.timingMode ?? 'SCHEDULED') as 'SCHEDULED' | 'WINDOW',
  }));

  const recentOrganizations = (recentData || []).map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    planId: org.planSlug ?? 'starter',
    logoUrl: org.logoUrl || orgLogoFallback(org.name),
    createdAt: org.createdAt,
  }));

  return {
    organizations: statsData.organizations,
    contests: {
      total: statsData.contests.total,
      statusBreakdown,
    },
    participants: { total: statsData.participants.total, byStatus: statsData.participants.byStatus ?? {} },
    revenue: {
      totalAllTime: statsData.revenue.allTime,
      thisMonth: statsData.revenue.thisMonth,
    },
    institution: statsData.institution ?? null,
    growthTrend,
    upcomingContests,
    recentOrganizations,
  };
}
