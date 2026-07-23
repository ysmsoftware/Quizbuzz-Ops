'use client';

import React, { useState } from 'react';
import {
  useOrgPayoutAccount,
  useOrgRouteTransfers,
  useAttachLinkedAccount,
  useUpdatePayoutStatus,
} from '@/lib/hooks/usePayouts';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import {
  Landmark,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Ban,
  Link,
  ShieldAlert,
  IndianRupee,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';

interface OrgPayoutAccountTabProps {
  orgId: string;
  orgName: string;
}

export default function OrgPayoutAccountTab({ orgId, orgName }: OrgPayoutAccountTabProps) {
  const { admin } = useCurrentAdmin();
  const { toast } = useToast();

  const canEdit = admin?.role === 'SUPER_ADMIN' || admin?.role === 'BILLING_ADMIN';

  // Query org payout account details and route transfers
  const { data: payoutData, isLoading: isLoadingAccount } = useOrgPayoutAccount(orgId);
  const [transfersPage, setTransfersPage] = useState(1);
  const [transfersStatus, setTransfersStatus] = useState<string>('all');

  const { data: transfersData, isLoading: isLoadingTransfers } = useOrgRouteTransfers(orgId, {
    page: transfersPage,
    limit: 10,
    status: transfersStatus as any,
  });

  const attachMutation = useAttachLinkedAccount();
  const statusMutation = useUpdatePayoutStatus();

  // Modals state
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [linkedAccountId, setLinkedAccountId] = useState('');
  const [attachError, setAttachError] = useState('');

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<'ACTIVE' | 'VERIFICATION_FAILED' | 'DISABLED'>('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [statusError, setStatusError] = useState('');

  if (isLoadingAccount) {
    return (
      <div className="space-y-4 py-8 animate-pulse font-sans">
        <div className="h-28 bg-card border border-border/40 rounded-xl" />
        <div className="h-48 bg-card border border-border/40 rounded-xl" />
      </div>
    );
  }

  const hasAccount = payoutData?.hasAccount;
  const account = payoutData?.account;
  const summary = payoutData?.transferSummary;

  const handleAttachSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkedAccountId.trim().startsWith('acc_')) {
      setAttachError('Linked Account ID must start with acc_');
      return;
    }

    try {
      await attachMutation.mutateAsync({
        orgId,
        input: { razorpayLinkedAccountId: linkedAccountId.trim() },
      });
      toast('Linked Account Attached', `Razorpay Linked Account attached to ${orgName}.`, 'success');
      setIsAttachModalOpen(false);
      setLinkedAccountId('');
      setAttachError('');
    } catch (err: any) {
      setAttachError(err.message || 'Failed to attach linked account');
    }
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusReason.trim()) {
      setStatusError('Reason is required for status changes');
      return;
    }

    try {
      await statusMutation.mutateAsync({
        orgId,
        input: { status: newStatus, reason: statusReason.trim() },
      });
      toast('Payout Status Updated', `Payout account status changed to ${newStatus}.`, 'success');
      setIsStatusModalOpen(false);
      setStatusReason('');
      setStatusError('');
    } catch (err: any) {
      setStatusError(err.message || 'Failed to update status');
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Account Info Card */}
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Landmark className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-foreground">Razorpay Route Payout Account</h3>
              <p className="text-xs text-muted-foreground">
                Receives organization registration fees share via split payment transfers
              </p>
            </div>
          </div>

          {/* Account Status Badge */}
          {hasAccount && account ? (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  account.status === 'ACTIVE'
                    ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30'
                    : account.status === 'PENDING'
                    ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30'
                    : account.status === 'VERIFICATION_FAILED'
                    ? 'bg-rose-500/15 text-rose-600 border border-rose-500/30'
                    : 'bg-slate-500/15 text-slate-500 border border-slate-500/30'
                }`}
              >
                {account.status === 'ACTIVE' && <CheckCircle2 className="h-3.5 w-3.5" />}
                {account.status === 'PENDING' && <Clock className="h-3.5 w-3.5" />}
                {account.status === 'VERIFICATION_FAILED' && <AlertTriangle className="h-3.5 w-3.5" />}
                {account.status === 'DISABLED' && <Ban className="h-3.5 w-3.5" />}
                <span>{account.status}</span>
              </span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-muted text-muted-foreground">
              NOT SUBMITTED
            </span>
          )}
        </div>

        {!hasAccount || !account ? (
          <div className="py-8 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">
              This organization has not submitted payout account details yet.
            </p>
            <p className="text-[10px] text-muted-foreground/80 mt-1">
              Organization admins can set up payout details from their Settings tab in the main app.
            </p>
          </div>
        ) : (
          <div className="pt-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-secondary/20 rounded-lg space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">Legal Account Name</span>
                <p className="font-bold text-foreground truncate">{account.accountName}</p>
              </div>

              <div className="p-3 bg-secondary/20 rounded-lg space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">Billing Contact Email</span>
                <p className="font-bold text-foreground truncate">{account.accountEmail}</p>
              </div>

              <div className="p-3 bg-secondary/20 rounded-lg space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">Phone Number</span>
                <p className="font-bold text-foreground">{account.contactNumber || '—'}</p>
              </div>

              <div className="p-3 bg-secondary/20 rounded-lg space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">Razorpay Linked Account ID</span>
                <p className="font-mono font-bold text-primary truncate">
                  {account.razorpayLinkedAccountId ? account.razorpayLinkedAccountId : 'Not attached yet'}
                </p>
              </div>

              <div className="p-3 bg-secondary/20 rounded-lg space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">Onboarding Mode</span>
                <p className="font-semibold text-foreground">{account.onboardingMode}</p>
              </div>

              <div className="p-3 bg-secondary/20 rounded-lg space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">Activated At</span>
                <p className="font-mono text-muted-foreground">
                  {account.activatedAt ? format(new Date(account.activatedAt), 'dd MMM yyyy, hh:mm a') : '—'}
                </p>
              </div>
            </div>

            {account.statusReason && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-600 space-y-1">
                <span className="font-bold block">Status Reason:</span>
                <p className="text-foreground/90">{account.statusReason}</p>
              </div>
            )}

            {/* Operator Actions */}
            {canEdit && (
              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setLinkedAccountId(account.razorpayLinkedAccountId || '');
                    setAttachError('');
                    setIsAttachModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Link className="h-3.5 w-3.5" />
                  <span>{account.razorpayLinkedAccountId ? 'Update Linked Account ID' : 'Attach Linked Account ID'}</span>
                </button>

                <button
                  onClick={() => {
                    setNewStatus(account.status as any);
                    setStatusReason(account.statusReason || '');
                    setStatusError('');
                    setIsStatusModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-secondary/40 text-foreground transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Change Payout Status</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transfer Summary KPIs */}
      {hasAccount && summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase block">Total Transferred</span>
              <div className="text-lg font-bold font-mono text-foreground flex items-baseline">
                <IndianRupee className="h-4 w-4 mr-0.5" />
                {summary.totalTransferredAllTime.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-lg">
              <ArrowUpRight className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase block">Processed Transfers</span>
              <div className="text-lg font-bold font-mono text-emerald-600">{summary.processed}</div>
            </div>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-lg">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase block">Pending Transfers</span>
              <div className="text-lg font-bold font-mono text-amber-600">{summary.pendingNoAccount}</div>
            </div>
            <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-lg">
              <Clock className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase block">Failed Transfers</span>
              <div className="text-lg font-bold font-mono text-rose-600">{summary.failed}</div>
            </div>
            <div className="p-2.5 bg-rose-500/10 text-rose-600 rounded-lg">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </div>
      )}

      {/* Organization Route Transfers Ledger */}
      {hasAccount && (
        <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h4 className="font-semibold text-sm text-foreground">Route Payment Transfers</h4>
              <p className="text-xs text-muted-foreground">
                Per-payment share transfers created for paid contests
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={transfersStatus}
                onChange={(e) => {
                  setTransfersStatus(e.target.value);
                  setTransfersPage(1);
                }}
                className="text-xs font-sans bg-secondary/20 border border-border/40 rounded-lg px-2.5 py-1.5 focus:outline-none text-muted-foreground"
              >
                <option value="all">All Transfer Statuses</option>
                <option value="PROCESSED">PROCESSED</option>
                <option value="PENDING">PENDING</option>
                <option value="FAILED">FAILED</option>
                <option value="REVERSED">REVERSED</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoadingTransfers ? (
              <div className="py-8 text-center text-xs text-muted-foreground font-mono animate-pulse">
                Loading route transfers...
              </div>
            ) : !transfersData?.data || transfersData.data.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No route transfers recorded for this organization.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-secondary/20 text-muted-foreground border-b border-border/40">
                    <th className="py-2.5 px-4 font-semibold">Transfer ID</th>
                    <th className="py-2.5 px-4 font-semibold">Contest</th>
                    <th className="py-2.5 px-4 font-semibold">Gross</th>
                    <th className="py-2.5 px-4 font-semibold">Platform Fee</th>
                    <th className="py-2.5 px-4 font-semibold">Org Share</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30 font-mono">
                  {transfersData.data.map((t) => (
                    <tr key={t.id} className="hover:bg-secondary/15 transition-colors font-sans">
                      <td className="py-2.5 px-4 font-mono font-bold text-foreground">{t.id}</td>
                      <td className="py-2.5 px-4 text-foreground/90 font-medium max-w-[140px] truncate">
                        {t.contestTitle}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-foreground">₹{t.grossAmount}</td>
                      <td className="py-2.5 px-4 font-mono text-muted-foreground">₹{t.platformFeeAmount}</td>
                      <td className="py-2.5 px-4 font-mono font-bold text-emerald-600">₹{t.transferAmount}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            t.status === 'PROCESSED'
                              ? 'bg-emerald-500/15 text-emerald-600'
                              : t.status === 'PENDING'
                              ? 'bg-amber-500/15 text-amber-600'
                              : 'bg-rose-500/15 text-rose-600'
                          }`}
                        >
                          {t.status}
                        </span>
                        {t.failureReason && (
                          <span className="block text-[9px] text-rose-500 font-mono mt-0.5 truncate max-w-[120px]">
                            {t.failureReason}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[11px] text-muted-foreground">
                        {format(new Date(t.createdAt), 'dd MMM yyyy, hh:mm a')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Attach Linked Account Modal */}
      {isAttachModalOpen && (
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2 text-primary font-bold text-sm border-b border-border/40 pb-3">
              <Link className="h-4 w-4" />
              <span>Attach Razorpay Linked Account ID</span>
            </div>

            <form onSubmit={handleAttachSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Razorpay Linked Account ID (acc_...)</label>
                <input
                  type="text"
                  value={linkedAccountId}
                  onChange={(e) => setLinkedAccountId(e.target.value)}
                  placeholder="acc_QwErTy12345"
                  className="w-full text-xs font-mono p-2.5 rounded-lg border border-border/40 bg-secondary/10 focus:outline-none focus:border-primary"
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  Paste the Linked Account ID created in the Razorpay Dashboard for {orgName}.
                </p>
              </div>

              {attachError && (
                <div className="p-2.5 text-xs text-rose-600 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>{attachError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAttachModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-secondary/40 text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={attachMutation.isPending}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm disabled:opacity-50"
                >
                  {attachMutation.isPending ? 'Linking...' : 'Save & Activate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Payout Status Modal */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2 text-foreground font-bold text-sm border-b border-border/40 pb-3">
              <RefreshCw className="h-4 w-4 text-primary" />
              <span>Update Payout Account Status</span>
            </div>

            <form onSubmit={handleStatusSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Target Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="w-full text-xs font-sans p-2.5 rounded-lg border border-border/40 bg-secondary/10 focus:outline-none focus:border-primary"
                >
                  <option value="ACTIVE">ACTIVE — Normal Payout Operation</option>
                  <option value="VERIFICATION_FAILED">VERIFICATION_FAILED — Razorpay KYC Rejected</option>
                  <option value="DISABLED">DISABLED — Payouts Temporarily Suspended</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Reason / Justification</label>
                <textarea
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Explain why this status is being set..."
                  rows={3}
                  className="w-full text-xs font-sans p-2.5 rounded-lg border border-border/40 bg-secondary/10 focus:outline-none focus:border-primary resize-none"
                  required
                />
              </div>

              {statusError && (
                <div className="p-2.5 text-xs text-rose-600 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>{statusError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-secondary/40 text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={statusMutation.isPending}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
