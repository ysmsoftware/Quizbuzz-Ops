/**
 * TypeScript Types, Interfaces, and Enums for the QuizBuzz Ops Super Admin Dashboard.
 */

export type AdminRole = 'SUPER_ADMIN' | 'SUPPORT' | 'BILLING_ADMIN';

export interface AdminSession {
  id?: string;
  email: string;
  role: AdminRole;
  name: string;
  avatarUrl: string;
}

export type OrgStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface ContactPerson {
  name: string;
  email: string;
  phone: string;
}

export interface SupportNote {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  tags: string[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  planId: string;
  createdAt: string;
  updatedAt: string;
  membersCount: number; // Backwards compatibility for templates
  memberCount?: number; // Standard name
  contactPerson: ContactPerson;
  ownerName: string;
  ownerEmail: string;
  logoUrl: string;
  website: string;
  notes: SupportNote[];
  suspendReason?: string;
  suspendedAt?: string;
}

export type ContestStatus = 
  | 'DRAFT' 
  | 'PUBLISHED' 
  | 'REGISTRATION_CLOSED' 
  | 'LIVE' 
  | 'EVALUATION' 
  | 'RESULTS_OUT' 
  | 'COMPLETED' 
  | 'CANCELLED';

export interface Contest {
  id: string;
  organizationId: string; // The primary organization relation
  orgId: string;          // Backwards compatibility alias
  title: string;
  status: ContestStatus;
  startTime: string;      // Primary start date/time ISO string
  scheduledAt: string;    // Backwards compatibility alias
  duration: number;       // Duration in minutes
  registrationFee: number;
  currency: string;
  participantCount: number;
  revenueCollected: number;
  createdAt: string;
}

export type ParticipantStatus = 
  | 'REGISTERED' 
  | 'CHECKED_IN' 
  | 'IN_WAITING' 
  | 'IN_QUIZ' 
  | 'SUBMITTED' 
  | 'DISQUALIFIED' 
  | 'ABSENT';

export type ParticipantPaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface Participant {
  id: string;
  organizationId: string;
  contestId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: ParticipantStatus;
  paymentStatus: ParticipantPaymentStatus;
  paymentAmount: number;
  registeredAt: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  billingCycle: 'monthly' | 'annual';
  isActive: boolean;
  limits: {
    maxContestsPerCycle: number | null; // null represents "unlimited"
    maxParticipantsPerContest: number | null;
    maxQuestionsPerContest: number | null;
    maxOrgMembers: number | null;
  };
  features: {
    proctoring: boolean;
    customCertificateBranding: boolean;
    prioritySupport: boolean;
    analyticsExport: boolean;
    customDomain: boolean;
  };
  createdAt: string;
  updatedAt: string;

  // Backwards compatibility properties
  priceINR: number;
  interval: 'monthly' | 'yearly';
  featuresLegacy?: string[]; // to avoid collision with new features object
  maxQuizzes?: number;
  maxParticipantsPerQuiz?: number;
  customBranding?: boolean;
}

export interface SubscriptionOverride {
  id: string;
  field: string; // e.g. "maxContestsPerCycle"
  value: number | null; // null for Unlimited
  reason: string;
  expiresAt: string | null; // nullable
  createdAt: string;
  createdByAdminName: string;
}

export interface OrganizationSubscription {
  id: string;
  organizationId: string;
  planId: string;
  status: 'active' | 'past_due' | 'cancelled';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  overrides: SubscriptionOverride[];
}

export interface UsageSnapshot {
  contestsUsedThisCycle: number;
  participantsUsedThisCycle: number;
  memberCountUsed: number;
}

export interface PlanChangeEvent {
  id: string;
  organizationId: string;
  fromPlanId: string;
  toPlanId: string;
  date: string;
  adminName: string;
}

export type PaymentStatus = 'PAID' | 'PENDING' | 'FAILED';

export interface BillingRecord {
  id: string;
  orgId: string;
  planId: string;
  amountINR: number;
  status: PaymentStatus;
  paymentDate: string;
  transactionId: string;
  invoiceUrl?: string;
}

export interface AuditLog {
  id: string;
  adminEmail: string;
  adminRole: AdminRole;
  action: string;
  target: string;
  timestamp: string;
  details: string;
}

export interface Payment {
  id: string;
  organizationId: string;
  organizationName: string; // denormalized for display
  contestId: string;
  contestTitle: string;
  participantName: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'REFUNDED';
  provider: 'RAZORPAY' | 'MANUAL' | 'FREE';
  paidAt: string | null;
  refundedAt: string | null;
  refundReason: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorAdminName: string;
  actorAdminRole: AdminRole;
  action: string; // e.g. "org.suspended", "plan.updated", "override.added", "payment.refunded", "org.impersonated", "pricing_config.updated"
  targetType: 'organization' | 'plan' | 'payment' | 'booking' | 'pricing_config' | 'feature_flag';
  targetId: string;
  targetLabel: string; // human-readable, e.g. org name
  metadata: any; // a small before/after or details object
  createdAt: string;
}

export interface PricingConfig {
  id: string;
  currency: string;
  baseBookingFee: number;
  perParticipantCost: number;
  perQuestionCost: number;
  perInstanceHourCost: number;
  participantsPerInstance: number;
  elastiCachePerDayCost: number;
  addOns: {
    proctoring: { enabled: boolean; flatCost: number };
    certificates: { enabled: boolean; perParticipantCost: number };
    prioritySupport: { enabled: boolean; flatCost: number };
  };
  marginMultiplier: number;
  updatedAt: string;
  updatedByAdminName: string;
}

export interface BookingPricingBreakdown {
  baseFee: number;
  computeCost: number;
  cacheCost: number;
  questionCost: number;
  addOnsCost: number;
  subtotal: number;
  margin: number;
  total: number;
}

export interface ContestBooking {
  id: string;
  status: 'quoted' | 'paid' | 'provisioned' | 'completed' | 'cancelled';
  organizationId: string | null;
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
  pricingBreakdown: BookingPricingBreakdown;
  desiredStartTime: string | null;
  quotedAt: string;
  paidAt: string | null;
  provisionedAt: string | null;
  cancelledAt: string | null;
  createdByAdminName: string;
  paymentMethod?: string;
  paymentReference?: string;
  cancellationReason?: string;
}

export interface InfraStatus {
  mode: 'idle' | 'live';
  modeChangedAt: string;
  activeAsgInstanceCount: number;
  minAsgInstanceCount: number;
  maxAsgInstanceCount: number;
  elastiCacheStatus: 'not_provisioned' | 'provisioning' | 'available' | 'destroying';
  currentLiveContestIds: string[];
  estimatedMonthToDateCostUsd: number;
  estimatedMonthToDateCostBreakdown: {
    permanentInfra: number;
    ephemeralInfra: number;
  };
}

export interface ScalingConfig {
  instanceCount: number;
  maxWsConnectionsPerInstance: number;
  redisClusterSize: number;
  queueConcurrency: number;
  workerInstances: number;
  wsHeartbeatIntervalMs: number;
  quizSessionTtlSeconds: number;
  rateLimitWindowSeconds: number;
  rateLimitMax: number;
  otpRateLimit: number;
}

export interface FeatureFlag {
  id: string;
  key: string;
  label: string;
  description: string;
  isEnabled: boolean;
  scope: 'global';
  updatedAt: string;
  updatedByAdminName: string;
}
