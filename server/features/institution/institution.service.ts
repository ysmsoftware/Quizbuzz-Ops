import { InstitutionRepository } from './institution.repository';
import { OrgInstitutionSummary } from './institution.types';

export class InstitutionService {
  constructor(private repo: InstitutionRepository = new InstitutionRepository()) {}

  getOrgSummary(orgId: string): Promise<OrgInstitutionSummary> {
    return this.repo.getOrgSummary(orgId);
  }
}
export default InstitutionService;
