'use client';

import React, { useState } from 'react';
import { useBilling } from '@/lib/hooks/useBilling';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useOrganizations } from '@/lib/hooks/useOrganizations';
import { usePlans } from '@/lib/hooks/usePlans';
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
  HelpCircle, 
  Undo2, 
  Building2, 
  Trophy, 
  User, 
  Calendar,
  Layers
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
  Cell
} from 'recharts';

export default function BillingView() {
  const { payments, isPaymentsLoading, refundPayment, isRefundingPayment } = useBilling();
  const { admin } = useCurrentAdmin();
  const { organizations = [] } = useOrganizations();
  const { plans = [] } = usePlans();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [providerFilter, setProviderFilter] = useState<string>('ALL');

  // Refund dialog state
  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundError, setRefundError] = useState('');

  // 1. Check permission (Refund enabled for SUPER_ADMIN or BILLING_ADMIN)
  const canIssueRefund = admin?.role === 'SUPER_ADMIN' || admin?.role === 'BILLING_ADMIN';

  // 2. Calculations for Top 3 KPIs
  const paidPayments = payments.filter(p => p.status === 'PAID');
  const refundedPayments = payments.filter(p => p.status === 'REFUNDED');
  
  // KPI 1: Total Revenue (PAID payments + active subscriptions value + any contest revenue)
  const paymentsTotalAmount = paidPayments.reduce((sum, p) => sum + p.amount, 0);
  
  // Calculate active subscriptions value (MRR)
  const activeSubsValue = organizations
    .filter(org => org.status === 'ACTIVE')
    .reduce((sum, org) => {
      const plan = plans.find(p => p.id === org.planId);
      const planPrice = plan ? plan.price : 0;
      return sum + planPrice;
    }, 0);

  const totalRevenue = paymentsTotalAmount + activeSubsValue;

  // KPI 2: Active Subscriptions Value (MRR)
  const totalMRR = activeSubsValue;

  // KPI 3: Total Refunds
  const totalRefundsValue = refundedPayments.reduce((sum, p) => sum + p.amount, 0);

  // 3. Status Breakdown for Donut Chart
  const statusCounts = payments.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const STATUS_COLORS: Record<string, string> = {
    PAID: '#10b981',      // Emerald
    REFUNDED: '#3b82f6',  // Blue
    FAILED: '#ef4444',    // Red
    PENDING: '#f59e0b',   // Amber
  };

  const statusPieData = Object.entries(statusCounts).map(([status, value]) => ({
    name: status,
    value,
  }));

  // 4. Revenue Over Time (Group payments by date)
  const paymentsByDate = payments
    .filter(p => p.status === 'PAID')
    .reduce((acc, p) => {
      const dateStr = format(new Date(p.createdAt), 'dd MMM');
      acc[dateStr] = (acc[dateStr] || 0) + p.amount;
      return acc;
    }, {} as Record<string, number>);

  const revenueChartData = Object.entries(paymentsByDate)
    .map(([date, amount]) => ({ date, amount }))
    .reverse(); // Backwards chronological to chronological

  // 5. Filter and Search
  const filteredPayments = payments.filter(p => {
    const matchesSearch = 
      p.organizationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.contestTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.participantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    const matchesProvider = providerFilter === 'ALL' || p.provider === providerFilter;

    return matchesSearch && matchesStatus && matchesProvider;
  });

  const handleOpenRefundModal = (id: string) => {
    if (!canIssueRefund) return;
    setRefundPaymentId(id);
    setRefundReason('');
    setRefundError('');
  };

  const handleCloseRefundModal = () => {
    setRefundPaymentId(null);
    setRefundReason('');
    setRefundError('');
  };

  const handleConfirmRefund = async () => {
    if (!refundPaymentId) return;
    if (!refundReason.trim()) {
      setRefundError('Refund reason is required.');
      return;
    }

    try {
      await refundPayment({ paymentId: refundPaymentId, reason: refundReason });
      handleCloseRefundModal();
    } catch (err: any) {
      setRefundError(err.message || 'Failed to process refund.');
    }
  };

  return (
    <div id="billing-revenue-view" className="space-y-6 font-sans">
      
      {/* Header and Permission Alert if Support */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Billing & Revenue Desk</h1>
          <p className="text-xs text-muted-foreground">Monitor platform transactions, MRR value, and manage payouts</p>
        </div>
        {!canIssueRefund && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>Support role: Payout Refunds are <strong>Read-Only</strong></span>
          </div>
        )}
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI 1: Total Revenue */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Total Platform Revenue</span>
            <div className="text-2xl font-bold font-mono tracking-tight text-foreground flex items-baseline">
              <IndianRupee className="h-5 w-5 mr-0.5" />
              {totalRevenue.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              ₹{paymentsTotalAmount.toLocaleString('en-IN')} from payments • ₹{activeSubsValue.toLocaleString('en-IN')} active subscriptions
            </span>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>

        {/* KPI 2: MRR */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Active Subscriptions (MRR)</span>
            <div className="text-2xl font-bold font-mono tracking-tight text-foreground flex items-baseline">
              <IndianRupee className="h-5 w-5 mr-0.5" />
              {totalMRR.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Aggregate recurring monthly invoice values
            </span>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
            <Layers className="h-6 w-6" />
          </div>
        </div>

        {/* KPI 3: Total Refunds */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Total Refunds Issued</span>
            <div className="text-2xl font-bold font-mono tracking-tight text-foreground flex items-baseline text-blue-600">
              <IndianRupee className="h-5 w-5 mr-0.5" />
              {totalRefundsValue.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              {refundedPayments.length} transactions reversed
            </span>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
            <RotateCcw className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* Revenue over time area chart */}
        <div className="lg:col-span-3 rounded-xl border border-border/50 bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-sm font-sans">Payment Trend Over Time</h3>
            <p className="text-[11px] text-muted-foreground">Daily aggregate revenue collected from participant registrations</p>
          </div>
          <div className="h-56 w-full text-xs font-mono mt-4">
            {revenueChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">No transaction trend data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" opacity={0.6} tickLine={false} />
                  <YAxis stroke="var(--muted-foreground)" opacity={0.6} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ 
                      background: 'var(--card)', 
                      borderColor: 'var(--border)', 
                      borderRadius: '8px',
                      color: 'var(--foreground)'
                    }} 
                  />
                  <Area type="monotone" dataKey="amount" name="Collected" stroke="var(--primary)" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Status Breakdown Donut Chart */}
        <div className="lg:col-span-2 rounded-xl border border-border/50 bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-sm font-sans">Transaction Status</h3>
            <p className="text-[11px] text-muted-foreground">Breakdown of platform payment states</p>
          </div>
          <div className="h-56 w-full flex flex-col justify-center text-xs mt-4">
            <div className="h-32 w-full relative">
              {statusPieData.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">No status records</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={55}
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
                        color: 'var(--foreground)'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            
            {/* Legend Grid */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-4 px-2">
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

      {/* Main Ledger Table Card */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground text-sm font-sans">Payment Audit Ledger</h3>
            <p className="text-xs text-muted-foreground">Examine all registrations and billing cycles platform-wide</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search ledger..."
                className="pl-9 h-9 w-44 sm:w-56 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-sans"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-secondary/10 border border-border/40 rounded-lg px-2 h-9">
              <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-[11px] font-sans bg-transparent focus:outline-none text-muted-foreground"
              >
                <option value="ALL">All Status</option>
                <option value="PAID">PAID</option>
                <option value="REFUNDED">REFUNDED</option>
                <option value="FAILED">FAILED</option>
                <option value="PENDING">PENDING</option>
              </select>
            </div>

            {/* Provider Filter */}
            <div className="flex items-center gap-1 bg-secondary/10 border border-border/40 rounded-lg px-2 h-9">
              <Layers className="h-3 w-3 text-muted-foreground shrink-0" />
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="text-[11px] font-sans bg-transparent focus:outline-none text-muted-foreground"
              >
                <option value="ALL">All Providers</option>
                <option value="RAZORPAY">RAZORPAY</option>
                <option value="MANUAL">MANUAL</option>
                <option value="FREE">FREE</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          {isPaymentsLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground font-mono animate-pulse">
              Syncing payment ledger rows...
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="py-16 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-xs font-semibold text-muted-foreground">No transactions match the selected criteria</p>
              <p className="text-[10px] text-muted-foreground/85 mt-0.5">Try resetting your filter parameters or search terms</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/20 text-muted-foreground border-b border-border/40">
                  <th className="py-3 px-5 font-semibold">Transaction ID</th>
                  <th className="py-3 px-5 font-semibold">Tenant Org</th>
                  <th className="py-3 px-5 font-semibold">Contest Context</th>
                  <th className="py-3 px-5 font-semibold">Participant</th>
                  <th className="py-3 px-5 font-semibold">Gross Amount</th>
                  <th className="py-3 px-5 font-semibold">Gateway</th>
                  <th className="py-3 px-5 font-semibold">Status</th>
                  <th className="py-3 px-5 font-semibold text-right">Settled Date</th>
                  <th className="py-3 px-5 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredPayments.map((p) => {
                  const isPaid = p.status === 'PAID';
                  const isRefunded = p.status === 'REFUNDED';
                  
                  return (
                    <tr key={p.id} className="hover:bg-secondary/15 transition-all">
                      {/* ID */}
                      <td className="py-3 px-5 font-mono text-[11px] text-foreground font-bold">
                        {p.id}
                      </td>

                      {/* Org */}
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-1.5 max-w-[130px] truncate">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-semibold text-foreground/90 truncate">{p.organizationName}</span>
                        </div>
                      </td>

                      {/* Contest */}
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-1.5 max-w-[150px] truncate">
                          <Trophy className="h-3.5 w-3.5 text-amber-500/80 shrink-0" />
                          <span className="truncate text-muted-foreground font-medium">{p.contestTitle}</span>
                        </div>
                      </td>

                      {/* Participant */}
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-foreground/80 font-medium">{p.participantName}</span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-5 font-mono font-bold text-foreground">
                        ₹{p.amount}
                      </td>

                      {/* Provider */}
                      <td className="py-3 px-5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider ${
                          p.provider === 'RAZORPAY' ? 'bg-indigo-500/15 text-indigo-500' :
                          p.provider === 'MANUAL' ? 'bg-orange-500/15 text-orange-600' :
                          'bg-emerald-500/15 text-emerald-600'
                        }`}>
                          {p.provider}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.status === 'PAID' ? 'bg-emerald-500/15 text-emerald-600' :
                          p.status === 'REFUNDED' ? 'bg-blue-500/15 text-blue-600' :
                          p.status === 'FAILED' ? 'bg-rose-500/15 text-rose-600' :
                          'bg-amber-500/15 text-amber-600'
                        }`}>
                          {p.status === 'PAID' && <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />}
                          {p.status === 'REFUNDED' && <RotateCcw className="h-2.5 w-2.5 shrink-0" />}
                          {p.status === 'FAILED' && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
                          <span>{p.status}</span>
                        </span>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-5 text-right font-mono text-muted-foreground text-[11px]">
                        {p.paidAt ? format(new Date(p.paidAt), 'dd MMM yyyy, hh:mm a') : format(new Date(p.createdAt), 'dd MMM yyyy')}
                      </td>

                      {/* Refund Action */}
                      <td className="py-3 px-5 text-center">
                        {isPaid ? (
                          <div className="relative group inline-block">
                            <button
                              onClick={() => handleOpenRefundModal(p.id)}
                              disabled={!canIssueRefund}
                              className={`flex items-center justify-center mx-auto p-1.5 rounded-md transition-colors ${
                                canIssueRefund 
                                  ? 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-600 cursor-pointer' 
                                  : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                              }`}
                              title={
                                !canIssueRefund 
                                  ? "Permission Denied: Support role cannot issue refunds." 
                                  : "Issue Refund"
                              }
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </button>
                            {!canIssueRefund && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 hidden group-hover:block bg-slate-900 text-white text-[10px] p-2 rounded-md shadow-md z-40 text-center font-sans font-normal leading-normal">
                                Permission Denied: Support role cannot issue refunds.
                              </div>
                            )}
                          </div>
                        ) : isRefunded ? (
                          <div className="text-[10px] text-muted-foreground font-mono italic max-w-[120px] mx-auto truncate" title={`Reason: ${p.refundReason || 'No reason specified'}`}>
                            Refunded: {p.refundReason || 'Settled'}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/60 italic">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Refund Modal Dialog */}
      {refundPaymentId && (
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="p-5 border-b border-border/40 bg-secondary/20 flex items-center gap-3 text-blue-600">
              <Undo2 className="h-5 w-5 shrink-0" />
              <h4 className="font-bold text-foreground text-sm">Issue Transaction Refund</h4>
            </div>

            <div className="p-5 space-y-4">
              <div className="text-xs text-muted-foreground leading-normal">
                You are issuing a full refund for transaction <strong className="text-foreground font-bold font-mono">{refundPaymentId}</strong>. 
                This action will instantly reverse the payment ledger state, notify the client, and create an immutable record in the security audit log.
              </div>

              {/* Refund Reason Textarea */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  Refund Reason <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Provide detailed explanation for this reversal (e.g. Double-billing error resolved, customer cancellation)..."
                  rows={4}
                  className="w-full text-xs font-sans p-3 rounded-lg border border-border/40 bg-secondary/10 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/25 resize-none"
                  required
                />
              </div>

              {refundError && (
                <div className="p-3 text-xs text-rose-600 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>{refundError}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 bg-secondary/15 border-t border-border/40 flex justify-end gap-2.5">
              <button
                onClick={handleCloseRefundModal}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-secondary/40 text-muted-foreground transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRefund}
                disabled={isRefundingPayment || !refundReason.trim()}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRefundingPayment ? 'Processing...' : 'Confirm Full Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
