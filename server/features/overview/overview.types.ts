import type { InstitutionPlatformStats } from '../institution/institution.types';

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
    /** Per ParticipantStatus (REGISTERED, ASSIGNED, SUBMITTED, ABSENT, …). */
    byStatus: Record<string, number>;
  };
  revenue: {
    allTime: number;
    thisMonth: number;
    currency: string;
  };
  /** Institution-mode adoption (null if the main DB couldn't be read for it). */
  institution: InstitutionPlatformStats | null;
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
  /** WINDOW contests run from startTime to endTime; SCHEDULED ones end at startTime + duration. */
  endTime: string;
  status: string;
  timingMode: 'SCHEDULED' | 'WINDOW';
  participantCount: number;
}

export interface RecentOrg {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  ownerEmail: string;
  /** Main-app plan slug; null = no plan recorded (free default). */
  planSlug: string | null;
  logoUrl: string | null;
}
