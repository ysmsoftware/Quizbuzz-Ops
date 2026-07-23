import { getSessionAdmin } from '../../http/auth-guard';
import { parseQueryParams } from '../../http/validation';
import { billingPaymentsQuerySchema } from './billing.validator';
import { IBillingService, BillingService } from './billing.service';
import { okResponse } from '../../http/envelope';

export class BillingController {
  constructor(private service: IBillingService = new BillingService()) {}

  async getPaymentsList(req: Request) {
    await getSessionAdmin();
    const query = parseQueryParams(req, billingPaymentsQuerySchema);
    const result = await this.service.getPaymentsList(query);
    return okResponse(result, 'Platform payments list retrieved.');
  }

  async getBillingSummary(req: Request) {
    await getSessionAdmin();
    const result = await this.service.getBillingSummary();
    return okResponse(result, 'Platform billing & revenue summary retrieved.');
  }
}

export default BillingController;
