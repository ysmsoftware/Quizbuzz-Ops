'use client';

import { Organization, Contest, Participant, SupportNote, OrganizationSubscription, SubscriptionOverride, PlanChangeEvent, UsageSnapshot } from '@/lib/types';
import { apiRequest } from '@/lib/api/utils';

export interface GetOrganizationsResponse {
  data: Array<Organization & {
    contestCount: number;
    participantCount: number;
  }>;
  total: number;
  page: number;
  limit: number;
}

export async function getOrganizations(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  planId?: string;
} = {}): Promise<GetOrganizationsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.search) query.append('search', params.search);
  if (params.status) query.append('status', params.status);
  if (params.planId) query.append('planSlug', params.planId);

  const response = await apiRequest<{
    data: any[];
    total: number;
    page: number;
    limit: number;
  }>(`/api/v1/ops/organizations?${query.toString()}`);

  const data = response.data.map((item: any) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    status: item.status,
    planId: item.plan.slug,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
    memberCount: item.memberCount,
    membersCount: item.memberCount,
    contestCount: item.contestCount,
    participantCount: item.participantCount,
    ownerEmail: item.ownerEmail,
    ownerName: item.ownerEmail.split('@')[0],
    contactPerson: {
      name: item.ownerEmail.split('@')[0],
      email: item.ownerEmail,
      phone: '',
    },
    logoUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(item.name)}&backgroundColor=0d9488`,
    website: `https://${item.slug}.com`,
    notes: [],
  }));

  return {
    data,
    total: response.total,
    page: response.page,
    limit: response.limit,
  };
}

export async function getOrganizationNotes(orgId: string): Promise<SupportNote[]> {
  try {
    const notes = await apiRequest<any[]>(`/api/v1/ops/organizations/${orgId}/notes`);
    return notes.map(n => ({
      id: n.id,
      authorName: n.authorName,
      body: n.body,
      createdAt: n.createdAt,
      tags: n.tags || [],
    }));
  } catch {
    return [];
  }
}

export async function getOrganizationDetail(orgId: string): Promise<Organization | null> {
  try {
    const [raw, notes] = await Promise.all([
      apiRequest<any>(`/api/v1/ops/organizations/${orgId}`),
      getOrganizationNotes(orgId),
    ]);
    return {
      id: raw.id,
      name: raw.name,
      slug: raw.slug,
      status: raw.isDeleted ? 'DELETED' : raw.isActive ? 'ACTIVE' : 'SUSPENDED',
      planId: raw.plan.slug,
      createdAt: raw.createdAt,
      updatedAt: raw.createdAt,
      memberCount: raw.memberCount,
      membersCount: raw.memberCount,
      ownerEmail: raw.ownerEmail,
      ownerName: raw.ownerName,
      contactPerson: {
        name: raw.ownerName,
        email: raw.ownerEmail,
        phone: '',
      },
      logoUrl: raw.logoUrl,
      website: raw.website,
      suspendReason: raw.suspension?.reason,
      suspendedAt: raw.suspension?.suspendedAt,
      notes: notes,
    };
  } catch (err) {
    return null;
  }
}

export async function createOrganization(params: {
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  planId: string;
}): Promise<Organization> {
  throw new Error('Direct organization creation is handled via public tenant signup.');
}

export async function updateOrganization(
  orgId: string,
  params: {
    name: string;
    website: string;
    logoUrl: string;
    planId?: string;
  }
): Promise<Organization> {
  throw new Error('Organization details are managed by tenant owners.');
}

export async function suspendOrganization(orgId: string, reason: string): Promise<void> {
  await apiRequest(`/api/v1/ops/organizations/${orgId}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function activateOrganization(orgId: string): Promise<void> {
  await apiRequest(`/api/v1/ops/organizations/${orgId}/reactivate`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Suspension lifted by administrator' }),
  });
}

export async function deleteOrganization(orgId: string): Promise<void> {
  await suspendOrganization(orgId, 'Soft-deleted by platform operator');
}

export async function bulkSuspendOrganizations(orgIds: string[], reason: string): Promise<void> {
  for (const id of orgIds) {
    await suspendOrganization(id, reason);
  }
}

export async function addOrganizationNote(
  orgId: string,
  note: { authorName: string; body: string; tags: string[] }
): Promise<SupportNote> {
  const result = await apiRequest<any>(`/api/v1/ops/organizations/${orgId}/notes`, {
    method: 'POST',
    body: JSON.stringify({
      body: note.body,
      tags: note.tags,
    }),
  });

  return {
    id: result.id,
    authorName: result.authorName,
    body: result.body,
    createdAt: result.createdAt,
    tags: result.tags,
  };
}

export interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Viewer';
  joinedDate: string;
}

export async function getOrganizationMembers(orgId: string): Promise<OrgMember[]> {
  return apiRequest<OrgMember[]>(`/api/v1/ops/organizations/${orgId}/members`);
}

export async function getOrganizationParticipants(orgId: string, contestId?: string): Promise<Participant[]> {
  const rawList = await apiRequest<any[]>(`/api/v1/ops/organizations/${orgId}/participants`);
  return rawList.map((p) => ({
    id: p.id,
    organizationId: orgId,
    contestId: contestId || 'contest_1',
    registrationRef: p.registrationRef,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    phone: p.phone,
    status: p.status,
    registeredAt: p.registeredAt,
    paymentStatus: p.paymentStatus,
    paymentAmount: p.paymentAmount,
  }));
}

export interface OrgPayment {
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

export async function getOrganizationPayments(orgId: string): Promise<OrgPayment[]> {
  return apiRequest<OrgPayment[]>(`/api/v1/ops/organizations/${orgId}/payments`);
}

export async function getOrganizationContests(orgId: string): Promise<Contest[]> {
  const rawList = await apiRequest<any[]>(`/api/v1/ops/organizations/${orgId}/contests`);
  return rawList.map((c) => ({
    id: c.id,
    organizationId: orgId,
    orgId,
    title: c.title,
    slug: c.slug,
    description: '',
    status: c.status,
    startTime: c.startTime,
    scheduledAt: c.startTime,
    duration: c.duration,
    durationMinutes: c.duration,
    registrationDeadline: c.startTime,
    registrationFee: c.registrationFee,
    currency: 'INR',
    maxParticipants: 1000,
    participantCount: c.participantCount,
    revenueCollected: c.revenueCollected,
    createdAt: c.createdAt,
    updatedAt: c.createdAt,
  }));
}

export async function getOrganizationSubscription(orgId: string): Promise<OrganizationSubscription | null> {
  try {
    const res = await apiRequest<any>(`/api/v1/ops/organizations/${orgId}/subscription`);
    return {
      id: res.subscription.id,
      organizationId: res.subscription.organizationId,
      planId: res.plan.id || res.plan.slug,
      status: res.subscription.status.toLowerCase(),
      currentPeriodStart: res.subscription.currentPeriodStart,
      currentPeriodEnd: res.subscription.currentPeriodEnd,
      overrides: (res.overrides || []).map((o: any) => ({
        id: o.id,
        field: o.field,
        value: typeof o.value === 'string' ? JSON.parse(o.value) : o.value,
        reason: o.reason,
        expiresAt: o.expiresAt,
        createdAt: o.createdAt,
      })),
    };
  } catch (err) {
    return null;
  }
}

export async function assignInitialSubscriptionPlan(orgId: string, planId: string): Promise<OrganizationSubscription> {
  await apiRequest(`/api/v1/ops/organizations/${orgId}/subscription`, {
    method: 'POST',
    body: JSON.stringify({ planId }),
  });
  return getOrganizationSubscription(orgId) as Promise<OrganizationSubscription>;
}

export async function changeOrganizationPlan(orgId: string, planId: string, adminName: string): Promise<OrganizationSubscription> {
  await apiRequest(`/api/v1/ops/organizations/${orgId}/subscription/change-plan`, {
    method: 'POST',
    body: JSON.stringify({ planId }),
  });
  return getOrganizationSubscription(orgId) as Promise<OrganizationSubscription>;
}

export async function addSubscriptionOverride(
  orgId: string,
  override: Omit<SubscriptionOverride, 'id' | 'createdAt'>
): Promise<OrganizationSubscription> {
  await apiRequest(`/api/v1/ops/organizations/${orgId}/subscription/overrides`, {
    method: 'POST',
    body: JSON.stringify({
      field: override.field,
      value: override.value,
      reason: override.reason,
      expiresAt: override.expiresAt,
    }),
  });
  return getOrganizationSubscription(orgId) as Promise<OrganizationSubscription>;
}

export async function removeSubscriptionOverride(
  orgId: string,
  overrideId: string,
  reason: string,
  adminName: string
): Promise<OrganizationSubscription> {
  await apiRequest(`/api/v1/ops/organizations/${orgId}/subscription/overrides/${overrideId}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
  return getOrganizationSubscription(orgId) as Promise<OrganizationSubscription>;
}

export async function getPlanChangeHistory(orgId: string): Promise<PlanChangeEvent[]> {
  const sub = await apiRequest<any>(`/api/v1/ops/organizations/${orgId}/subscription`).catch(() => null);
  if (!sub || !sub.changeHistory) return [];
  return sub.changeHistory.map((c: any) => ({
    id: c.id,
    organizationId: orgId,
    fromPlanId: c.fromPlanId,
    toPlanId: c.toPlanId,
    date: c.changedAt,
    adminName: 'Platform Administrator',
  }));
}

export async function getUsageSnapshot(orgId: string, subscription: OrganizationSubscription): Promise<UsageSnapshot> {
  const contests = await getOrganizationContests(orgId);
  const members = await getOrganizationMembers(orgId);
  
  return {
    contestsUsedThisCycle: contests.length,
    participantsUsedThisCycle: contests.reduce((sum, c) => sum + (c.participantCount || 0), 0),
    memberCountUsed: members.length,
  };
}
