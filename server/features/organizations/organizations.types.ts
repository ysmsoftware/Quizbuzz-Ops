import { PlatformAdminRole } from '@prisma/client';

export interface OrgListMember {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  memberCount: number;
  contestCount: number;
  participantCount: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  plan: {
    slug: string;
    name: string;
    status: string;
  };
  createdAt: string;
}

export interface OrgProfileDetail {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
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
  duration: number;
  registrationFee: number;
  participantCount: number;
  revenueCollected: number;
  createdAt: string;
}

export interface OrgParticipantDetail {
  id: string;
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
