import { IBookingsRepository, BookingsRepository } from './bookings.repository';
import { BookingsListQueryParams, CreateBookingInput, UpdateBookingStatusInput, UpdatePricingConfigInput } from './bookings.types';
import { PricingConfig, ContestBooking } from '@/lib/types';
import { calculateBookingEstimate } from '@/lib/pricing/estimate';
import { AuditActor, writeAuditLogEntry } from '../../audit/audit-writer';
import { AuditTargetType, BookingStatus } from '@prisma/client';
import { NotFoundError, ConflictError } from '../../http/errors';

export interface IBookingsService {
  getPricingConfig(): Promise<PricingConfig>;
  updatePricingConfig(data: UpdatePricingConfigInput, actor: AuditActor): Promise<PricingConfig>;
  getBookings(params: BookingsListQueryParams): Promise<{ rows: ContestBooking[]; total: number }>;
  getBookingById(id: string): Promise<ContestBooking | null>;
  createBooking(input: CreateBookingInput, actor: AuditActor): Promise<ContestBooking>;
  updateBookingStatus(id: string, input: UpdateBookingStatusInput, actor: AuditActor): Promise<ContestBooking>;
}

export class BookingsService implements IBookingsService {
  constructor(private repo: IBookingsRepository = new BookingsRepository()) {}

  async getPricingConfig(): Promise<PricingConfig> {
    return this.repo.getPricingConfig();
  }

  async updatePricingConfig(data: UpdatePricingConfigInput, actor: AuditActor): Promise<PricingConfig> {
    const oldConfig = await this.repo.getPricingConfig();
    const updatedConfig = await this.repo.updatePricingConfig(data, actor.id, actor.name);

    await writeAuditLogEntry(
      actor,
      'pricing_config.updated',
      AuditTargetType.PRICING_CONFIG,
      'pricing_default',
      'Pricing Calculator Settings',
      {
        actorAdminName: actor.name,
        actorAdminRole: actor.role,
        changes: data,
        oldConfig,
      }
    );

    return updatedConfig;
  }

  async getBookings(params: BookingsListQueryParams): Promise<{ rows: ContestBooking[]; total: number }> {
    return this.repo.getBookings(params);
  }

  async getBookingById(id: string): Promise<ContestBooking | null> {
    return this.repo.getBookingById(id);
  }

  async createBooking(input: CreateBookingInput, actor: AuditActor): Promise<ContestBooking> {
    let resolvedOrgName = input.organizationName;

    if (input.orgMode === 'existing') {
      if (!input.organizationId) {
        throw new ConflictError('Organization ID is required for existing organization mode');
      }
      const org = await this.repo.findOrganizationById(input.organizationId);
      if (!org) {
        throw new NotFoundError(`Organization with ID ${input.organizationId} not found`);
      }
      resolvedOrgName = org.name;
    }

    const currentConfig = await this.repo.getPricingConfig();

    const pricingBreakdown = calculateBookingEstimate(
      {
        durationMinutes: input.durationMinutes,
        questionCount: input.questionCount,
        participantCount: input.participantCount,
        addOnsSelected: input.addOnsSelected,
      },
      currentConfig
    );

    const bookingInput = {
      ...input,
      organizationName: resolvedOrgName,
    };

    const newBooking = await this.repo.createBooking(
      bookingInput,
      pricingBreakdown,
      actor.id || 'system',
      actor.name
    );

    await writeAuditLogEntry(
      actor,
      'booking.created',
      AuditTargetType.BOOKING,
      newBooking.id,
      newBooking.contestName,
      {
        organizationName: newBooking.organizationName || `Existing Org ID: ${newBooking.organizationId}`,
        total: newBooking.pricingBreakdown.total,
        createdBy: newBooking.createdByAdminName,
      }
    );

    return newBooking;
  }

  async updateBookingStatus(id: string, input: UpdateBookingStatusInput, actor: AuditActor): Promise<ContestBooking> {
    const existing = await this.repo.getBookingById(id);
    if (!existing) {
      throw new NotFoundError(`Booking ${id} not found`);
    }

    const currentStatus = existing.status.toUpperCase();
    const newStatus = input.status;

    if (currentStatus === BookingStatus.COMPLETED || currentStatus === BookingStatus.CANCELLED) {
      throw new ConflictError(`Cannot update status of a ${existing.status} booking`);
    }

    // State machine validation
    if (newStatus !== BookingStatus.CANCELLED) {
      if (currentStatus === BookingStatus.QUOTED && newStatus !== BookingStatus.PAID) {
        throw new ConflictError(`Invalid status transition from ${existing.status} to ${newStatus.toLowerCase()}`);
      }
      if (currentStatus === BookingStatus.PAID && newStatus !== BookingStatus.PROVISIONED) {
        throw new ConflictError(`Invalid status transition from ${existing.status} to ${newStatus.toLowerCase()}`);
      }
      if (currentStatus === BookingStatus.PROVISIONED && newStatus !== BookingStatus.COMPLETED) {
        throw new ConflictError(`Invalid status transition from ${existing.status} to ${newStatus.toLowerCase()}`);
      }
    }

    const updateFields: any = {
      status: newStatus,
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference,
      cancellationReason: input.cancellationReason,
    };

    const now = new Date();
    if (newStatus === BookingStatus.PAID) {
      updateFields.paidAt = now;
      const opsPaymentId = await this.repo.createOpsPaymentForBooking({
        bookingId: id,
        organizationId: existing.organizationId || 'PROSPECT',
        amount: existing.pricingBreakdown.total,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
      });
      updateFields.opsPaymentId = opsPaymentId;
    } else if (newStatus === BookingStatus.PROVISIONED) {
      updateFields.provisionedAt = now;
    } else if (newStatus === BookingStatus.COMPLETED) {
      if (!existing.provisionedAt) {
        updateFields.provisionedAt = now;
      }
    } else if (newStatus === BookingStatus.CANCELLED) {
      updateFields.cancelledAt = now;
    }

    const updated = await this.repo.updateBookingStatus(id, updateFields);

    await writeAuditLogEntry(
      actor,
      'booking.status_changed',
      AuditTargetType.BOOKING,
      id,
      existing.contestName,
      {
        actorAdminName: actor.name,
        actorAdminRole: actor.role,
        oldStatus: existing.status,
        newStatus: updated.status,
        paymentMethod: input.paymentMethod,
        cancellationReason: input.cancellationReason,
      }
    );

    return updated;
  }
}

export default BookingsService;
