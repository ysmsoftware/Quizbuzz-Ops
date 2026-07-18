'use client';

import { ContestBooking, PricingConfig } from '@/lib/types';
import { getDatabase, saveDatabase } from '@/lib/data/db';
import { simulateLatency } from '@/lib/api/utils';
import { writeAuditLogEntry } from '@/lib/api/auditLog';

// Helper to compute single contest booking pricing
export function calculateBookingEstimate(
  params: {
    durationMinutes: number;
    questionCount: number;
    participantCount: number;
    addOnsSelected: {
      proctoring: boolean;
      certificates: boolean;
      prioritySupport: boolean;
    };
  },
  config: PricingConfig
) {
  const baseFee = config.baseBookingFee;
  
  // Instance calculation
  const instances = Math.ceil(params.participantCount / config.participantsPerInstance);
  const hours = params.durationMinutes / 60;
  const computeCost = instances * hours * config.perInstanceHourCost;
  
  // Cache cost
  const cacheCost = config.elastiCachePerDayCost;
  
  // Question cost
  const questionCost = params.questionCount * config.perQuestionCost;
  
  // Addons cost
  let addOnsCost = 0;
  if (params.addOnsSelected.proctoring) {
    addOnsCost += config.addOns.proctoring.flatCost;
  }
  if (params.addOnsSelected.certificates) {
    addOnsCost += params.participantCount * config.addOns.certificates.perParticipantCost;
  }
  if (params.addOnsSelected.prioritySupport) {
    addOnsCost += config.addOns.prioritySupport.flatCost;
  }
  
  const subtotal = baseFee + computeCost + cacheCost + questionCost + addOnsCost;
  const margin = subtotal * (config.marginMultiplier - 1);
  const total = subtotal * config.marginMultiplier;
  
  return {
    baseFee,
    computeCost: Math.round(computeCost * 100) / 100,
    cacheCost,
    questionCost,
    addOnsCost: Math.round(addOnsCost * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    total: Math.round(total * 100) / 100,
    instances,
  };
}

export async function getPricingConfig(): Promise<PricingConfig> {
  await simulateLatency();
  const db = getDatabase();
  return db.pricingConfig;
}

export async function updatePricingConfig(
  updates: Partial<PricingConfig>,
  adminName: string,
  adminRole: any
): Promise<PricingConfig> {
  await simulateLatency();
  const db = getDatabase();
  
  const oldConfig = { ...db.pricingConfig };
  const updatedConfig: PricingConfig = {
    ...db.pricingConfig,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedByAdminName: adminName,
  };
  
  db.pricingConfig = updatedConfig;
  
  // Write detailed audit log entry
  writeAuditLogEntry(
    'pricing_config.updated',
    'pricing_config',
    'pricing_default',
    'Pricing Calculator Settings',
    {
      actorAdminName: adminName,
      actorAdminRole: adminRole,
      changes: updates,
      oldConfig,
    }
  );
  
  saveDatabase(db);
  return updatedConfig;
}

export async function getBookings(): Promise<ContestBooking[]> {
  await simulateLatency();
  const db = getDatabase();
  // Return sorted by quoted date descending
  return [...db.contestBookings].sort(
    (a, b) => new Date(b.quotedAt).getTime() - new Date(a.quotedAt).getTime()
  );
}

export async function getBooking(bookingId: string): Promise<ContestBooking> {
  await simulateLatency();
  const db = getDatabase();
  const booking = db.contestBookings.find((b) => b.id === bookingId);
  if (!booking) {
    throw new Error(`Booking ${bookingId} not found`);
  }
  return booking;
}

export async function createContestBooking(
  bookingData: Omit<ContestBooking, 'id' | 'quotedAt'>
): Promise<ContestBooking> {
  await simulateLatency();
  const db = getDatabase();
  
  const id = `booking_${Date.now()}`;
  const newBooking: ContestBooking = {
    ...bookingData,
    id,
    quotedAt: new Date().toISOString(),
  };
  
  db.contestBookings.unshift(newBooking);
  
  // Write audit log
  writeAuditLogEntry(
    'booking.created',
    'booking',
    id,
    newBooking.contestName,
    {
      organizationName: newBooking.organizationName || 'Existing Org ID: ' + newBooking.organizationId,
      total: newBooking.pricingBreakdown.total,
      createdBy: newBooking.createdByAdminName,
    }
  );
  
  saveDatabase(db);
  return newBooking;
}

export async function updateBookingStatus(
  bookingId: string,
  status: ContestBooking['status'],
  details: {
    paymentMethod?: string;
    paymentReference?: string;
    cancellationReason?: string;
    adminName: string;
    adminRole: any;
  }
): Promise<ContestBooking> {
  await simulateLatency();
  const db = getDatabase();
  const bookingIdx = db.contestBookings.findIndex((b) => b.id === bookingId);
  
  if (bookingIdx === -1) {
    throw new Error('Booking not found');
  }
  
  const booking = db.contestBookings[bookingIdx];
  const oldStatus = booking.status;
  
  const updatedBooking: ContestBooking = {
    ...booking,
    status,
  };
  
  const now = new Date().toISOString();
  if (status === 'paid') {
    updatedBooking.paidAt = now;
    updatedBooking.paymentMethod = details.paymentMethod;
    updatedBooking.paymentReference = details.paymentReference;
  } else if (status === 'provisioned') {
    updatedBooking.provisionedAt = now;
  } else if (status === 'completed') {
    // If transitioning to completed, we can also set provisioned if not set
    if (!updatedBooking.provisionedAt) updatedBooking.provisionedAt = now;
  } else if (status === 'cancelled') {
    updatedBooking.cancelledAt = now;
    updatedBooking.cancellationReason = details.cancellationReason;
  }
  
  db.contestBookings[bookingIdx] = updatedBooking;
  
  // Write audit log for transition
  writeAuditLogEntry(
    `booking.status_changed`,
    'booking',
    bookingId,
    booking.contestName,
    {
      actorAdminName: details.adminName,
      actorAdminRole: details.adminRole,
      oldStatus,
      newStatus: status,
      paymentMethod: details.paymentMethod,
      cancellationReason: details.cancellationReason,
    }
  );
  
  saveDatabase(db);
  return updatedBooking;
}
