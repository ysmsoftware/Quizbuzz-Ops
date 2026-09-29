import { getSessionAdmin } from '../../http/auth-guard';
import { parseQueryParams } from '../../http/validation';
import { paymentDetailsListQuerySchema } from './payment-details.validator';
import { IPaymentDetailsService, PaymentDetailsService } from './payment-details.service';
import { okResponse } from '../../http/envelope';

export class PaymentDetailsController {
  constructor(private service: IPaymentDetailsService = new PaymentDetailsService()) {}

  async listPayments(req: Request) {
    // Read-only surface: any authenticated platform admin can view it.
    await getSessionAdmin();
    const query = parseQueryParams(req, paymentDetailsListQuerySchema);
    const result = await this.service.listPayments(query);
    return okResponse(result, 'Payment details retrieved.');
  }
}
export default PaymentDetailsController;
