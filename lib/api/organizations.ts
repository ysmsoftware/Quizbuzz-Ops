'use client';

import { Organization, Contest, OrgStatus, Participant, SupportNote, OrganizationSubscription, SubscriptionOverride, PlanChangeEvent, UsageSnapshot } from '@/lib/types';
import { getDatabase, saveDatabase } from '@/lib/data/db';
import { simulateLatency } from '@/lib/api/utils';
import { getCurrentSessionSync } from '@/lib/api/auth';
import { writeAuditLogEntry } from '@/lib/api/auditLog';

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
  await simulateLatency(300, 600);
  const db = getDatabase();
  
  // Filter out deleted by default
  let orgs = db.organizations.filter(o => o.status !== 'DELETED');

  const search = params.search?.toLowerCase().trim();
  if (search) {
    orgs = orgs.filter(
      (org) =>
        org.name.toLowerCase().includes(search) ||
        org.slug.toLowerCase().includes(search) ||
        org.ownerEmail.toLowerCase().includes(search) ||
        org.ownerName.toLowerCase().includes(search)
    );
  }

  if (params.status && params.status !== 'all') {
    orgs = orgs.filter((org) => org.status === params.status);
  }

  if (params.planId && params.planId !== 'all') {
    orgs = orgs.filter((org) => org.planId === params.planId);
  }

  // Pre-compute contest and participant counts for list performance
  const enrichedOrgs = orgs.map(org => {
    const orgContests = db.contests.filter(c => c.organizationId === org.id || c.orgId === org.id);
    const contestCount = orgContests.length;
    
    // Sum participantCount from contests + check actual participants size
    const participantCount = orgContests.reduce((sum, c) => sum + (c.participantCount || 0), 0);

    return {
      ...org,
      contestCount,
      participantCount
    };
  });

  const page = params.page || 1;
  const limit = params.limit || 10;
  const total = enrichedOrgs.length;
  const startIndex = (page - 1) * limit;
  const data = enrichedOrgs.slice(startIndex, startIndex + limit);

  return {
    data,
    total,
    page,
    limit,
  };
}

export async function getOrganizationDetail(orgId: string): Promise<Organization | null> {
  await simulateLatency(250, 400);
  const db = getDatabase();
  return db.organizations.find((org) => org.id === orgId && org.status !== 'DELETED') || null;
}

export async function createOrganization(params: {
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  planId: string;
}): Promise<Organization> {
  await simulateLatency(400, 600);
  const db = getDatabase();

  // Validate unique slug
  const exists = db.organizations.some(o => o.slug.toLowerCase() === params.slug.toLowerCase());
  if (exists) {
    throw new Error(`The slug "${params.slug}" is already taken by another organization.`);
  }

  const newOrg: Organization = {
    id: `org_${Date.now()}`,
    name: params.name,
    slug: params.slug.toLowerCase().replace(/\s+/g, '-'),
    status: 'ACTIVE',
    planId: params.planId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    membersCount: 1,
    memberCount: 1,
    contactPerson: {
      name: params.ownerName,
      email: params.ownerEmail,
      phone: '+91 99999 99999'
    },
    ownerName: params.ownerName,
    ownerEmail: params.ownerEmail,
    logoUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(params.name)}&backgroundColor=0d9488`,
    website: `https://${params.slug}.com`,
    notes: [
      {
        id: `note_${Date.now()}`,
        authorName: 'System Bot',
        body: `Organization provisioned on ${params.planId} plan.`,
        createdAt: new Date().toISOString(),
        tags: ['Provisioning']
      }
    ]
  };

  db.organizations.unshift(newOrg);

  // Append Audit Log
  writeAuditLogEntry('org.created', 'organization', newOrg.id, newOrg.name, { slug: newOrg.slug, planId: newOrg.planId });

  saveDatabase(db);
  return newOrg;
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
  await simulateLatency(300, 500);
  const db = getDatabase();
  const orgIndex = db.organizations.findIndex(o => o.id === orgId);

  if (orgIndex === -1) {
    throw new Error('Organization not found');
  }

  const oldOrg = db.organizations[orgIndex];
  const updatedOrg: Organization = {
    ...oldOrg,
    name: params.name,
    website: params.website,
    logoUrl: params.logoUrl,
    planId: params.planId || oldOrg.planId,
    updatedAt: new Date().toISOString()
  };

  db.organizations[orgIndex] = updatedOrg;

  writeAuditLogEntry('org.edited', 'organization', orgId, updatedOrg.name, { updates: params });

  saveDatabase(db);
  return updatedOrg;
}

export async function suspendOrganization(orgId: string, reason: string): Promise<Organization> {
  await simulateLatency(300, 500);
  const db = getDatabase();
  const orgIndex = db.organizations.findIndex((org) => org.id === orgId);
  
  if (orgIndex === -1) {
    throw new Error('Organization not found');
  }

  const org = db.organizations[orgIndex];
  const updatedOrg: Organization = {
    ...org,
    status: 'SUSPENDED',
    suspendReason: reason,
    suspendedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.organizations[orgIndex] = updatedOrg;

  writeAuditLogEntry('org.suspended', 'organization', orgId, org.name, { reason });

  saveDatabase(db);
  return updatedOrg;
}

export async function activateOrganization(orgId: string): Promise<Organization> {
  await simulateLatency(300, 500);
  const db = getDatabase();
  const orgIndex = db.organizations.findIndex((org) => org.id === orgId);
  
  if (orgIndex === -1) {
    throw new Error('Organization not found');
  }

  const org = db.organizations[orgIndex];
  const updatedOrg: Organization = {
    ...org,
    status: 'ACTIVE',
    updatedAt: new Date().toISOString()
  };
  delete updatedOrg.suspendReason;
  delete updatedOrg.suspendedAt;

  db.organizations[orgIndex] = updatedOrg;

  writeAuditLogEntry('org.activated', 'organization', orgId, org.name, {});

  saveDatabase(db);
  return updatedOrg;
}

export async function deleteOrganization(orgId: string): Promise<void> {
  await simulateLatency(400, 600);
  const db = getDatabase();
  const orgIndex = db.organizations.findIndex(o => o.id === orgId);

  if (orgIndex === -1) {
    throw new Error('Organization not found');
  }

  const org = db.organizations[orgIndex];
  org.status = 'DELETED';
  org.updatedAt = new Date().toISOString();

  writeAuditLogEntry('org.deleted', 'organization', orgId, org.name, {});

  saveDatabase(db);
}

export async function bulkSuspendOrganizations(orgIds: string[], reason: string): Promise<void> {
  await simulateLatency(400, 700);
  const db = getDatabase();
  const session = getCurrentSessionSync();

  orgIds.forEach(orgId => {
    const idx = db.organizations.findIndex(o => o.id === orgId);
    if (idx !== -1) {
      db.organizations[idx] = {
        ...db.organizations[idx],
        status: 'SUSPENDED',
        suspendReason: reason,
        suspendedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.auditLogs.unshift({
        id: `log_${Date.now()}_${orgId}`,
        actorAdminName: session?.name || 'System Operator',
        actorAdminRole: session?.role || 'SUPER_ADMIN',
        action: 'org.suspended',
        targetType: 'organization',
        targetId: orgId,
        targetLabel: db.organizations[idx].name,
        metadata: { reason, isBulk: true },
        createdAt: new Date().toISOString(),
      });
    }
  });

  saveDatabase(db);
}

export async function addOrganizationNote(
  orgId: string,
  note: { authorName: string; body: string; tags: string[] }
): Promise<SupportNote> {
  await simulateLatency(300, 500);
  const db = getDatabase();
  const orgIdx = db.organizations.findIndex(o => o.id === orgId);

  if (orgIdx === -1) {
    throw new Error('Organization not found');
  }

  const newNote: SupportNote = {
    id: `note_${Date.now()}`,
    authorName: note.authorName,
    body: note.body,
    createdAt: new Date().toISOString(),
    tags: note.tags
  };

  if (!db.organizations[orgIdx].notes) {
    db.organizations[orgIdx].notes = [];
  }
  db.organizations[orgIdx].notes.unshift(newNote);
  db.organizations[orgIdx].updatedAt = new Date().toISOString();

  writeAuditLogEntry('org.note_added', 'organization', orgId, db.organizations[orgIdx].name, {
    noteId: newNote.id,
    tags: newNote.tags,
    body: newNote.body
  });

  saveDatabase(db);
  return newNote;
}

export interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Viewer';
  joinedDate: string;
}

export async function getOrganizationMembers(orgId: string): Promise<OrgMember[]> {
  await simulateLatency(200, 350);
  const db = getDatabase();
  const org = db.organizations.find(o => o.id === orgId);
  if (!org) return [];

  const members: OrgMember[] = [
    {
      id: `member_owner_${orgId}`,
      name: org.ownerName || org.contactPerson.name,
      email: org.ownerEmail || org.contactPerson.email,
      role: 'Owner',
      joinedDate: org.createdAt
    }
  ];

  const adminNames = ['Rajiv Bajaj', 'Nisha Sen', 'Preeti Nair', 'Karan Johar', 'Arun Jaitley', 'Sonal Mansingh'];
  const viewerNames = ['Varun Dhawan', 'Alia Bhatt', 'Sid Malhotra', 'Sanjay Dutt', 'Rishi Kapoor'];

  const count = org.memberCount || org.membersCount || 1;
  for (let i = 1; i < count; i++) {
    const isViewer = i % 3 === 0;
    const name = isViewer 
      ? viewerNames[i % viewerNames.length] 
      : adminNames[i % adminNames.length];
    
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@${org.slug}.com`;
    const joined = new Date(new Date(org.createdAt).getTime() + i * 2 * 24 * 3600 * 1000).toISOString();

    members.push({
      id: `member_${orgId}_${i}`,
      name,
      email,
      role: isViewer ? 'Viewer' : 'Admin',
      joinedDate: joined
    });
  }

  return members;
}

export async function getOrganizationParticipants(orgId: string, contestId?: string): Promise<Participant[]> {
  await simulateLatency(250, 450);
  const db = getDatabase();
  let parts = db.participants.filter(p => p.organizationId === orgId);
  if (contestId && contestId !== 'all') {
    parts = parts.filter(p => p.contestId === contestId);
  }
  return parts.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());
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
  await simulateLatency(250, 450);
  const db = getDatabase();

  const payments: OrgPayment[] = [];

  // Subscription Billing
  const subs = db.billing.filter(b => b.orgId === orgId);
  subs.forEach(s => {
    payments.push({
      id: `pay_sub_${s.id}`,
      source: 'subscription',
      referenceId: s.transactionId,
      payeeName: 'Primary Card',
      description: `Subscription renewal (${s.planId.replace('plan_', '')})`,
      amount: s.amountINR,
      status: s.status === 'PAID' ? 'PAID' : s.status === 'PENDING' ? 'PENDING' : 'FAILED',
      paymentMethod: 'Credit Card',
      date: s.paymentDate
    });
  });

  // Participant registrations for paid quizzes
  const orgContests = db.contests.filter(c => (c.organizationId === orgId || c.orgId === orgId) && c.registrationFee > 0);
  const contestIds = orgContests.map(c => c.id);
  const parts = db.participants.filter(p => contestIds.includes(p.contestId));

  parts.forEach(p => {
    const contest = orgContests.find(c => c.id === p.contestId);
    if (contest) {
      payments.push({
        id: `pay_part_${p.id}`,
        source: 'contest_fee',
        referenceId: `TXN_PART_${p.id.toUpperCase()}`,
        payeeName: `${p.firstName} ${p.lastName}`,
        description: `Quiz Entry Fee: ${contest.title}`,
        amount: contest.registrationFee,
        status: p.paymentStatus,
        paymentMethod: p.id.charCodeAt(0) % 2 === 0 ? 'UPI (PhonePe)' : 'Net Banking (HDFC)',
        date: p.registeredAt
      });
    }
  });

  return payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getOrganizationContests(orgId: string): Promise<Contest[]> {
  await simulateLatency(200, 350);
  const db = getDatabase();
  return db.contests.filter(c => c.organizationId === orgId || c.orgId === orgId);
}

export async function getOrganizationSubscription(orgId: string): Promise<OrganizationSubscription | null> {
  await simulateLatency(100, 250);
  const db = getDatabase();
  let sub = db.subscriptions.find(s => s.organizationId === orgId);
  if (!sub) {
    const org = db.organizations.find(o => o.id === orgId);
    if (!org) return null;
    sub = {
      id: `sub_${orgId}_${Date.now()}`,
      organizationId: orgId,
      planId: org.planId || 'plan_free',
      status: 'active',
      currentPeriodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 15).toISOString(),
      currentPeriodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 15).toISOString(),
      overrides: []
    };
    db.subscriptions.push(sub);
    saveDatabase(db);
  }
  return sub;
}

export async function changeOrganizationPlan(orgId: string, planId: string, adminName: string): Promise<OrganizationSubscription> {
  await simulateLatency(250, 400);
  const db = getDatabase();
  const subIndex = db.subscriptions.findIndex(s => s.organizationId === orgId);
  const orgIndex = db.organizations.findIndex(o => o.id === orgId);
  
  if (orgIndex === -1) {
    throw new Error('Organization not found');
  }
  
  const org = db.organizations[orgIndex];
  const oldPlanId = org.planId;
  org.planId = planId;
  org.updatedAt = new Date().toISOString();
  
  let sub: OrganizationSubscription;
  if (subIndex === -1) {
    sub = {
      id: `sub_${orgId}_${Date.now()}`,
      organizationId: orgId,
      planId: planId,
      status: 'active',
      currentPeriodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 15).toISOString(),
      currentPeriodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 15).toISOString(),
      overrides: []
    };
    db.subscriptions.push(sub);
  } else {
    sub = db.subscriptions[subIndex];
    sub.planId = planId;
    db.subscriptions[subIndex] = sub;
  }
  
  // Record plan change history
  db.planChangeHistory.unshift({
    id: `pch_${Date.now()}`,
    organizationId: orgId,
    fromPlanId: oldPlanId,
    toPlanId: planId,
    date: new Date().toISOString(),
    adminName: adminName || 'Super Admin'
  });
  
  // Audit log
  writeAuditLogEntry('org.plan_changed', 'organization', orgId, org.name, {
    oldPlanId,
    newPlanId: planId,
    adminName
  });
  
  saveDatabase(db);
  return sub;
}

export async function addSubscriptionOverride(
  orgId: string,
  override: Omit<SubscriptionOverride, 'id' | 'createdAt'>
): Promise<OrganizationSubscription> {
  await simulateLatency(200, 350);
  const db = getDatabase();
  const subIndex = db.subscriptions.findIndex(s => s.organizationId === orgId);
  
  if (subIndex === -1) {
    throw new Error('Subscription not found for this organization');
  }
  
  const sub = db.subscriptions[subIndex];
  const newOverride: SubscriptionOverride = {
    ...override,
    id: `ov_${Date.now()}`,
    createdAt: new Date().toISOString()
  };
  
  sub.overrides.push(newOverride);
  db.subscriptions[subIndex] = sub;
  
  // Audit log
  const org = db.organizations.find(o => o.id === orgId);
  writeAuditLogEntry('override.added', 'organization', orgId, org?.name || orgId, {
    field: override.field,
    value: override.value,
    reason: override.reason
  });
  
  saveDatabase(db);
  return sub;
}

export async function removeSubscriptionOverride(
  orgId: string,
  overrideId: string,
  reason: string,
  adminName: string
): Promise<OrganizationSubscription> {
  await simulateLatency(200, 350);
  const db = getDatabase();
  const subIndex = db.subscriptions.findIndex(s => s.organizationId === orgId);
  
  if (subIndex === -1) {
    throw new Error('Subscription not found for this organization');
  }
  
  const sub = db.subscriptions[subIndex];
  const override = sub.overrides.find(o => o.id === overrideId);
  sub.overrides = sub.overrides.filter(o => o.id !== overrideId);
  db.subscriptions[subIndex] = sub;
  
  // Audit log
  const org = db.organizations.find(o => o.id === orgId);
  writeAuditLogEntry('override.removed', 'organization', orgId, org?.name || orgId, {
    overrideId,
    field: override?.field,
    reason
  });
  
  saveDatabase(db);
  return sub;
}

export async function getPlanChangeHistory(orgId: string): Promise<PlanChangeEvent[]> {
  await simulateLatency(100, 200);
  const db = getDatabase();
  return db.planChangeHistory.filter(h => h.organizationId === orgId);
}

export async function getUsageSnapshot(orgId: string, subscription: OrganizationSubscription): Promise<UsageSnapshot> {
  await simulateLatency(100, 200);
  const db = getDatabase();
  
  const start = new Date(subscription.currentPeriodStart).getTime();
  const end = new Date(subscription.currentPeriodEnd).getTime();
  
  const orgContests = db.contests.filter(c => {
    if (c.organizationId !== orgId && c.orgId !== orgId) return false;
    const time = new Date(c.startTime || c.createdAt).getTime();
    return time >= start && time <= end;
  });
  
  const contestsUsedThisCycle = orgContests.length;
  
  let participantsUsedThisCycle = 0;
  for (const c of orgContests) {
    const actualParts = db.participants.filter(p => p.contestId === c.id).length;
    participantsUsedThisCycle += Math.max(c.participantCount || 0, actualParts);
  }
  
  const org = db.organizations.find(o => o.id === orgId);
  const memberCountUsed = org ? (org.memberCount || org.membersCount || 1) : 1;
  
  return {
    contestsUsedThisCycle,
    participantsUsedThisCycle,
    memberCountUsed
  };
}
