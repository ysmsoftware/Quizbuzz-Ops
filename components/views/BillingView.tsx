'use client';

import React, { useState } from 'react';
import { useBillingSummary, useBillingPayments } from '@/lib/hooks/useBilling';
import { usePayoutAccounts, useRouteTransfers, useAttachLinkedAccount, useUpdatePayoutStatus } from '@/lib/hooks/usePayouts';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { format } from 'date-fns';
import {
  IndianRupee,
  TrendingUp,
  ShieldAlert,
  Search,
  Filter,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Trophy,
  User,
  Layers,
  Landmark,
  ArrowUpRight,
  Link,
  RefreshCw,
  Clock,
  Ban,
  Receipt,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface BillingViewProps {
  initialTab?: 'payments' | 'payouts' | 'transfers';
}

export default function BillingView({ initialTab = 'payments' }: BillingViewProps) {
  const { admin } = useCurrentAdmin();
  const { toast } = useToast();
  const canEdit = admin?.role === 'SUPER_ADMIN' || admin?.role === 'BILLING_ADMIN';

  // Sub-Tab State
  const [activeTab, setActiveTab] = useState<'payments' | 'payouts' | 'transfers'>(initialTab);

  // --- Real Billing Summary Query ---
  const { data: summary, isLoading: isLoadingSummary } = useBillingSummary();

  // --- 1. Payments Ledger State & Query ---
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsStatus, setPaymentsStatus] = useState<string>('all');
  const [paymentsSearch, setPaymentsSearch] = useState('');

  const { data: paymentsData, isLoading: isLoadingPayments } = useBillingPayments({
    page: paymentsPage,
    limit: 20,
    status: paymentsStatus as any,
    search: paymentsSearch,
  });

  // --- 2. Payout Accounts Queue State & Query ---
  const [payoutsPage, setPayoutsPage] = useState(1);
  const [payoutsStatus, setPayoutsStatus] = useState<string>('all');
  const [payoutsSearch, setPayoutsSearch] = useState('');

  const { data: payoutsData, isLoading: isLoadingPayouts } = usePayoutAccounts({
    page: payoutsPage,
    limit: 20,
    status: payoutsStatus as any,
    search: payoutsSearch,
  });

  // --- 3. Route Transfers State & Query ---
  const [transfersPage, setTransfersPage] = useState(1);
  const [transfersStatus, setTransfersStatus] = useState<string>('all');
  const [transfersReason, setTransfersReason] = useState('');

  const { data: transfersData, isLoading: isLoadingTransfers } = useRouteTransfers({
    page: transfersPage,
    limit: 20,
    status: transfersStatus as any,
    reason: transfersReason || undefined,
  });

  // Mutations for Payout Accounts Queue
  const attachMutation = useAttachLinkedAccount();
  const statusMutation = useUpdatePayoutStatus();

  // Modal Dialog States for Payout Account Queue
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedOrgName, setSelectedOrgName] = useState<string>('');
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [linkedAccountId, setLinkedAccountId] = useState('');
  const [attachError, setAttachError] = useState('');

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<'ACTIVE' | 'VERIFICATION_FAILED' | 'DISABLED'>('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [statusError, setStatusError] = useState('');

  // Handle Payout Attach Submit
  const handleAttachSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    if (!linkedAccountId.trim().startsWith('acc_')) {
      setAttachError('Linked Account ID must start with acc_');
      return;
    }

    try {
      await attachMutation.mutateAsync({
        orgId: selectedOrgId,
        input: { razorpayLinkedAccountId: linkedAccountId.trim() },
      });
      toast('Linked Account Attached', `Razorpay Linked Account attached to ${selectedOrgName}.`, 'success');
      setIsAttachModalOpen(false);
      setSelectedOrgId(null);
      setLinkedAccountId('');
      setAttachError('');
    } catch (err: any) {
      setAttachError(err.message || 'Failed to attach linked account');
    }
  };

  // Handle Payout Status Submit
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    if (!statusReason.trim()) {
      setStatusError('Reason is required for status changes');
      return;
    }

    try {
      await statusMutation.mutateAsync({
        orgId: selectedOrgId,
        input: { status: newStatus, reason: statusReason.trim() },
      });
      toast('Payout Status Updated', `Account status updated to ${newStatus}.`, 'success');
      setIsStatusModalOpen(false);
      setSelectedOrgId(null);
      setStatusReason('');
      setStatusError('');
    } catch (err: any) {
      setStatusError(err.message || 'Failed to update status');
    }
  };

  // Donut Chart Colors & Data
  const STATUS_COLORS: Record<string, string> = {
    SUCCESS: '#10b981', // Emerald
    PAID: '#10b981',
    REFUNDED: '#3b82f6', // Blue
    FAILED: '#ef4444', // Red
    PENDING: '#f59e0b', // Amber
  };

  const statusPieData = summary?.paymentsByStatus
    ? Object.entries(summary.paymentsByStatus).map(([status, value]) => ({
        name: status,
        value,
      }))
    : [];

  // Group payments by date for area chart
  const paymentsList = paymentsData?.data || [];
  const paymentsByDate = paymentsList
    .filter((p) => p.status === 'SUCCESS' || p.status === 'PAID')
    .reduce((acc, p) => {
      const dateStr = format(new Date(p.createdAt), 'dd MMM');
      acc[dateStr] = (acc[dateStr] || 0) + p.amount;
      return acc;
    }, {} as Record<string, number>);

  const revenueChartData = Object.entries(paymentsByDate)
    .map(([date, amount]) => ({ date, amount }))
    .reverse();

  return (
    <div id="billing-revenue-view" className="space-y-6 font-sans">
      {/* Header and Permission Alert */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Billing & Revenue Desk</h1>
          <p className="text-xs text-muted-foreground">
            Monitor platform revenue, active MRR, razorpay route payouts, and payment route transfers
          </p>
        </div>
        {!canEdit && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>Support role: Payouts Management is <strong>Read-Only</strong></span>
          </div>
        )}
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI 1: Total Revenue */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
              Total Platform Revenue
            </span>
            <div className="text-2xl font-bold font-mono tracking-tight text-foreground flex items-baseline">
              <IndianRupee className="h-5 w-5 mr-0.5" />
              {isLoadingSummary ? '...' : (summary?.totalRevenueAllTime || 0).toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              ₹{(summary?.totalRevenueThisMonth || 0).toLocaleString('en-IN')} collected this month
            </span>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>

        {/* KPI 2: MRR */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
              Active Subscriptions (MRR)
            </span>
            <div className="text-2xl font-bold font-mono tracking-tight text-foreground flex items-baseline">
              <IndianRupee className="h-5 w-5 mr-0.5" />
              {isLoadingSummary ? '...' : (summary?.mrr || 0).toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              {summary?.activeSubscriptionCount || 0} active tenant subscriptions
            </span>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
            <Layers className="h-6 w-6" />
          </div>
        </div>

        {/* KPI 3: Successful Payments Count */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
              Settled Transactions
            </span>
            <div className="text-2xl font-bold font-mono tracking-tight text-foreground flex items-baseline text-emerald-600">
              {isLoadingSummary ? '...' : summary?.paymentsByStatus.SUCCESS || 0}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              {summary?.paymentsByStatus.FAILED || 0} failed • {summary?.paymentsByStatus.PENDING || 0} pending
            </span>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="border-b border-border/40 font-sans">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('payments')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'payments'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/20'
            }`}
          >
            <Receipt className="h-4 w-4" />
            <span>Payments Ledger</span>
          </button>

          <button
            onClick={() => setActiveTab('payouts')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'payouts'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/20'
            }`}
          >
            <Landmark className="h-4 w-4" />
            <span>Payout Accounts Queue</span>
            {payoutsData?.total !== undefined && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-primary/15 text-primary font-bold">
                {payoutsData.total}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('transfers')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'transfers'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/20'
            }`}
          >
            <ArrowUpRight className="h-4 w-4" />
            <span>Route Transfers</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PAYMENTS LEDGER */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Revenue over time area chart */}
            <div className="lg:col-span-3 rounded-xl border border-border/50 bg-card p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-foreground text-sm">Payment Trend Over Time</h3>
                <p className="text-[11px] text-muted-foreground">
                  Recent revenue collected from contest registrations
                </p>
              </div>
              <div className="h-52 w-full text-xs font-mono mt-4">
                {revenueChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                    No transaction trend data recorded yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" stroke="var(--muted-foreground)" opacity={0.6} tickLine={false} />
                      <YAxis stroke="var(--muted-foreground)" opacity={0.6} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--card)',
                          borderColor: 'var(--border)',
                          borderRadius: '8px',
                          color: 'var(--foreground)',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        name="Collected (₹)"
                        stroke="var(--primary)"
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Status Breakdown Donut Chart */}
            <div className="lg:col-span-2 rounded-xl border border-border/50 bg-card p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-foreground text-sm">Transaction Breakdown</h3>
                <p className="text-[11px] text-muted-foreground">Breakdown of all platform payment states</p>
              </div>
              <div className="h-52 w-full flex flex-col justify-center text-xs mt-4">
                <div className="h-32 w-full relative">
                  {statusPieData.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                      No status records
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={36}
                          outerRadius={52}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {statusPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: 'var(--card)',
                            borderColor: 'var(--border)',
                            borderRadius: '8px',
                            color: 'var(--foreground)',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 px-2">
                  {statusPieData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: STATUS_COLORS[entry.name] || '#94a3b8' }}
                      />
                      <span className="truncate">{entry.name}</span>
                      <span className="font-mono ml-auto font-bold text-foreground/80">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Payments Table Card */}
          <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-foreground text-sm">Payment Audit Ledger</h3>
                <p className="text-xs text-muted-foreground">Real-time payment logs from main database</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={paymentsSearch}
                    onChange={(e) => {
                      setPaymentsSearch(e.target.value);
                      setPaymentsPage(1);
                    }}
                    placeholder="Search payee / org / contest..."
                    className="pl-9 h-9 w-48 sm:w-60 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex items-center gap-1 bg-secondary/10 border border-border/40 rounded-lg px-2 h-9">
                  <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
                  <select
                    value={paymentsStatus}
                    onChange={(e) => {
                      setPaymentsStatus(e.target.value);
                      setPaymentsPage(1);
                    }}
                    className="text-[11px] font-sans bg-transparent focus:outline-none text-muted-foreground"
                  >
                    <option value="all">All Status</option>
                    <option value="SUCCESS">SUCCESS</option>
                    <option value="FAILED">FAILED</option>
                    <option value="PENDING">PENDING</option>
                    <option value="REFUNDED">REFUNDED</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              {isLoadingPayments ? (
                <div className="py-12 text-center text-xs text-muted-foreground font-mono animate-pulse">
                  Syncing payment ledger rows from database...
                </div>
              ) : paymentsList.length === 0 ? (
                <div className="py-16 text-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-muted-foreground">No transactions found</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-secondary/20 text-muted-foreground border-b border-border/40">
                      <th className="py-3 px-5 font-semibold">Payment ID</th>
                      <th className="py-3 px-5 font-semibold">Tenant Org</th>
                      <th className="py-3 px-5 font-semibold">Contest Context</th>
                      <th className="py-3 px-5 font-semibold">Payee Contact</th>
                      <th className="py-3 px-5 font-semibold">Gross Amount</th>
                      <th className="py-3 px-5 font-semibold">Provider</th>
                      <th className="py-3 px-5 font-semibold">Status</th>
                      <th className="py-3 px-5 font-semibold text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30 font-sans">
                    {paymentsList.map((p) => (
                      <tr key={p.id} className="hover:bg-secondary/15 transition-all">
                        <td className="py-3 px-5 font-mono text-[11px] text-foreground font-bold">{p.id}</td>
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-1.5 max-w-[130px] truncate">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-semibold text-foreground/90 truncate">{p.organizationName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-1.5 max-w-[150px] truncate">
                            <Trophy className="h-3.5 w-3.5 text-amber-500/80 shrink-0" />
                            <span className="truncate text-muted-foreground font-medium">{p.contestTitle || '—'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-foreground/80 font-medium">{p.payeeName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-5 font-mono font-bold text-foreground">₹{p.amount}</td>
                        <td className="py-3 px-5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-500/15 text-indigo-500">
                            {p.provider}
                          </span>
                        </td>
                        <td className="py-3 px-5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              p.status === 'SUCCESS' || p.status === 'PAID'
                                ? 'bg-emerald-500/15 text-emerald-600'
                                : p.status === 'REFUNDED'
                                ? 'bg-blue-500/15 text-blue-600'
                                : p.status === 'FAILED'
                                ? 'bg-rose-500/15 text-rose-600'
                                : 'bg-amber-500/15 text-amber-600'
                            }`}
                          >
                            <span>{p.status}</span>
                          </span>
                        </td>
                        <td className="py-3 px-5 text-right font-mono text-muted-foreground text-[11px]">
                          {p.paidAt ? format(new Date(p.paidAt), 'dd MMM yyyy, hh:mm a') : format(new Date(p.createdAt), 'dd MMM yyyy')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PAYOUT ACCOUNTS QUEUE */}
      {activeTab === 'payouts' && (
        <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden space-y-0">
          <div className="p-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground text-sm">Payout Account Onboarding Queue</h3>
              <p className="text-xs text-muted-foreground">
                Organizations requiring manual Razorpay Linked Account verification and linking
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={payoutsSearch}
                  onChange={(e) => {
                    setPayoutsSearch(e.target.value);
                    setPayoutsPage(1);
                  }}
                  placeholder="Search org / account..."
                  className="pl-9 h-9 w-48 sm:w-56 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center gap-1 bg-secondary/10 border border-border/40 rounded-lg px-2 h-9">
                <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
                <select
                  value={payoutsStatus}
                  onChange={(e) => {
                    setPayoutsStatus(e.target.value);
                    setPayoutsPage(1);
                  }}
                  className="text-[11px] font-sans bg-transparent focus:outline-none text-muted-foreground"
                >
                  <option value="all">All Payout Statuses</option>
                  <option value="PENDING">PENDING (Queue First)</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="VERIFICATION_FAILED">VERIFICATION_FAILED</option>
                  <option value="DISABLED">DISABLED</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoadingPayouts ? (
              <div className="py-12 text-center text-xs text-muted-foreground font-mono animate-pulse">
                Fetching payout onboarding queue...
              </div>
            ) : !payoutsData?.data || payoutsData.data.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/60 mx-auto mb-2" />
                <p className="text-xs font-semibold text-muted-foreground">No payout accounts match criteria</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-secondary/20 text-muted-foreground border-b border-border/40">
                    <th className="py-3 px-4 font-semibold">Tenant Organization</th>
                    <th className="py-3 px-4 font-semibold">Legal Contact</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Razorpay Account ID</th>
                    <th className="py-3 px-4 font-semibold text-center">Pending Transfers</th>
                    <th className="py-3 px-4 font-semibold">Operator Contact Log</th>
                    <th className="py-3 px-4 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {payoutsData.data.map((pa) => (
                    <tr key={pa.id} className="hover:bg-secondary/15 transition-all font-sans">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">{pa.organizationName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">@{pa.organizationSlug}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{pa.accountName}</div>
                        <div className="text-[10px] text-muted-foreground">{pa.accountEmail}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            pa.status === 'ACTIVE'
                              ? 'bg-emerald-500/15 text-emerald-600'
                              : pa.status === 'PENDING'
                              ? 'bg-amber-500/15 text-amber-600'
                              : pa.status === 'VERIFICATION_FAILED'
                              ? 'bg-rose-500/15 text-rose-600'
                              : 'bg-slate-500/15 text-slate-500'
                          }`}
                        >
                          {pa.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono">
                        {pa.razorpayLinkedAccountId ? (
                          <span className="font-bold text-primary">{pa.razorpayLinkedAccountId}</span>
                        ) : (
                          <span className="text-muted-foreground/60 italic text-[11px]">Unlinked</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold">
                        {pa.pendingTransferCount > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-600">
                            {pa.pendingTransferCount}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-[11px]">
                        {pa.lastContactedAt ? (
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-muted-foreground font-mono block">
                              {format(new Date(pa.lastContactedAt), 'dd MMM yyyy')}
                            </span>
                            <span className="text-foreground/80 line-clamp-1 italic">{pa.lastContactNote}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50 italic text-[10px]">Untouched</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {canEdit ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedOrgId(pa.organizationId);
                                setSelectedOrgName(pa.organizationName);
                                setLinkedAccountId(pa.razorpayLinkedAccountId || '');
                                setAttachError('');
                                setIsAttachModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-[10px] font-bold rounded bg-primary/15 hover:bg-primary/25 text-primary transition-all flex items-center gap-1 cursor-pointer"
                              title="Attach Linked Account ID"
                            >
                              <Link className="h-3 w-3" />
                              <span>Link</span>
                            </button>

                            <button
                              onClick={() => {
                                setSelectedOrgId(pa.organizationId);
                                setSelectedOrgName(pa.organizationName);
                                setNewStatus(pa.status as any);
                                setStatusReason('');
                                setStatusError('');
                                setIsStatusModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-[10px] font-bold rounded bg-secondary hover:bg-secondary/80 text-foreground transition-all flex items-center gap-1 cursor-pointer border border-border/40"
                              title="Update Status"
                            >
                              <RefreshCw className="h-3 w-3" />
                              <span>Status</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">Read-only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ROUTE TRANSFERS LEDGER */}
      {activeTab === 'transfers' && (
        <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground text-sm">Platform Payment Route Transfers</h3>
              <p className="text-xs text-muted-foreground">
                Cross-organization breakdown of Razorpay Route split payment transfers
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
                <option value="all">All Statuses</option>
                <option value="PROCESSED">PROCESSED</option>
                <option value="PENDING">PENDING</option>
                <option value="FAILED">FAILED</option>
                <option value="REVERSED">REVERSED</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoadingTransfers ? (
              <div className="py-12 text-center text-xs text-muted-foreground font-mono animate-pulse">
                Fetching platform route transfers...
              </div>
            ) : !transfersData?.data || transfersData.data.length === 0 ? (
              <div className="py-16 text-center text-xs text-muted-foreground">
                No route transfers recorded.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-secondary/20 text-muted-foreground border-b border-border/40">
                    <th className="py-3 px-4 font-semibold">Transfer ID</th>
                    <th className="py-3 px-4 font-semibold">Tenant Org</th>
                    <th className="py-3 px-4 font-semibold">Contest</th>
                    <th className="py-3 px-4 font-semibold">Gross</th>
                    <th className="py-3 px-4 font-semibold">Platform Fee</th>
                    <th className="py-3 px-4 font-semibold">Transfer Amount</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {transfersData.data.map((t) => (
                    <tr key={t.id} className="hover:bg-secondary/15 transition-all font-sans">
                      <td className="py-3 px-4 font-mono font-bold text-foreground">{t.id}</td>
                      <td className="py-3 px-4 font-semibold text-foreground">{t.organizationName || '—'}</td>
                      <td className="py-3 px-4 text-muted-foreground font-medium max-w-[140px] truncate">
                        {t.contestTitle}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-foreground">₹{t.grossAmount}</td>
                      <td className="py-3 px-4 font-mono text-muted-foreground">₹{t.platformFeeAmount}</td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600">₹{t.transferAmount}</td>
                      <td className="py-3 px-4">
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
                          <span className="block text-[9px] text-rose-500 font-mono mt-0.5 truncate max-w-[130px]">
                            {t.failureReason}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[11px] text-muted-foreground">
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
                  Paste the Linked Account ID created in the Razorpay Dashboard for {selectedOrgName}.
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
