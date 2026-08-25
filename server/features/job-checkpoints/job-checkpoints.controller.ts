import { getSessionAdmin } from '../../http/auth-guard';
import { parseQueryParams } from '../../http/validation';
import { jobCheckpointListQuerySchema } from './job-checkpoints.validator';
import { IJobCheckpointsService, JobCheckpointsService } from './job-checkpoints.service';
import { okResponse } from '../../http/envelope';

export class JobCheckpointsController {
  constructor(private service: IJobCheckpointsService = new JobCheckpointsService()) {}

  async listScheduledJobs(req: Request) {
    // Read-only surface: any authenticated platform admin can view job timings.
    await getSessionAdmin();
    const query = parseQueryParams(req, jobCheckpointListQuerySchema);
    const result = await this.service.listScheduledJobs(query);
    return okResponse(result, 'Job checkpoint summary retrieved.');
  }

  async getJobTimeline(jobId: string) {
    await getSessionAdmin();
    const result = await this.service.getJobTimeline(jobId);
    return okResponse(result, 'Job checkpoint timeline retrieved.');
  }
}
export default JobCheckpointsController;
