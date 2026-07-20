import { OverviewRepository } from './overview.repository';
import { cache } from '../../cache/cache';
import { PlatformOverviewStats, OrgGrowthPoint, UpcomingContest, RecentOrg } from './overview.types';

export class OverviewService {
  private repo = new OverviewRepository();

  async getStats(): Promise<PlatformOverviewStats> {
    const cacheKey = 'ops:cache:overview:stats';
    const cached = await cache.get<PlatformOverviewStats>(cacheKey);
    if (cached) return cached;

    const [orgs, contests, participants, revenue] = await Promise.all([
      this.repo.getOrgStats(),
      this.repo.getContestStats(),
      this.repo.getParticipantStats(),
      this.repo.getRevenueStats(),
    ]);

    const stats: PlatformOverviewStats = {
      organizations: orgs,
      contests: contests,
      participants: participants,
      revenue: revenue,
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
