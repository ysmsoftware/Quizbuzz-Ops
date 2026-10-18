import { getSessionAdmin } from '../../http/auth-guard';
import { okResponse } from '../../http/envelope';
import { InstitutionService } from './institution.service';

export class InstitutionController {
  constructor(private service: InstitutionService = new InstitutionService()) {}

  async getOrgSummary(orgId: string) {
    await getSessionAdmin();
    return okResponse(await this.service.getOrgSummary(orgId), 'Institution summary retrieved.');
  }
}
export default InstitutionController;
