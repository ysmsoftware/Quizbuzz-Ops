import { getSessionAdmin } from '../../http/auth-guard';
import { AppError } from '../../http/errors';
import { IOpsMetricsService, OpsMetricsService } from './ops-metrics.service';
import { okResponse } from '../../http/envelope';

class MissingContestIdError extends AppError {
  constructor() {
    super('contestId is required', 'VALIDATION_ERROR', 400);
  }
}

// Read-only surface: any authenticated platform admin can view live
// operational metrics (same clearance level as the other Infra & Cost /
// audit-log views — this is a monitoring surface, not one that mutates
// anything on the main app).
export class OpsMetricsController {
  constructor(private service: IOpsMetricsService = new OpsMetricsService()) {}

  async getFleet() {
    await getSessionAdmin();
    const result = await this.service.getFleetSnapshot();
    return okResponse(result, 'Fleet snapshot retrieved.');
  }

  async listContests() {
    await getSessionAdmin();
    const result = await this.service.listLiveContests();
    return okResponse(result, 'Live contests retrieved.');
  }

  async getContestSnapshot(contestId: string) {
    await getSessionAdmin();
    if (!contestId) throw new MissingContestIdError();
    const result = await this.service.getContestSnapshot(contestId);
    return okResponse(result, 'Contest live snapshot retrieved.');
  }
}
export default OpsMetricsController;
