import { prisma } from '../db/ops-prisma';
import { AuditTargetType } from '@prisma/client';
import { generateUlid } from '../utils/ulid';

export interface AuditActor {
  id?: string | null;
  email: string;
  name: string;
  role: string;
}

export const SYSTEM_ACTOR: AuditActor = {
  id: null,
  email: 'system@quizbuzz.ops',
  name: 'SYSTEM',
  role: 'SYSTEM',
};

/**
 * Creates an audit log entry in the database.
 * actor = null designates a SYSTEM action.
 */
export async function writeAuditLogEntry(
  actor: AuditActor | null,
  action: string,
  targetType: AuditTargetType,
  targetId: string,
  targetLabel: string,
  metadata?: any
): Promise<void> {
  try {
    const actorId = actor?.id || null;
    const actorLabel = actor ? `${actor.name} (${actor.role})` : 'SYSTEM';

    await prisma.platformAuditLog.create({
      data: {
        id: generateUlid(),
        actorId,
        actorLabel,
        action,
        targetType,
        targetId,
        targetLabel,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
    });
  } catch (err) {
    console.error('Failed to write platform audit log:', err);
  }
}
