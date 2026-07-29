import { z } from 'zod';
import { BookingStatus } from '@prisma/client';

export const bookingsListQuerySchema = z.object({
  page: z.preprocess((v) => parseInt(String(v || '1'), 10), z.number().min(1)).default(1),
  limit: z.preprocess((v) => parseInt(String(v || '20'), 10), z.number().min(1).max(100)).default(20),
  status: z.string().optional().default('all'),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  dateMode: z.enum(['quoted', 'scheduled']).optional().default('quoted'),
});

export const bookingCreateSchema = z.object({
  orgMode: z.enum(['existing', 'new']),
  organizationId: z.string().nullable().optional(),
  organizationName: z.string().nullable().optional(),
  organizationEmail: z.string().nullable().optional(),
  contestName: z.string().min(1, 'Contest name is required'),
  durationMinutes: z.number().min(1, 'Duration must be at least 1 minute'),
  questionCount: z.number().min(1, 'Question count must be at least 1'),
  participantCount: z.number().min(1, 'Participant count must be at least 1'),
  addOnsSelected: z.object({
    proctoring: z.boolean(),
    certificates: z.boolean(),
    prioritySupport: z.boolean(),
  }),
  desiredStartTime: z.string().nullable().optional(),
});

export const bookingStatusUpdateSchema = z.object({
  status: z.nativeEnum(BookingStatus),
  paymentMethod: z.string().optional(),
  paymentReference: z.string().optional(),
  cancellationReason: z.string().optional(),
});

export const pricingConfigUpdateSchema = z.object({
  currency: z.string().optional(),
  baseBookingFee: z.number().min(0).optional(),
  perParticipantCost: z.number().min(0).optional(),
  perQuestionCost: z.number().min(0).optional(),
  perInstanceHourCost: z.number().min(0).optional(),
  participantsPerInstance: z.number().min(1).optional(),
  elastiCachePerDayCost: z.number().min(0).optional(),
  addOns: z
    .object({
      proctoring: z
        .object({
          enabled: z.boolean().optional(),
          flatCost: z.number().min(0).optional(),
        })
        .optional(),
      certificates: z
        .object({
          enabled: z.boolean().optional(),
          perParticipantCost: z.number().min(0).optional(),
        })
        .optional(),
      prioritySupport: z
        .object({
          enabled: z.boolean().optional(),
          flatCost: z.number().min(0).optional(),
        })
        .optional(),
    })
    .optional(),
  marginMultiplier: z.number().min(1).optional(),
});
