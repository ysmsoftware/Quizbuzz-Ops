'use client';

import { apiRequest } from '@/lib/api/utils';
import { ContestStatus } from '@/lib/types';

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
  const [statsData, growthData, upcomingData, recentData] = await Promise.all([
    apiRequest<any>('/api/v1/ops/overview/stats'),
    apiRequest<any[]>('/api/v1/ops/overview/org-growth'),
    apiRequest<any[]>('/api/v1/ops/overview/upcoming-contests'),
    apiRequest<any[]>('/api/v1/ops/overview/recent-orgs'),
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

  const growthTrend = (growthData || []).map((point: any) => ({
    week: point.week,
    orgs: point.count,
  }));

  const upcomingContests = (upcomingData || []).map((contest: any) => ({
    id: contest.id,
    title: contest.title,
    orgName: contest.organizationName || 'Unknown Org',
    orgId: contest.organizationId || '',
    startTime: contest.startTime,
    participantCount: contest.participantCount || 0,
    status: 'PUBLISHED' as ContestStatus,
  }));

  const recentOrganizations = (recentData || []).map((org: any) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    planId: 'starter',
    logoUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(org.name)}&backgroundColor=0d9488`,
    createdAt: org.createdAt,
  }));

  return {
    organizations: statsData.organizations,
    contests: {
      total: statsData.contests.total,
      statusBreakdown,
    },
    participants: statsData.participants,
    revenue: {
      totalAllTime: statsData.revenue.allTime,
      thisMonth: statsData.revenue.thisMonth,
    },
    growthTrend,
    upcomingContests,
    recentOrganizations,
  };
}
