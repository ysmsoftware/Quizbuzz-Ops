'use client';

import { ContestBooking, PricingConfig } from '@/lib/types';
import { apiRequest } from '@/lib/api/utils';
export { calculateBookingEstimate } from '@/lib/pricing/estimate';

export async function getPricingConfig(): Promise<PricingConfig> {
  return apiRequest<PricingConfig>('/api/v1/ops/bookings/pricing-config');
}

export async function updatePricingConfig(
  updates: Partial<PricingConfig>,
  _adminName?: string,
  _adminRole?: any
): Promise<PricingConfig> {
  return apiRequest<PricingConfig>('/api/v1/ops/bookings/pricing-config', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function getBookings(): Promise<ContestBooking[]> {
  const result = await apiRequest<{ rows: ContestBooking[]; total: number }>('/api/v1/ops/bookings?limit=100');
  return result.rows;
}

export async function getBooking(bookingId: string): Promise<ContestBooking> {
  return apiRequest<ContestBooking>(`/api/v1/ops/bookings/${bookingId}`);
}

export async function createContestBooking(
  bookingData: Omit<ContestBooking, 'id' | 'quotedAt'>
): Promise<ContestBooking> {
  const orgMode = bookingData.organizationId ? 'existing' : 'new';

  const payload = {
    orgMode,
    organizationId: bookingData.organizationId || null,
    organizationName: bookingData.organizationName,
    organizationEmail: bookingData.organizationEmail,
    contestName: bookingData.contestName,
    durationMinutes: bookingData.durationMinutes,
    questionCount: bookingData.questionCount,
    participantCount: bookingData.participantCount,
    addOnsSelected: bookingData.addOnsSelected,
    desiredStartTime: bookingData.desiredStartTime,
  };

  return apiRequest<ContestBooking>('/api/v1/ops/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateBookingStatus(
  bookingId: string,
  status: ContestBooking['status'],
  details: {
    paymentMethod?: string;
    paymentReference?: string;
    cancellationReason?: string;
    adminName?: string;
    adminRole?: any;
  }
): Promise<ContestBooking> {
  const payload = {
    status: status.toUpperCase(),
    paymentMethod: details.paymentMethod,
    paymentReference: details.paymentReference,
    cancellationReason: details.cancellationReason,
  };

  return apiRequest<ContestBooking>(`/api/v1/ops/bookings/${bookingId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
