import { getSessionAdmin } from '../../http/auth-guard';
import { parseQueryParams } from '../../http/validation';
import { z } from 'zod';
import { OverviewService } from './overview.service';
import { okResponse } from '../../http/envelope';

export class OverviewController {
  private service = new OverviewService();

  async getStats() {
    await getSessionAdmin(); // ensure authenticated operator
    const stats = await this.service.getStats();
    return okResponse(stats, 'Overview stats retrieved successfully.');
  }

  async getOrgGrowth(req: Request) {
    await getSessionAdmin();
    const query = parseQueryParams(
      req,
      z.object({
        weeks: z.coerce.number().optional(),
      })
    );
    const growth = await this.service.getOrgGrowth(query.weeks);
    return okResponse(growth, 'Organization growth points retrieved.');
  }

  async getUpcomingContests(req: Request) {
    await getSessionAdmin();
    const query = parseQueryParams(
      req,
      z.object({
        days: z.coerce.number().optional(),
      })
    );
    const upcoming = await this.service.getUpcomingContests(query.days);
    return okResponse(upcoming, 'Upcoming contests retrieved.');
  }

  async getRecentOrgs(req: Request) {
    await getSessionAdmin();
    const query = parseQueryParams(
      req,
      z.object({
        limit: z.coerce.number().optional(),
      })
    );
    const recent = await this.service.getRecentOrgs(query.limit);
    return okResponse(recent, 'Recent organizations retrieved.');
  }
}
export default OverviewController;
