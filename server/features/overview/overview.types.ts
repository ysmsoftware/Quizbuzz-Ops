export interface PlatformOverviewStats {
  organizations: {
    total: number;
    active: number;
    suspended: number;
    deleted: number;
  };
  contests: {
    total: number;
    byStatus: Record<string, number>;
  };
  participants: {
    total: number;
  };
  revenue: {
    allTime: number;
    thisMonth: number;
    currency: string;
  };
  computedAt: string;
}

export interface OrgGrowthPoint {
  week: string;
  count: number;
}

export interface UpcomingContest {
  id: string;
  title: string;
  organizationId: string;
  organizationName: string;
  startTime: string;
  participantCount: number;
}

export interface RecentOrg {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  ownerEmail: string;
}
