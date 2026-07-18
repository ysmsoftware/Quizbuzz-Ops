'use client';

import { SubscriptionPlan } from '@/lib/types';
import { getDatabase, saveDatabase } from '@/lib/data/db';
import { simulateLatency } from '@/lib/api/utils';
import { writeAuditLogEntry } from '@/lib/api/auditLog';

export async function getPlans(): Promise<SubscriptionPlan[]> {
  await simulateLatency();
  const db = getDatabase();
  return db.plans;
}

export async function createSubscriptionPlan(
  plan: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt' | 'priceINR' | 'interval'>
): Promise<SubscriptionPlan> {
  await simulateLatency();
  const db = getDatabase();
  
  const id = `plan_${plan.slug.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  const newPlan: SubscriptionPlan = {
    ...plan,
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Backwards compatibility properties
    priceINR: plan.price,
    interval: plan.billingCycle === 'annual' ? 'yearly' : 'monthly',
  };

  db.plans.push(newPlan);

  // Append audit log
  writeAuditLogEntry('plan.created', 'plan', id, newPlan.name, {
    description: newPlan.description,
    price: newPlan.price,
    billingCycle: newPlan.billingCycle,
  });

  saveDatabase(db);
  return newPlan;
}

export async function updateSubscriptionPlan(planId: string, updates: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
  await simulateLatency();
  const db = getDatabase();
  const planIndex = db.plans.findIndex((p) => p.id === planId);

  if (planIndex === -1) {
    throw new Error('Subscription plan not found');
  }

  const plan = db.plans[planIndex];
  const updatedPlan: SubscriptionPlan = {
    ...plan,
    ...updates,
  };

  db.plans[planIndex] = updatedPlan;

  // Append audit log
  writeAuditLogEntry('plan.updated', 'plan', planId, plan.name, { updates });

  saveDatabase(db);
  return updatedPlan;
}
