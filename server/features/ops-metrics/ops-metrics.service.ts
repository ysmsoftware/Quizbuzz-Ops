import { IOpsMetricsRepository, OpsMetricsRepository } from './ops-metrics.repository';
import { FleetSnapshot, LiveContestSummary, ContestLiveSnapshot } from './ops-metrics.types';

export interface IOpsMetricsService {
  getFleetSnapshot(): Promise<FleetSnapshot>;
  listLiveContests(): Promise<LiveContestSummary[]>;
  getContestSnapshot(contestId: string): Promise<ContestLiveSnapshot>;
}

// Thin pass-through today (the main app already shapes/aggregates the data),
// kept as its own layer so a future need — e.g. blending in this app's own
// AWS Cost Explorer numbers from InfraMonitoringView's mock data source
// alongside real fleet metrics — has somewhere to live without touching the
// repository or controller.
export class OpsMetricsService implements IOpsMetricsService {
  constructor(private repo: IOpsMetricsRepository = new OpsMetricsRepository()) {}

  getFleetSnapshot(): Promise<FleetSnapshot> {
    return this.repo.getFleetSnapshot();
  }

  listLiveContests(): Promise<LiveContestSummary[]> {
    return this.repo.listLiveContests();
  }

  getContestSnapshot(contestId: string): Promise<ContestLiveSnapshot> {
    return this.repo.getContestSnapshot(contestId);
  }
}
export default OpsMetricsService;
