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

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  joinedDate: string;
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
  currency: string;
  // Which cycles this plan can be purchased under, and each cycle's own
  // explicit price. Annual is never derived from monthly — some plans are
  // annual-only with a fixed rate unrelated to any monthly figure.
  allowsMonthly: boolean;
  allowsAnnual: boolean;
  monthlyPrice: number | null;
  annualPrice: number | null;
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

  // Display-only convenience price for simple "starting at ₹X" labels
  // (e.g. plan-picker dropdowns) — the lower of whichever cycles are enabled.
  priceINR: number;
  organizationCount?: number;
}

/** ADDITIVE stacks on top of the current effective limit; ABSOLUTE replaces it. See server/features/subscriptions/effective-limits.ts. */
export type OverrideMode = 'ADDITIVE' | 'ABSOLUTE';

export interface SubscriptionOverride {
  id: string;
  field: string; // e.g. "maxContestsPerCycle"
  value: number | null; // null for Unlimited
  mode: OverrideMode;
  reason: string;
  expiresAt: string | null; // nullable
  createdAt: string;
  createdByAdminName: string;
}

/** One limit field's resolved value + breakdown — computed server-side, never re-derived in a component. */
export interface EffectiveLimit {
  value: number | null;
  planValue: number | null;
  overridden: boolean;
}

export type EffectiveLimits = Record<
  'maxContestsPerCycle' | 'maxParticipantsPerContest' | 'maxQuestionsPerContest' | 'maxOrgMembers',
  EffectiveLimit
>;

export interface OrganizationSubscription {
  id: string;
  organizationId: string;
  planId: string;
  status: 'active' | 'past_due' | 'cancelled';
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  periodMonths?: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  overrides: SubscriptionOverride[];
  effectiveLimits: EffectiveLimits;
}

export interface UsageSnapshot {
  contestsUsedThisCycle: number;
  /** The org's single fullest contest's participant count — the limit is per-contest, not an org-wide total. */
  maxParticipantsInAContest: number;
  /** The org's single fullest contest's question count — same per-contest reasoning as above. */
  maxQuestionsInAContest: number;
  memberCountUsed: number;
  periodStart: string | null;
  periodEnd: string | null;
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
  actorAdminRole: AdminRole | 'SYSTEM';
  action: string; // e.g. "org.suspended", "plan.updated", "override.added", "payment.refunded", "org.impersonated", "pricing_config.updated"
  // Real backend uses Prisma's AuditTargetType enum casing (e.g. "ORGANIZATION", "SUBSCRIPTION"),
  // widened to string here since mocked domains (bookings, feature flags) still write lowercase values.
  targetType: string;
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

export type OpsMessageChannel = 'EMAIL' | 'WHATSAPP';
export type OpsMessageStatus = 'QUEUED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'FAILED';
export type OpsMessageTemplate =
  | 'BILLING_PAYMENT_SUCCESS'
  | 'BILLING_RECEIPT'
  | 'BILLING_PAYMENT_FAILED'
  | 'SUBSCRIPTION_RENEWAL_REMINDER'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_PLAN_CHANGED'
  | 'SUBSCRIPTION_LIMIT_INCREASED'
  | 'SUBSCRIPTION_LIMIT_DECREASED'
  | 'PAYOUT_ACCOUNT_LINKED'
  | 'PAYOUT_ACCOUNT_STATUS_CHANGED'
  | 'ORG_SUSPENDED'
  | 'ORG_REACTIVATED'
  | 'CUSTOM';

export interface OpsMessage {
  id: string;
  organizationId: string;
  channel: OpsMessageChannel;
  template: OpsMessageTemplate;
  recipient: string;
  subject: string | null;
  params: unknown;
  status: OpsMessageStatus;
  providerMsgId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  retryCount: number;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplateDescriptor {
  id: OpsMessageTemplate;
  name: string;
  variables: string[];
}

export type FeatureFlagSeverity = 'STANDARD' | 'WARNING' | 'CRITICAL';

export interface FeatureFlag {
  id: string;
  key: string;
  label: string;
  description: string;
  isEnabled: boolean;
  scope: 'global';
  severity: FeatureFlagSeverity;
  supportsOrgOverride: boolean;
  updatedAt: string;
  updatedByAdminName: string;
}

export interface FeatureFlagOrgOverride {
  id: string;
  flagKey: string;
  organizationId: string;
  isEnabled: boolean;
  reason: string;
  createdByName: string;
  expiresAt: string | null;
  createdAt: string;
}
