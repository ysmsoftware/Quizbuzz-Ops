import { prisma } from '../../db/ops-prisma';
import { OpsMessageChannel, OpsMessageStatus, OpsMessageTemplate } from '@prisma/client';
import { generateUlid } from '../../utils/ulid';

export interface CreateMessageLogData {
  organizationId: string;
  channel: OpsMessageChannel;
  template: OpsMessageTemplate;
  recipient: string;
  subject?: string | null;
  params?: any;
  status: OpsMessageStatus;
}

/**
 * Repository — DB access only, no business logic (per this repo's
 * routing/controller/service/repository convention). The one piece of
 * logic that lives here rather than in the service is the status state
 * machine, because it's a data-integrity constraint on this exact table,
 * not a business rule — it belongs next to the writes it protects.
 */
export interface MessageListFilters {
  organizationId?: string;
  status?: OpsMessageStatus;
  channel?: OpsMessageChannel;
  template?: OpsMessageTemplate;
  /** Case-insensitive match against recipient or subject. */
  search?: string;
}

export interface IMessagingRepository {
  create(data: CreateMessageLogData): Promise<any>;
  findById(id: string, organizationId?: string): Promise<any | null>;
  findByOrganization(organizationId: string, skip: number, take: number): Promise<any[]>;
  countByOrganization(organizationId: string): Promise<number>;
  findFailed(organizationId: string): Promise<any[]>;
  findAll(filters: MessageListFilters, skip: number, take: number): Promise<any[]>;
  countAll(filters: MessageListFilters): Promise<number>;
  updateStatus(id: string, toStatus: OpsMessageStatus, additionalData?: Record<string, any>): Promise<any | null>;
  incrementAttempt(id: string): Promise<void>;
}

const STATUS_ORDER: Record<string, number> = {
  QUEUED: 0,
  PROCESSING: 1,
  SENT: 2,
  DELIVERED: 3,
  FAILED: 2,
};

export class MessagingRepository implements IMessagingRepository {
  async create(data: CreateMessageLogData) {
    return prisma.opsMessageLog.create({
      data: { id: generateUlid(), ...data },
    });
  }

  async findById(id: string, organizationId?: string) {
    return prisma.opsMessageLog.findFirst({
      where: { id, ...(organizationId && { organizationId }) },
    });
  }

  async findByOrganization(organizationId: string, skip: number, take: number) {
    return prisma.opsMessageLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async countByOrganization(organizationId: string) {
    return prisma.opsMessageLog.count({ where: { organizationId } });
  }

  async findFailed(organizationId: string) {
    return prisma.opsMessageLog.findMany({ where: { status: 'FAILED', organizationId } });
  }

  /**
   * Platform-wide message log — backs the centralized Messaging dashboard
   * page. Unlike findByOrganization, this is not scoped to a single tenant;
   * `filters.organizationId` narrows it down when the caller wants that.
   */
  async findAll(filters: MessageListFilters, skip: number, take: number) {
    return prisma.opsMessageLog.findMany({
      where: buildWhere(filters),
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async countAll(filters: MessageListFilters) {
    return prisma.opsMessageLog.count({ where: buildWhere(filters) });
  }

  /**
   * Forward-only state transitions: QUEUED -> PROCESSING -> SENT/DELIVERED,
   * with FAILED -> QUEUED allowed explicitly as a retry, and a same-state
   * write treated as a no-op (BullMQ can redeliver a stalled job and hit
   * this twice). Prevents a delayed/duplicate worker tick from reverting an
   * already-SENT message back to PROCESSING.
   */
  async updateStatus(id: string, toStatus: OpsMessageStatus, additionalData: Record<string, any> = {}) {
    const current = await prisma.opsMessageLog.findFirst({ where: { id }, select: { status: true } });
    if (!current) return null;

    const currentOrder = STATUS_ORDER[current.status] ?? -1;
    const targetOrder = STATUS_ORDER[toStatus] ?? -1;

    if (toStatus === 'QUEUED') {
      if (current.status !== 'FAILED') {
        throw new Error(`Cannot reset status to QUEUED unless it is FAILED. Current status: ${current.status}`);
      }
    } else if (current.status === 'FAILED' && toStatus === 'PROCESSING') {
      // BullMQ retry re-enters PROCESSING directly without cycling through QUEUED first — valid.
    } else if (toStatus === current.status) {
      return this.findById(id); // no-op — stalled/duplicate job delivery
    } else if (targetOrder < currentOrder) {
      throw new Error(`Invalid state transition: ${current.status} -> ${toStatus}`);
    }

    await prisma.opsMessageLog.updateMany({
      where: { id },
      data: { status: toStatus, ...additionalData, updatedAt: new Date() },
    });

    return this.findById(id);
  }

  async incrementAttempt(id: string) {
    await prisma.opsMessageLog.update({
      where: { id },
      data: { attemptCount: { increment: 1 } },
    });
  }
}

function buildWhere(filters: MessageListFilters) {
  const where: Record<string, any> = {};
  if (filters.organizationId) where.organizationId = filters.organizationId;
  if (filters.status) where.status = filters.status;
  if (filters.channel) where.channel = filters.channel;
  if (filters.template) where.template = filters.template;
  if (filters.search) {
    where.OR = [
      { recipient: { contains: filters.search, mode: 'insensitive' } },
      { subject: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  return where;
}
