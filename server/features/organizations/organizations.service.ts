import { IOrganizationsRepository, OrganizationsRepository } from './organizations.repository';
import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { orgOwnerNotifier } from '../../notifications/org-owner-notifier';
import { AuditTargetType } from '@prisma/client';
import { orgLogoFallback } from '../../../lib/format';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../http/errors';
import { env } from '../../config/env';
import { RESERVED_ORG_SLUGS, slugify } from './org-slug';
import type { CreateOrgInput, UpdateOrgInput, OrgParticipantsQueryInput } from './organizations.validator';
import type { OrgListParams } from './organizations.repository';
import { OrgListMember, OrgProfileDetail, OrgMemberDetail, OrgContestDetail, OrgParticipantDetail, OrgPaymentDetail, SupportNoteDetail } from './organizations.types';

export interface IOrganizationsService {
  getOrganizationsList(params: OrgListParams): Promise<{ data: OrgListMember[]; total: number; page: number; limit: number }>;
  createOrganization(actor: AuditActor, input: CreateOrgInput): Promise<{ id: string; slug: string; createdAccount: boolean }>;
  updateOrganization(orgId: string, actor: AuditActor, input: UpdateOrgInput): Promise<void>;
  softDelete(orgId: string, actor: AuditActor, reason: string): Promise<void>;
  restore(orgId: string, actor: AuditActor, reason?: string): Promise<void>;
  getOrganizationDetail(orgId: string): Promise<OrgProfileDetail | null>;
  getNames(ids: string[]): Promise<Record<string, string>>;
  getMembers(orgId: string): Promise<OrgMemberDetail[]>;
  getContests(orgId: string): Promise<OrgContestDetail[]>;
  getParticipants(orgId: string, query: OrgParticipantsQueryInput): Promise<{ data: OrgParticipantDetail[]; total: number; page: number; limit: number }>;
  getPayments(orgId: string): Promise<OrgPaymentDetail[]>;
  getNotes(orgId: string): Promise<SupportNoteDetail[]>;
  addNote(orgId: string, actor: AuditActor, body: string, tags: string[]): Promise<SupportNoteDetail>;
  suspend(orgId: string, actor: AuditActor, reason: string): Promise<void>;
  reactivate(orgId: string, actor: AuditActor, reason?: string): Promise<void>;
  getUsage(orgId: string): Promise<{
    contestsUsedThisCycle: number;
    maxParticipantsInAContest: number;
    maxQuestionsInAContest: number;
    memberCountUsed: number;
    periodStart: string | null;
    periodEnd: string | null;
  }>;
}

export class OrganizationsService implements IOrganizationsService {
  constructor(private repo: IOrganizationsRepository = new OrganizationsRepository()) {}

  async getOrganizationsList(params: OrgListParams): Promise<{ data: OrgListMember[]; total: number; page: number; limit: number }> {
    const { rows, total } = await this.repo.getOrganizationsList(params);
    const orgIds = rows.map((r) => r.id);

    const subscriptions = await this.repo.getSubscriptionsForOrgs(orgIds);

    const subMap = new Map<string, typeof subscriptions[0]>();
    for (const sub of subscriptions) {
      subMap.set(sub.organizationId, sub);
    }

    const data: OrgListMember[] = rows.map((r) => {
      const sub = subMap.get(r.id);
      const planInfo = sub
        ? {
            slug: sub.plan.slug,
            name: sub.plan.name,
            status: sub.status,
            hasSubscription: true,
          }
        : {
            // Not a real subscription: the free default, flagged so the UI can say so.
            slug: 'starter',
            name: 'Starter (Free)',
            status: 'NONE',
            hasSubscription: false,
          };

      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        ownerName: r.ownerName,
        ownerEmail: r.ownerEmail,
        logoUrl: r.logoUrl || orgLogoFallback(r.name),
        features: r.features ?? [],
        memberCount: r.memberCount,
        contestCount: r.contestCount,
        participantCount: r.participantCount,
        status: r.isDeleted ? 'DELETED' : r.isActive ? 'ACTIVE' : 'SUSPENDED',
        plan: planInfo,
        createdAt: new Date(r.createdAt).toISOString(),
      };
    });

    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getOrganizationDetail(orgId: string): Promise<OrgProfileDetail | null> {
    // Deleted orgs stay viewable here (read-only dossier + Restore); every other method treats them as gone.
    const rawOrg = await this.repo.getOrganizationDetail(orgId, { includeDeleted: true });
    if (!rawOrg) return null;

    const sub = await this.repo.getSubscriptionForOrg(orgId);

    const planInfo = sub
      ? {
          slug: sub.plan.slug,
          name: sub.plan.name,
          status: sub.status,
          hasSubscription: true,
        }
      : {
          slug: 'starter',
          name: 'Starter (Free)',
          status: 'NONE',
          hasSubscription: false,
        };

    let suspensionInfo = null;
    if (!rawOrg.isActive) {
      const suspensions = await this.repo.getOrganizationSuspensions(orgId);
      const openSusp = suspensions.find((s) => s.liftedAt === null);
      if (openSusp) {
        const operator = await this.repo.getPlatformAdmin(openSusp.suspendedById);
        suspensionInfo = {
          reason: openSusp.reason,
          suspendedAt: openSusp.suspendedAt.toISOString(),
          suspendedBy: operator ? `${operator.firstName} ${operator.lastName || ''}`.trim() : 'System Operator',
        };
      }
    }

    return {
      id: rawOrg.id,
      name: rawOrg.name,
      slug: rawOrg.slug,
      logoUrl: rawOrg.logoUrl || orgLogoFallback(rawOrg.name),
      hasCustomLogo: !!rawOrg.logoUrl,
      isActive: rawOrg.isActive,
      isDeleted: rawOrg.isDeleted,
      createdAt: new Date(rawOrg.createdAt).toISOString(),
      ownerName: rawOrg.ownerName,
      ownerEmail: rawOrg.ownerEmail,
      memberCount: rawOrg.memberCount,
      contestCount: rawOrg.contestCount,
      participantCount: rawOrg.participantCount,
      onboardingStep: rawOrg.onboardingStep,
      onboardingCompleted: rawOrg.onboardingCompleted,
      plan: planInfo,
      suspension: suspensionInfo,
    };
  }

  async getNames(ids: string[]) {
    return this.repo.getOrganizationNames([...new Set(ids)]);
  }

  async getMembers(orgId: string): Promise<OrgMemberDetail[]> {
    return this.repo.getOrganizationMembers(orgId);
  }

  async getContests(orgId: string): Promise<OrgContestDetail[]> {
    return this.repo.getOrganizationContests(orgId);
  }

  async getUsage(orgId: string): Promise<{
    contestsUsedThisCycle: number;
    maxParticipantsInAContest: number;
    maxQuestionsInAContest: number;
    memberCountUsed: number;
    periodStart: string | null;
    periodEnd: string | null;
  }> {
    const sub = await this.repo.getSubscriptionForOrg(orgId);

    // No subscription synced yet — nothing meaningfully "used this cycle"
    // to report; fall back to an all-time window so the numbers are at
    // least not wrong, just not cycle-scoped.
    const periodStart: Date = sub?.currentPeriodStart ?? new Date(0);
    const periodEnd: Date = sub?.currentPeriodEnd ?? new Date(8640000000000000);

    const usage = await this.repo.getUsageSnapshot(orgId, periodStart, periodEnd);

    return {
      ...usage,
      periodStart: sub?.currentPeriodStart ? sub.currentPeriodStart.toISOString() : null,
      periodEnd: sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    };
  }

  async getParticipants(orgId: string, query: OrgParticipantsQueryInput) {
    const { rows, total } = await this.repo.getOrganizationParticipants(orgId, query);
    return { data: rows, total, page: query.page, limit: query.limit };
  }

  async getPayments(orgId: string): Promise<OrgPaymentDetail[]> {
    return this.repo.getOrganizationPayments(orgId);
  }

  async getNotes(orgId: string): Promise<SupportNoteDetail[]> {
    const notes = await this.repo.getOrganizationNotes(orgId);
    return notes.map((n) => ({
      id: n.id,
      organizationId: n.organizationId,
      authorId: n.authorId,
      authorName: `${n.author.firstName} ${n.author.lastName || ''}`.trim(),
      body: n.body,
      tags: n.tags,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async addNote(orgId: string, actor: AuditActor, body: string, tags: string[]): Promise<SupportNoteDetail> {
    const rawOrg = await this.repo.getOrganizationDetail(orgId);
    if (!rawOrg) throw new NotFoundError('Organization not found');

    const note = await this.repo.createOrganizationNote(orgId, actor.id!, body, tags);

    await writeAuditLogEntry(
      actor,
      'org.note_added',
      AuditTargetType.ORGANIZATION,
      orgId,
      rawOrg.name,
      { noteId: note.id, tags, body }
    );

    return {
      id: note.id,
      organizationId: note.organizationId,
      authorId: note.authorId,
      authorName: `${actor.name}`,
      body: note.body,
      tags: note.tags,
      createdAt: note.createdAt.toISOString(),
    };
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'organization';
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt}`;
      if (RESERVED_ORG_SLUGS.has(candidate)) continue;
      if (!(await this.repo.isSlugTaken(candidate))) return candidate;
    }
    throw new ConflictError('Could not generate a unique slug; please enter one');
  }

  async createOrganization(actor: AuditActor, input: CreateOrgInput) {
    const slug = input.slug ?? (await this.uniqueSlug(input.name));
    if (RESERVED_ORG_SLUGS.has(slug)) throw new ValidationError({ slug: { _errors: [`"${slug}" is reserved`] } });
    if (await this.repo.isSlugTaken(slug)) throw new ConflictError(`The slug "${slug}" is already taken`);

    const [firstName, ...rest] = input.ownerName.split(/\s+/);
    let created;
    try {
      created = await this.repo.createOrganizationWithOwner({
        name: input.name,
        slug,
        ownerFirstName: firstName,
        ownerLastName: rest.join(' '),
        ownerEmail: input.ownerEmail,
      });
    } catch (err: any) {
      if (err?.code === '23505') throw new ConflictError('An organization or account with these details already exists');
      throw new AppError(err?.message || 'Could not create organization', 'ORG_CREATE_FAILED', 400);
    }

    await writeAuditLogEntry(actor, 'org.created', AuditTargetType.ORGANIZATION, created.organizationId, input.name, {
      slug,
      ownerEmail: input.ownerEmail,
      createdOwnerAccount: created.createdAdmin,
      planId: input.planId ?? null,
    });

    const frontend = env.MAIN_APP_FRONTEND_URL.replace(/\/$/, '');
    await orgOwnerNotifier.notify(created.organizationId, 'ORG_CREATED', {
      organizationName: input.name,
      ownerEmail: input.ownerEmail,
      newAccount: created.createdAdmin,
      loginUrl: `${frontend}/login`,
      forgotPasswordUrl: `${frontend}/forgot-password`,
    });

    return { id: created.organizationId, slug, createdAccount: created.createdAdmin };
  }

  async updateOrganization(orgId: string, actor: AuditActor, input: UpdateOrgInput) {
    const org = await this.repo.getOrganizationDetail(orgId);
    if (!org) throw new NotFoundError('Organization not found');

    const fields: { name?: string; logoUrl?: string | null } = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.logoUrl !== undefined) fields.logoUrl = input.logoUrl === '' ? null : input.logoUrl;

    await this.repo.updateMainDbOrganization(orgId, fields);

    await writeAuditLogEntry(actor, 'org.updated', AuditTargetType.ORGANIZATION, orgId, fields.name ?? org.name, {
      before: { name: org.name, logoUrl: org.logoUrl ?? null },
      after: fields,
    });
  }

  /**
   * Soft delete: the organization disappears from every list, its admins can no longer sign in
   * or act, and its public pages go dark — but no row is removed, so it can be restored.
   * Unlike suspend, the owner is NOT emailed (operator decision).
   */
  async softDelete(orgId: string, actor: AuditActor, reason: string) {
    const org = await this.repo.getOrganizationDetail(orgId, { includeDeleted: true });
    if (!org) throw new NotFoundError('Organization not found');
    if (org.isDeleted) throw new ConflictError('Organization is already deleted');

    await this.repo.setMainDbOrganizationDeleted(orgId, true, false);

    await writeAuditLogEntry(actor, 'org.deleted', AuditTargetType.ORGANIZATION, orgId, org.name, {
      reason,
      wasSuspended: !org.isActive,
    });
  }

  /** Undo a soft delete. The org returns to Suspended if it had an open suspension, else Active. No email. */
  async restore(orgId: string, actor: AuditActor, reason?: string) {
    const org = await this.repo.getOrganizationDetail(orgId, { includeDeleted: true });
    if (!org) throw new NotFoundError('Organization not found');
    if (!org.isDeleted) throw new ConflictError('Organization is not deleted');

    const stillSuspended = await this.repo.hasOpenSuspension(orgId);
    await this.repo.setMainDbOrganizationDeleted(orgId, false, !stillSuspended);

    await writeAuditLogEntry(actor, 'org.restored', AuditTargetType.ORGANIZATION, orgId, org.name, {
      reason: reason ?? null,
      restoredTo: stillSuspended ? 'SUSPENDED' : 'ACTIVE',
    });
  }

  async suspend(orgId: string, actor: AuditActor, reason: string): Promise<void> {
    const rawOrg = await this.repo.getOrganizationDetail(orgId);
    if (!rawOrg) throw new NotFoundError('Organization not found');
    if (!rawOrg.isActive) throw new ConflictError('Organization is already suspended');

    await this.repo.updateMainDbOrganizationStatus(orgId, false);
    await this.repo.createOrganizationSuspension(orgId, reason, actor.id!);

    await writeAuditLogEntry(
      actor,
      'org.suspended',
      AuditTargetType.ORGANIZATION,
      orgId,
      rawOrg.name,
      { reason }
    );

    await orgOwnerNotifier.notify(orgId, 'ORG_SUSPENDED', { reason });
  }

  async reactivate(orgId: string, actor: AuditActor, reason?: string): Promise<void> {
    const rawOrg = await this.repo.getOrganizationDetail(orgId);
    if (!rawOrg) throw new NotFoundError('Organization not found');
    if (rawOrg.isActive) throw new ConflictError('Organization is already active');

    await this.repo.updateMainDbOrganizationStatus(orgId, true);
    await this.repo.closeOrganizationSuspension(orgId, actor.id!, reason);

    await writeAuditLogEntry(
      actor,
      'org.reactivated',
      AuditTargetType.ORGANIZATION,
      orgId,
      rawOrg.name,
      { reason: reason || 'Suspension lifted' }
    );

    await orgOwnerNotifier.notify(orgId, 'ORG_REACTIVATED', {});
  }
}

export default OrganizationsService;
