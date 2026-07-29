import { BookingStatus } from '@prisma/client';

export interface BookingsListQueryParams {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  dateMode?: 'quoted' | 'scheduled';
}

export interface CreateBookingInput {
  orgMode: 'existing' | 'new';
  organizationId?: string | null;
  organizationName?: string;
  organizationEmail?: string;
  contestName: string;
  durationMinutes: number;
  questionCount: number;
  participantCount: number;
  addOnsSelected: {
    proctoring: boolean;
    certificates: boolean;
    prioritySupport: boolean;
  };
  desiredStartTime?: string | null;
}

export interface UpdateBookingStatusInput {
  status: BookingStatus;
  paymentMethod?: string;
  paymentReference?: string;
  cancellationReason?: string;
}

export interface UpdatePricingConfigInput {
  currency?: string;
  baseBookingFee?: number;
  perParticipantCost?: number;
  perQuestionCost?: number;
  perInstanceHourCost?: number;
  participantsPerInstance?: number;
  elastiCachePerDayCost?: number;
  addOns?: {
    proctoring?: { enabled?: boolean; flatCost?: number };
    certificates?: { enabled?: boolean; perParticipantCost?: number };
    prioritySupport?: { enabled?: boolean; flatCost?: number };
  };
  marginMultiplier?: number;
}
