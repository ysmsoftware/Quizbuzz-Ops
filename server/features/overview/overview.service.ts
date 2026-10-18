import { IOverviewRepository, OverviewRepository } from './overview.repository';
import { cache } from '../../cache/cache';
import { PlatformOverviewStats, OrgGrowthPoint, UpcomingContest, RecentOrg } from './overview.types';
import type { InstitutionPlatformStats } from '../institution/institution.types';

export interface IOverviewService {
  getStats(): Promise<PlatformOverviewStats>;
  getOrgGrowth(weeks?: number): Promise<OrgGrowthPoint[]>;
  getUpcomingContests(days?: number): Promise<UpcomingContest[]>;
  getRecentOrgs(limit?: number): Promise<RecentOrg[]>;
}

export class OverviewService implements IOverviewService {
  constructor(
    private repo: IOverviewRepository = new OverviewRepository(),
    // Institution adoption lives in its own feature module; injected so Overview stays decoupled from it.
    private institutionStats: () => Promise<InstitutionPlatformStats> = async () => {
      throw new Error('institution stats not wired');
    }
  ) {}

  async getStats(): Promise<PlatformOverviewStats> {
    const cacheKey = 'ops:cache:overview:stats';
    const cached = await cache.get<PlatformOverviewStats>(cacheKey);
    if (cached) return cached;

    const [orgs, contests, participants, revenue, institution] = await Promise.all([
      this.repo.getOrgStats(),
      this.repo.getContestStats(),
      this.repo.getParticipantStats(),
      this.repo.getRevenueStats(),
      // A failure here must not blank the whole Overview.
      this.institutionStats().catch((err) => {
        console.error('Institution stats unavailable:', err);
        return null;
      }),
    ]);

    const stats: PlatformOverviewStats = {
      organizations: orgs,
      contests: contests,
      participants: participants,
      revenue: revenue,
      institution,
      computedAt: new Date().toISOString(),
    };

    await cache.set(cacheKey, stats, 60); // Cache for 60 seconds
    return stats;
  }

  async getOrgGrowth(weeks?: number): Promise<OrgGrowthPoint[]> {
    const w = weeks || 12;
    const cacheKey = `ops:cache:overview:growth:${w}`;
    const cached = await cache.get<OrgGrowthPoint[]>(cacheKey);
    if (cached) return cached;

    const growth = await this.repo.getOrgGrowth(w);
    await cache.set(cacheKey, growth, 300); // Cache for 5 minutes
    return growth;
  }

  async getUpcomingContests(days?: number): Promise<UpcomingContest[]> {
    const d = days || 7;
    const cacheKey = `ops:cache:overview:upcoming:${d}`;
    const cached = await cache.get<UpcomingContest[]>(cacheKey);
    if (cached) return cached;

    const upcoming = await this.repo.getUpcomingContests(d);
    await cache.set(cacheKey, upcoming, 60); // Cache for 60 seconds
    return upcoming;
  }

  async getRecentOrgs(limit?: number): Promise<RecentOrg[]> {
    const l = limit || 5;
    const cacheKey = `ops:cache:overview:recent:${l}`;
    const cached = await cache.get<RecentOrg[]>(cacheKey);
    if (cached) return cached;

    const recent = await this.repo.getRecentOrgs(l);
    await cache.set(cacheKey, recent, 60); // Cache for 60 seconds
    return recent;
  }
}
export default OverviewService;
