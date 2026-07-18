'use client';

import { Payment, BillingRecord } from '@/lib/types';
import { getDatabase, saveDatabase } from '@/lib/data/db';
import { simulateLatency } from '@/lib/api/utils';
import { writeAuditLogEntry } from '@/lib/api/auditLog';

export async function getBillingRecords(): Promise<BillingRecord[]> {
  await simulateLatency();
  const db = getDatabase();
  return db.billing;
}

export async function refundBillingRecord(billingId: string): Promise<BillingRecord> {
  await simulateLatency();
  const db = getDatabase();
  const index = db.billing.findIndex((b) => b.id === billingId);

  if (index === -1) {
    throw new Error('Billing record not found');
  }

  const record = db.billing[index];
  const updatedRecord: BillingRecord = {
    ...record,
    status: 'FAILED',
  };

  db.billing[index] = updatedRecord;

  writeAuditLogEntry('payment.refunded', 'payment', billingId, record.transactionId, {
    amount: record.amountINR,
    legacy: true
  });

  saveDatabase(db);
  return updatedRecord;
}

export async function getPayments(): Promise<Payment[]> {
  await simulateLatency(100, 300);
  const db = getDatabase();
  if (!db.payments) {
    db.payments = [];
  }
  return db.payments;
}

export async function refundPayment(paymentId: string, reason: string): Promise<Payment> {
  await simulateLatency(200, 400);
  const db = getDatabase();
  if (!db.payments) {
    db.payments = [];
  }
  const index = db.payments.findIndex((p) => p.id === paymentId);

  if (index === -1) {
    throw new Error('Payment not found');
  }

  const payment = db.payments[index];
  const updatedPayment: Payment = {
    ...payment,
    status: 'REFUNDED',
    refundedAt: new Date().toISOString(),
    refundReason: reason,
  };

  db.payments[index] = updatedPayment;

  writeAuditLogEntry('payment.refunded', 'payment', paymentId, payment.contestTitle, {
    amount: payment.amount,
    reason,
    participantName: payment.participantName,
  });

  saveDatabase(db);
  return updatedPayment;
}
