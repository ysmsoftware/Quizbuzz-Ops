import { prisma } from '../../db/ops-prisma';
import { queryMainDb } from '../../db/main-db-pool';
import { BookingStatus, Prisma } from '@prisma/client';
import { generateUlid } from '../../utils/ulid';
import { BookingsListQueryParams, CreateBookingInput, UpdateBookingStatusInput, UpdatePricingConfigInput } from './bookings.types';
import { PricingConfig, ContestBooking, BookingPricingBreakdown } from '@/lib/types';

export interface IBookingsRepository {
  getPricingConfig(): Promise<PricingConfig>;
  updatePricingConfig(data: UpdatePricingConfigInput, adminId?: string | null, adminName?: string): Promise<PricingConfig>;
  getBookings(params: BookingsListQueryParams): Promise<{ rows: ContestBooking[]; total: number }>;
  getBookingById(id: string): Promise<ContestBooking | null>;
  createBooking(
    bookingData: CreateBookingInput,
    pricingBreakdown: BookingPricingBreakdown,
    adminId: string,
    adminName: string
  ): Promise<ContestBooking>;
  updateBookingStatus(
    id: string,
    updateData: UpdateBookingStatusInput & {
      paidAt?: Date | null;
      provisionedAt?: Date | null;
      cancelledAt?: Date | null;
      opsPaymentId?: string | null;
    }
  ): Promise<ContestBooking>;
  createOpsPaymentForBooking(params: {
    bookingId: string;
    organizationId: string;
    amount: number;
    paymentMethod?: string;
    paymentReference?: string;
  }): Promise<string>;
  findOrganizationById(orgId: string): Promise<{ id: string; name: string; slug: string } | null>;
}

const DEFAULT_PRICING_CONFIG_ID = 'pricing_default';

const DEFAULT_PRICING_VALUES = {
  currency: 'INR',
  baseBookingFee: new Prisma.Decimal(5000),
  perParticipantCost: new Prisma.Decimal(2.5),
  perQuestionCost: new Prisma.Decimal(10),
  perInstanceHourCost: new Prisma.Decimal(45),
  participantsPerInstance: 1000,
  elastiCachePerDayCost: new Prisma.Decimal(150),
  addOnProctoringEnabled: true,
  addOnProctoringFlatCost: new Prisma.Decimal(3500),
  addOnCertificatesEnabled: true,
  addOnCertificatesPerParticipantCost: new Prisma.Decimal(1.5),
  addOnPrioritySupportEnabled: true,
  addOnPrioritySupportFlatCost: new Prisma.Decimal(2000),
  marginMultiplier: new Prisma.Decimal(1.35),
  updatedByName: 'System Default',
};

function mapPricingConfig(dbConfig: any): PricingConfig {
  return {
    id: dbConfig.id,
    currency: dbConfig.currency,
    baseBookingFee: Number(dbConfig.baseBookingFee),
    perParticipantCost: Number(dbConfig.perParticipantCost),
    perQuestionCost: Number(dbConfig.perQuestionCost),
    perInstanceHourCost: Number(dbConfig.perInstanceHourCost),
    participantsPerInstance: dbConfig.participantsPerInstance,
    elastiCachePerDayCost: Number(dbConfig.elastiCachePerDayCost),
    addOns: {
      proctoring: {
        enabled: dbConfig.addOnProctoringEnabled,
        flatCost: Number(dbConfig.addOnProctoringFlatCost),
      },
      certificates: {
        enabled: dbConfig.addOnCertificatesEnabled,
        perParticipantCost: Number(dbConfig.addOnCertificatesPerParticipantCost),
      },
      prioritySupport: {
        enabled: dbConfig.addOnPrioritySupportEnabled,
        flatCost: Number(dbConfig.addOnPrioritySupportFlatCost),
      },
    },
    marginMultiplier: Number(dbConfig.marginMultiplier),
    updatedAt: dbConfig.updatedAt instanceof Date ? dbConfig.updatedAt.toISOString() : dbConfig.updatedAt,
    updatedByAdminName: dbConfig.updatedByName,
  };
}

function mapContestBooking(dbBooking: any): ContestBooking {
  return {
    id: dbBooking.id,
    status: dbBooking.status.toLowerCase() as ContestBooking['status'],
    organizationId: dbBooking.organizationId,
    organizationName: dbBooking.organizationName ?? undefined,
    organizationEmail: dbBooking.organizationEmail ?? undefined,
    contestName: dbBooking.contestName,
    durationMinutes: dbBooking.durationMinutes,
    questionCount: dbBooking.questionCount,
    participantCount: dbBooking.participantCount,
    addOnsSelected: {
      proctoring: dbBooking.addOnProctoring,
      certificates: dbBooking.addOnCertificates,
      prioritySupport: dbBooking.addOnPrioritySupport,
    },
    pricingBreakdown: dbBooking.pricingBreakdown as BookingPricingBreakdown,
    desiredStartTime: dbBooking.desiredStartTime
      ? dbBooking.desiredStartTime instanceof Date
        ? dbBooking.desiredStartTime.toISOString()
        : dbBooking.desiredStartTime
      : null,
    quotedAt: dbBooking.quotedAt instanceof Date ? dbBooking.quotedAt.toISOString() : dbBooking.quotedAt,
    paidAt: dbBooking.paidAt
      ? dbBooking.paidAt instanceof Date
        ? dbBooking.paidAt.toISOString()
        : dbBooking.paidAt
      : null,
    provisionedAt: dbBooking.provisionedAt
      ? dbBooking.provisionedAt instanceof Date
        ? dbBooking.provisionedAt.toISOString()
        : dbBooking.provisionedAt
      : null,
    cancelledAt: dbBooking.cancelledAt
      ? dbBooking.cancelledAt instanceof Date
        ? dbBooking.cancelledAt.toISOString()
        : dbBooking.cancelledAt
      : null,
    createdByAdminName: dbBooking.createdByName,
    paymentMethod: dbBooking.paymentMethod ?? undefined,
    paymentReference: dbBooking.paymentReference ?? undefined,
    cancellationReason: dbBooking.cancellationReason ?? undefined,
  };
}

export class BookingsRepository implements IBookingsRepository {
  async getPricingConfig(): Promise<PricingConfig> {
    let dbConfig = await prisma.pricingConfig.findUnique({
      where: { id: DEFAULT_PRICING_CONFIG_ID },
    });

    if (!dbConfig) {
      dbConfig = await prisma.pricingConfig.create({
        data: {
          id: DEFAULT_PRICING_CONFIG_ID,
          ...DEFAULT_PRICING_VALUES,
        },
      });
    }

    return mapPricingConfig(dbConfig);
  }

  async updatePricingConfig(
    data: UpdatePricingConfigInput,
    adminId?: string | null,
    adminName = 'Platform Admin'
  ): Promise<PricingConfig> {
    const existing = await this.getPricingConfig();

    const updateData: any = {
      updatedByName: adminName,
      updatedById: adminId || null,
    };

    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.baseBookingFee !== undefined) updateData.baseBookingFee = new Prisma.Decimal(data.baseBookingFee);
    if (data.perParticipantCost !== undefined) updateData.perParticipantCost = new Prisma.Decimal(data.perParticipantCost);
    if (data.perQuestionCost !== undefined) updateData.perQuestionCost = new Prisma.Decimal(data.perQuestionCost);
    if (data.perInstanceHourCost !== undefined) updateData.perInstanceHourCost = new Prisma.Decimal(data.perInstanceHourCost);
    if (data.participantsPerInstance !== undefined) updateData.participantsPerInstance = data.participantsPerInstance;
    if (data.elastiCachePerDayCost !== undefined) updateData.elastiCachePerDayCost = new Prisma.Decimal(data.elastiCachePerDayCost);
    if (data.marginMultiplier !== undefined) updateData.marginMultiplier = new Prisma.Decimal(data.marginMultiplier);

    if (data.addOns) {
      if (data.addOns.proctoring?.enabled !== undefined) updateData.addOnProctoringEnabled = data.addOns.proctoring.enabled;
      if (data.addOns.proctoring?.flatCost !== undefined)
        updateData.addOnProctoringFlatCost = new Prisma.Decimal(data.addOns.proctoring.flatCost);
      if (data.addOns.certificates?.enabled !== undefined) updateData.addOnCertificatesEnabled = data.addOns.certificates.enabled;
      if (data.addOns.certificates?.perParticipantCost !== undefined)
        updateData.addOnCertificatesPerParticipantCost = new Prisma.Decimal(data.addOns.certificates.perParticipantCost);
      if (data.addOns.prioritySupport?.enabled !== undefined) updateData.addOnPrioritySupportEnabled = data.addOns.prioritySupport.enabled;
      if (data.addOns.prioritySupport?.flatCost !== undefined)
        updateData.addOnPrioritySupportFlatCost = new Prisma.Decimal(data.addOns.prioritySupport.flatCost);
    }

    const updated = await prisma.pricingConfig.upsert({
      where: { id: DEFAULT_PRICING_CONFIG_ID },
      update: updateData,
      create: {
        id: DEFAULT_PRICING_CONFIG_ID,
        ...DEFAULT_PRICING_VALUES,
        ...updateData,
      },
    });

    return mapPricingConfig(updated);
  }

  async getBookings(params: BookingsListQueryParams): Promise<{ rows: ContestBooking[]; total: number }> {
    const where: Prisma.ContestBookingWhereInput = {};

    if (params.status && params.status !== 'all') {
      const upperStatus = params.status.toUpperCase();
      if (Object.values(BookingStatus).includes(upperStatus as BookingStatus)) {
        where.status = upperStatus as BookingStatus;
      }
    }

    if (params.search) {
      const search = params.search.trim();
      where.OR = [
        { contestName: { contains: search, mode: 'insensitive' } },
        { organizationName: { contains: search, mode: 'insensitive' } },
        { organizationEmail: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (params.startDate || params.endDate) {
      const fieldName = params.dateMode === 'scheduled' ? 'desiredStartTime' : 'quotedAt';
      const dateFilter: Prisma.DateTimeFilter = {};
      if (params.startDate) dateFilter.gte = new Date(params.startDate);
      if (params.endDate) dateFilter.lte = new Date(params.endDate);
      where[fieldName] = dateFilter;
    }

    const offset = (params.page - 1) * params.limit;

    const [rows, total] = await Promise.all([
      prisma.contestBooking.findMany({
        where,
        orderBy: { quotedAt: 'desc' },
        skip: offset,
        take: params.limit,
      }),
      prisma.contestBooking.count({ where }),
    ]);

    return {
      rows: rows.map(mapContestBooking),
      total,
    };
  }

  async getBookingById(id: string): Promise<ContestBooking | null> {
    const booking = await prisma.contestBooking.findUnique({
      where: { id },
    });
    return booking ? mapContestBooking(booking) : null;
  }

  async createBooking(
    bookingData: CreateBookingInput,
    pricingBreakdown: BookingPricingBreakdown,
    adminId: string,
    adminName: string
  ): Promise<ContestBooking> {
    const id = `booking_${generateUlid()}`;

    const created = await prisma.contestBooking.create({
      data: {
        id,
        status: BookingStatus.QUOTED,
        organizationId: bookingData.organizationId || null,
        organizationName: bookingData.organizationName || null,
        organizationEmail: bookingData.organizationEmail || null,
        contestName: bookingData.contestName,
        durationMinutes: bookingData.durationMinutes,
        questionCount: bookingData.questionCount,
        participantCount: bookingData.participantCount,
        addOnProctoring: bookingData.addOnsSelected.proctoring,
        addOnCertificates: bookingData.addOnsSelected.certificates,
        addOnPrioritySupport: bookingData.addOnsSelected.prioritySupport,
        pricingBreakdown: pricingBreakdown as any,
        desiredStartTime: bookingData.desiredStartTime ? new Date(bookingData.desiredStartTime) : null,
        quotedAt: new Date(),
        createdById: adminId,
        createdByName: adminName,
      },
    });

    return mapContestBooking(created);
  }

  async updateBookingStatus(
    id: string,
    updateData: UpdateBookingStatusInput & {
      paidAt?: Date | null;
      provisionedAt?: Date | null;
      cancelledAt?: Date | null;
      opsPaymentId?: string | null;
    }
  ): Promise<ContestBooking> {
    const dataToUpdate: Prisma.ContestBookingUpdateInput = {
      status: updateData.status,
    };

    if (updateData.paymentMethod !== undefined) dataToUpdate.paymentMethod = updateData.paymentMethod;
    if (updateData.paymentReference !== undefined) dataToUpdate.paymentReference = updateData.paymentReference;
    if (updateData.cancellationReason !== undefined) dataToUpdate.cancellationReason = updateData.cancellationReason;
    if (updateData.paidAt !== undefined) dataToUpdate.paidAt = updateData.paidAt;
    if (updateData.provisionedAt !== undefined) dataToUpdate.provisionedAt = updateData.provisionedAt;
    if (updateData.cancelledAt !== undefined) dataToUpdate.cancelledAt = updateData.cancelledAt;
    if (updateData.opsPaymentId !== undefined) {
      if (updateData.opsPaymentId) {
        dataToUpdate.opsPayment = { connect: { id: updateData.opsPaymentId } };
      }
    }

    const updated = await prisma.contestBooking.update({
      where: { id },
      data: dataToUpdate,
    });

    return mapContestBooking(updated);
  }

  async createOpsPaymentForBooking(params: {
    bookingId: string;
    organizationId: string;
    amount: number;
    paymentMethod?: string;
    paymentReference?: string;
  }): Promise<string> {
    const paymentId = `pay_${generateUlid()}`;

    const payment = await prisma.opsPayment.create({
      data: {
        id: paymentId,
        organizationId: params.organizationId || 'PROSPECT',
        purpose: 'CONTEST_BOOKING',
        bookingId: params.bookingId,
        amount: new Prisma.Decimal(params.amount),
        currency: 'INR',
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    return payment.id;
  }

  async findOrganizationById(orgId: string): Promise<{ id: string; name: string; slug: string } | null> {
    const rows = await queryMainDb(
      `SELECT id, name, slug FROM organizations WHERE id = $1 AND "isDeleted" = false`,
      [orgId]
    );
    return rows[0] || null;
  }
}

export default BookingsRepository;
