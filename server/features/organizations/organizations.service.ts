import { OrganizationsRepository } from './organizations.repository';
import { prisma } from '../../db/ops-prisma';
import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import { OrgListMember, OrgProfileDetail, OrgMemberDetail, OrgContestDetail, OrgParticipantDetail, OrgPaymentDetail, SupportNoteDetail } from './organizations.types';

export class OrganizationsService {
  private repo = new OrganizationsRepository();

  async getOrganizationsList(params: {
    page: number;
    limit: number;
    search?: string;
    status: 'all' | 'active' | 'suspended' | 'deleted';
  }): Promise<{ data: OrgListMember[]; total: number; page: number; limit: number }> {
    const { rows, total } = await this.repo.getOrganizationsList(params);
    const orgIds = rows.map((r) => r.id);

    // Pull plans and subscriptions from ops DB to merge in-memory
    const subscriptions = await prisma.organizationSubscription.findMany({
      where: { organizationId: { in: orgIds } },
      include: { plan: true },
    });

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
          }
        : {
            slug: 'starter',
            name: 'Starter (Free)',
            status: 'ACTIVE',
          };

      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        ownerEmail: r.ownerEmail,
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
    const rawOrg = await this.repo.getOrganizationDetail(orgId);
    if (!rawOrg) return null;

    const sub = await prisma.organizationSubscription.findUnique({
      where: { organizationId: orgId },
      include: { plan: true },
    });

    const planInfo = sub
      ? {
          slug: sub.plan.slug,
          name: sub.plan.name,
          status: sub.status,
        }
      : {
          slug: 'starter',
          name: 'Starter (Free)',
          status: 'ACTIVE',
        };

    let suspensionInfo = null;
    if (!rawOrg.isActive) {
      const suspensions = await this.repo.getOrganizationSuspensions(orgId);
      const openSusp = suspensions.find((s) => s.liftedAt === null);
      if (openSusp) {
        const operator = await prisma.platformAdmin.findUnique({
          where: { id: openSusp.suspendedById },
        });
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
      logoUrl: rawOrg.logoUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(rawOrg.name)}&backgroundColor=0d9488`,
      website: rawOrg.website || `https://${rawOrg.slug}.com`,
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

  async getMembers(orgId: string): Promise<OrgMemberDetail[]> {
    return this.repo.getOrganizationMembers(orgId);
  }

  async getContests(orgId: string): Promise<OrgContestDetail[]> {
    return this.repo.getOrganizationContests(orgId);
  }

  async getParticipants(orgId: string): Promise<OrgParticipantDetail[]> {
    return this.repo.getOrganizationParticipants(orgId);
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
    if (!rawOrg) throw new Error('Organization not found');

    const note = await this.repo.createOrganizationNote(orgId, actor.id!, body, tags);

    // Audit logs for support additions
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

  async suspend(orgId: string, actor: AuditActor, reason: string): Promise<void> {
    const rawOrg = await this.repo.getOrganizationDetail(orgId);
    if (!rawOrg) throw new Error('Organization not found');
    if (!rawOrg.isActive) throw new Error('Organization is already suspended');

    // 1. Enforce on Main DB first (commit state check)
    await this.repo.updateMainDbOrganizationStatus(orgId, false);

    // 2. Track audit detail local DB
    await this.repo.createOrganizationSuspension(orgId, reason, actor.id!);

    // 3. Log Audit details
    await writeAuditLogEntry(
      actor,
      'org.suspended',
      AuditTargetType.ORGANIZATION,
      orgId,
      rawOrg.name,
      { reason }
    );
  }

  async reactivate(orgId: string, actor: AuditActor, reason?: string): Promise<void> {
    const rawOrg = await this.repo.getOrganizationDetail(orgId);
    if (!rawOrg) throw new Error('Organization not found');
    if (rawOrg.isActive) throw new Error('Organization is already active');

    // 1. Commit main DB state first
    await this.repo.updateMainDbOrganizationStatus(orgId, true);

    // 2. Lift suspension local DB
    await this.repo.closeOrganizationSuspension(orgId, actor.id!, reason);

    // 3. Log Audit details
    await writeAuditLogEntry(
      actor,
      'org.reactivated',
      AuditTargetType.ORGANIZATION,
      orgId,
      rawOrg.name,
      { reason: reason || 'Suspension lifted' }
    );
  }
}
export default OrganizationsService;
