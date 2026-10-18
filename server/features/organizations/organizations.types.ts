import { PlatformAdminRole } from '@prisma/client';

export interface OrgListMember {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  logoUrl: string;
  /** Institution flags this organization effectively has (grant active, global on). */
  features: string[];
  memberCount: number;
  contestCount: number;
  participantCount: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  plan: {
    slug: string;
    name: string;
    status: string;
    /** false = no OrganizationSubscription row; the plan shown is only the free default. */
    hasSubscription: boolean;
  };
  createdAt: string;
}

export interface OrgProfileDetail {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  /** False when logoUrl is only the generated avatar fallback (nothing uploaded/set). */
  hasCustomLogo: boolean;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  ownerName: string;
  ownerEmail: string;
  memberCount: number;
  contestCount: number;
  participantCount: number;
  onboardingStep: string;
  onboardingCompleted: boolean;
  plan: {
    slug: string;
    name: string;
    status: string;
    /** false = no OrganizationSubscription row; the plan shown is only the free default. */
    hasSubscription: boolean;
  };
  suspension?: {
    reason: string;
    suspendedAt: string;
    suspendedBy: string;
  } | null;
}

export interface OrgMemberDetail {
  id: string;
  adminId: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Viewer';
  joinedDate: string;
}

export interface OrgContestDetail {
  id: string;
  title: string;
  slug: string;
  status: string;
  startTime: string;
  /** WINDOW contests: when the attempt window closes. SCHEDULED: startTime + duration. */
  endTime: string;
  registrationDeadline: string;
  duration: number;
  maxParticipants: number | null;
  registrationFee: number;
  participantCount: number;
  revenueCollected: number;
  /** SCHEDULED: everyone starts together. WINDOW: each participant starts within [startTime, endTime]. */
  timingMode: 'SCHEDULED' | 'WINDOW';
  /** PUBLIC: listed. PRIVATE_LINK: link only. ASSIGNED: only learners the org assigns. */
  audience: 'PUBLIC' | 'PRIVATE_LINK' | 'ASSIGNED';
  /** ALL questions, one of several SETS, or a difficulty POOL draw. */
  questionSelection: 'ALL' | 'SETS' | 'POOL';
  createdAt: string;
}

export interface OrgParticipantDetail {
  id: string;
  contestId: string;
  contestTitle: string;
  registrationRef: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  paymentStatus: string;
  paymentAmount: number;
  registeredAt: string;
}

export interface OrgPaymentDetail {
  id: string;
  source: 'subscription' | 'contest_fee';
  referenceId: string;
  payeeName: string;
  description: string;
  amount: number;
  status: 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED';
  paymentMethod: string;
  date: string;
  // Present only for source: 'subscription' — the full price breakdown that
  // produced `amount`, so the row can be rendered as a self-contained receipt.
  baseAmount?: number;
  gatewayFeeAmount?: number;
  gstAmount?: number;
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  periodMonths?: number;
  planName?: string;
}

export interface SupportNoteDetail {
  id: string;
  organizationId: string;
  authorId: string;
  authorName: string;
  body: string;
  tags: string[];
  createdAt: string;
}
