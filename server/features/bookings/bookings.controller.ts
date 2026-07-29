import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseQueryParams, parseRequest } from '../../http/validation';
import { okResponse, errorResponse } from '../../http/envelope';
import { PlatformAdminRole } from '@prisma/client';
import { IBookingsService, BookingsService } from './bookings.service';
import {
  bookingsListQuerySchema,
  bookingCreateSchema,
  bookingStatusUpdateSchema,
  pricingConfigUpdateSchema,
} from './bookings.validator';

export class BookingsController {
  constructor(private service: IBookingsService = new BookingsService()) {}

  async getPricingConfig(req: Request) {
    await getSessionAdmin();
    const config = await this.service.getPricingConfig();
    return okResponse(config, 'Pricing configuration retrieved.');
  }

  async updatePricingConfig(req: Request) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const input = await parseRequest(req, pricingConfigUpdateSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };

    const updated = await this.service.updatePricingConfig(input, actor);
    return okResponse(updated, 'Pricing configuration updated successfully.');
  }

  async getBookings(req: Request) {
    await getSessionAdmin();
    const query = parseQueryParams(req, bookingsListQuerySchema);
    const result = await this.service.getBookings(query);
    return okResponse(result, 'Contest bookings retrieved.');
  }

  async getBookingById(req: Request, id: string) {
    await getSessionAdmin();
    const booking = await this.service.getBookingById(id);
    if (!booking) {
      return errorResponse('Contest booking not found', 'NOT_FOUND', null, 404);
    }
    return okResponse(booking, 'Contest booking details retrieved.');
  }

  async createBooking(req: Request) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const input = await parseRequest(req, bookingCreateSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };

    const booking = await this.service.createBooking(input as any, actor);
    return okResponse(booking, 'Contest booking quote created successfully.');
  }

  async updateBookingStatus(req: Request, id: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const input = await parseRequest(req, bookingStatusUpdateSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };

    const updated = await this.service.updateBookingStatus(id, input, actor);
    return okResponse(updated, 'Booking status updated successfully.');
  }
}

export default BookingsController;
