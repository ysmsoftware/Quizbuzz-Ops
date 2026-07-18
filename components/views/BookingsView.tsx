'use client';

import React, { useState, useEffect } from 'react';
import { 
  CalendarClock, 
  Search, 
  Filter, 
  X, 
  Plus, 
  ArrowLeft, 
  CheckCircle2, 
  Lock, 
  Trash2, 
  Clock, 
  Coins, 
  User, 
  Mail, 
  Tag, 
  Check, 
  Loader2, 
  Ban,
  Activity,
  ServerCrash,
  ChevronRight,
  Database,
  Building2,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useBookings, useBookingDetail } from '@/lib/hooks/useBookings';
import { useOrganizations } from '@/lib/hooks/useOrganizations';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { ContestBooking } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

export default function BookingsView() {
  const { toast } = useToast();
  const { admin } = useCurrentAdmin();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingIdFromUrl = searchParams.get('bookingId');
  const { organizations = [] } = useOrganizations({ limit: 1000 });
  const { bookings, isLoading: listLoading, refetch } = useBookings();

  // Selected Booking state (determines list vs detail view)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilterMode, setDateFilterMode] = useState<'all' | 'quoted' | 'scheduled'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals/Dialogs states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisioningProgress, setProvisioningProgress] = useState(0);
  const [provisioningMessage, setProvisioningMessage] = useState('');

  // Payment form states
  const [paymentMethod, setPaymentMethod] = useState('Credit Card (Stripe)');
  const [paymentRef, setPaymentRef] = useState('');

  // Cancellation form states
  const [cancellationReason, setCancellationReason] = useState('');

  // Read the booking to auto-open from the ?bookingId= URL query param
  useEffect(() => {
    if (bookingIdFromUrl) {
      setSelectedBookingId(bookingIdFromUrl);
    }
  }, [bookingIdFromUrl]);

  // Selected Booking Detail Query
  const { 
    booking, 
    isLoading: detailLoading, 
    updateStatus, 
    isUpdatingStatus 
  } = useBookingDetail(selectedBookingId);

  // Map organization name for bookings
  const getOrgNameForBooking = (b: ContestBooking) => {
    if (b.organizationId) {
      const matched = organizations.find((o) => o.id === b.organizationId);
      return matched ? matched.name : `Tenant ID: ${b.organizationId}`;
    }
    return b.organizationName || 'Individual Client';
  };

  const getOrgEmailForBooking = (b: ContestBooking) => {
    if (b.organizationId) {
      const matched = organizations.find((o) => o.id === b.organizationId);
      return matched ? matched.ownerEmail || matched.contactPerson?.email || 'N/A' : 'N/A';
    }
    return b.organizationEmail || 'N/A';
  };

  // Run Simulated Provisioning Sequence
  const handleProvisionContest = async () => {
    if (!booking) return;
    setIsProvisioning(true);
    setProvisioningProgress(0);

    const steps = [
      { prg: 15, msg: 'Initializing isolated Docker container instances...' },
      { prg: 35, msg: 'Provisioning multi-sharded Redis / ElastiCache node clusters...' },
      { prg: 65, msg: 'Setting up security rules & question processing worker pipelines...' },
      { prg: 90, msg: 'Synchronizing client workspace & verifying platform health API status...' },
      { prg: 100, msg: 'Active compute nodes successfully launched and registered!' }
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, i === 0 ? 300 : 450));
      setProvisioningProgress(steps[i].prg);
      setProvisioningMessage(steps[i].msg);
    }

    try {
      await updateStatus({
        status: 'provisioned',
        details: {
          adminName: admin?.name || 'System Operator',
          adminRole: admin?.role,
        }
      });
      toast('Cluster Launched', `Contest "${booking.contestName}" has been successfully provisioned.`, 'success');
    } catch (e: any) {
      toast('Provisioning Error', e.message || 'Failed to complete cluster provisioning.', 'error');
    } finally {
      setIsProvisioning(false);
      setProvisioningProgress(0);
      setProvisioningMessage('');
    }
  };

  // Submit Payment Record
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking || !paymentRef.trim()) {
      toast('Reference Required', 'Please enter a payment reference to reconcile ledger.', 'warning');
      return;
    }

    try {
      await updateStatus({
        status: 'paid',
        details: {
          paymentMethod,
          paymentReference: paymentRef.trim(),
          adminName: admin?.name || 'System Operator',
          adminRole: admin?.role,
        }
      });
      toast('Payment Applied', `Successfully reconciled ₹${booking.pricingBreakdown.total.toLocaleString('en-IN')} via ${paymentMethod}.`, 'success');
      setShowPaymentModal(false);
      setPaymentRef('');
    } catch (err: any) {
      toast('Reconciliation Failed', err.message || 'Failed to update ledger status.', 'error');
    }
  };

  // Submit Booking Cancellation
  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking || !cancellationReason.trim()) {
      toast('Reason Required', 'Under compliance rules, you must enter a reason to cancel an active contract.', 'warning');
      return;
    }

    try {
      await updateStatus({
        status: 'cancelled',
        details: {
          cancellationReason: cancellationReason.trim(),
          adminName: admin?.name || 'System Operator',
          adminRole: admin?.role,
        }
      });
      toast('Booking Terminated', `Booking quote for "${booking.contestName}" has been cancelled.`, 'info');
      setShowCancelModal(false);
      setCancellationReason('');
    } catch (err: any) {
      toast('Cancellation Failed', err.message || 'Failed to cancel the booking.', 'error');
    }
  };

  // Complete Transition (provisioned -> completed)
  const handleMarkCompleted = async () => {
    if (!booking) return;
    try {
      await updateStatus({
        status: 'completed',
        details: {
          adminName: admin?.name || 'System Operator',
          adminRole: admin?.role,
        }
      });
      toast('Contest Completed', 'The on-demand contest was flagged as completed. SLA fully met.', 'success');
    } catch (e: any) {
      toast('Update Failed', e.message || 'Failed to complete contest.', 'error');
    }
  };

  // Filtering Logic
  const filteredBookings = bookings.filter((b) => {
    // 1. Search Query
    const searchTarget = `${b.contestName} ${getOrgNameForBooking(b)} ${getOrgEmailForBooking(b)}`.toLowerCase();
    if (searchQuery && !searchTarget.includes(searchQuery.toLowerCase())) {
      return false;
    }

    // 2. Status Filter
    if (statusFilter !== 'all' && b.status !== statusFilter) {
      return false;
    }

    // 3. Date Filter Range
    if (startDate || endDate) {
      const checkDateStr = dateFilterMode === 'scheduled' ? b.desiredStartTime : b.quotedAt;
      if (!checkDateStr) return false;
      const checkTime = new Date(checkDateStr).getTime();

      if (startDate) {
        const startSecs = new Date(startDate).getTime();
        if (checkTime < startSecs) return false;
      }
      if (endDate) {
        // Include full day
        const endSecs = new Date(endDate).getTime() + 86400000;
        if (checkTime > endSecs) return false;
      }
    }

    return true;
  });

  // Helpers for Status Colors
  const getStatusBadge = (status: ContestBooking['status']) => {
    const configs: Record<ContestBooking['status'], { label: string; style: string }> = {
      quoted: { label: 'Quoted', style: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
      paid: { label: 'Paid', style: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-bold' },
      provisioned: { label: 'Provisioned', style: 'bg-amber-500/10 text-amber-500 border-amber-500/20 font-bold' },
      completed: { label: 'Completed', style: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
      cancelled: { label: 'Cancelled', style: 'bg-destructive/10 text-destructive border-destructive/20' },
    };

    const config = configs[status] || { label: status, style: 'bg-secondary text-muted-foreground' };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${config.style}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      <AnimatePresence mode="wait">
        {!selectedBookingId ? (
          /* PAGE 2: BOOKINGS LIST VIEW */
          <motion.div
            key="list-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            {/* Header Title with Shortcut Button */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-border/40 select-none">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Phase 4 • On-Demand Accounts
                </span>
                <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
                  <CalendarClock className="h-6 w-6 text-amber-500" /> Contest Bookings Log
                </h1>
              </div>

              <button
                id="bookings-new-quote-btn"
                onClick={() => router.push('/dashboard/calculator')}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-black flex items-center gap-1.5 cursor-pointer shadow active:scale-[0.98] transition-all"
              >
                <Plus className="h-4 w-4" /> New Booking Quote
              </button>
            </div>

            {/* Filter Deck */}
            <div className="bg-card border border-border/50 rounded-xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end select-none">
              {/* Search text input */}
              <div className="md:col-span-4 space-y-1.5">
                <label htmlFor="booking-search-input" className="text-xs font-bold text-foreground">Search Records</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    id="booking-search-input"
                    type="text"
                    placeholder="Search by contest, client org, email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-10 pl-9 pr-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Status Select */}
              <div className="md:col-span-2 space-y-1.5">
                <label htmlFor="booking-status-select" className="text-xs font-bold text-foreground">Status Filter</label>
                <select
                  id="booking-status-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full h-10 px-3 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-muted-foreground"
                >
                  <option value="all">Show All Statuses</option>
                  <option value="quoted">Quoted</option>
                  <option value="paid">Paid</option>
                  <option value="provisioned">Provisioned</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Date Filter Target Mode */}
              <div className="md:col-span-2 space-y-1.5">
                <label htmlFor="booking-date-mode-select" className="text-xs font-bold text-foreground">Date Context</label>
                <select
                  id="booking-date-mode-select"
                  value={dateFilterMode}
                  onChange={(e) => setDateFilterMode(e.target.value as any)}
                  className="w-full h-10 px-3 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-muted-foreground"
                >
                  <option value="all">Created (Quoted) Date</option>
                  <option value="scheduled">Scheduled Start Time</option>
                </select>
              </div>

              {/* Date Inputs Range */}
              <div className="md:col-span-4 grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label htmlFor="booking-start-date" className="text-xs font-bold text-foreground">From Date</label>
                  <input
                    id="booking-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-10 px-2 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-muted-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="booking-end-date" className="text-xs font-bold text-foreground">To Date</label>
                  <input
                    id="booking-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full h-10 px-2 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-muted-foreground"
                  />
                </div>
              </div>
            </div>

            {/* Bookings Table / List Card */}
            <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
              {listLoading ? (
                <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                  <p className="text-xs">Fetching dynamic administrative bookings ledger...</p>
                </div>
              ) : filteredBookings.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/40 bg-secondary/15 select-none text-muted-foreground font-bold">
                        <th className="p-4">Contest & Client</th>
                        <th className="p-4">Desired Schedule</th>
                        <th className="p-4 text-right">Candidates</th>
                        <th className="p-4 text-right">Contract Value</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Created On</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filteredBookings.map((b) => (
                        <tr 
                          key={b.id}
                          className="hover:bg-secondary/15 transition-colors cursor-pointer"
                          onClick={() => setSelectedBookingId(b.id)}
                        >
                          {/* Contest & Client */}
                          <td className="p-4">
                            <div className="font-bold text-foreground hover:text-amber-500 transition-colors">
                              {b.contestName}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                              <Building2 className="h-3 w-3 shrink-0" /> {getOrgNameForBooking(b)}
                            </div>
                          </td>

                          {/* Desired schedule */}
                          <td className="p-4 text-muted-foreground">
                            {b.desiredStartTime ? (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 text-amber-500/80 shrink-0" />
                                <span>{new Date(b.desiredStartTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                              </div>
                            ) : (
                              <span className="italic text-muted-foreground/50">unscheduled / instant run</span>
                            )}
                          </td>

                          {/* Candidate size */}
                          <td className="p-4 text-right font-mono text-muted-foreground">
                            {b.participantCount.toLocaleString('en-IN')}
                          </td>

                          {/* Contract Value */}
                          <td className="p-4 text-right font-bold text-foreground font-mono">
                            ₹{b.pricingBreakdown.total.toLocaleString('en-IN')}
                          </td>

                          {/* Status */}
                          <td className="p-4">
                            {getStatusBadge(b.status)}
                          </td>

                          {/* Quoted at */}
                          <td className="p-4 text-muted-foreground font-mono text-[10px]">
                            {new Date(b.quotedAt).toLocaleDateString('en-IN')}
                          </td>

                          {/* Actions */}
                          <td className="p-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBookingId(b.id);
                              }}
                              className="px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:text-amber-500 hover:bg-secondary/50 rounded-md transition-all inline-flex items-center gap-1 cursor-pointer"
                            >
                              Manage <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-16 text-center space-y-3">
                  <Coins className="h-10 w-10 mx-auto text-muted-foreground/40 animate-pulse" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-foreground">No bookings located</p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Adjust your search terms or status criteria, or generate a fresh cost proposal estimate.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          /* PAGE 3: BOOKING DETAIL VIEW */
          <motion.div
            key="detail-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            {/* Back to list and Actions Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-b-border/40 select-none">
              <button
                onClick={() => setSelectedBookingId(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-md border border-border/50 hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Return to bookings list
              </button>

              {booking && (
                <div className="flex flex-wrap gap-2">
                  {/* Cancel Button (any non-terminal status: quoted, paid, provisioned) */}
                  {['quoted', 'paid', 'provisioned'].includes(booking.status) && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="h-9 px-3.5 text-xs font-bold rounded-lg border border-destructive/30 bg-destructive/10 hover:bg-destructive/15 text-destructive hover:text-destructive flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Ban className="h-3.5 w-3.5" /> Cancel Contract
                    </button>
                  )}

                  {/* Transition: Quoted -> Reconcile Paid */}
                  {booking.status === 'quoted' && (
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      className="h-9 px-4 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black flex items-center gap-1.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                    >
                      <Coins className="h-3.5 w-3.5" /> Mark as Paid (Ledger)
                    </button>
                  )}

                  {/* Transition: Paid -> Launch Provision Container */}
                  {booking.status === 'paid' && (
                    <button
                      onClick={handleProvisionContest}
                      disabled={isProvisioning}
                      className="h-9 px-4 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-black flex items-center gap-1.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                    >
                      {isProvisioning ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Provisioning container...</span>
                        </>
                      ) : (
                        <>
                          <Database className="h-3.5 w-3.5" />
                          <span>Provision Contest Stack</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Transition: Provisioned -> Mark Completed */}
                  {booking.status === 'provisioned' && (
                    <button
                      onClick={handleMarkCompleted}
                      className="h-9 px-4 text-xs font-bold rounded-lg bg-slate-500 hover:bg-slate-600 text-white flex items-center gap-1.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark Completed (SLA Met)
                    </button>
                  )}
                </div>
              )}
            </div>

            {detailLoading || !booking ? (
              <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                <p className="text-xs">Accessing isolated booking parameters...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. Header Banner & Status Stepper */}
                <div className="bg-card border border-border/50 rounded-xl p-6 space-y-6 shadow-sm">
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-border/40 pb-4 select-none">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-border/40">
                          ID: {booking.id}
                        </span>
                        {getStatusBadge(booking.status)}
                      </div>
                      <h2 className="text-xl font-black text-foreground mt-2 tracking-tight">
                        {booking.contestName}
                      </h2>
                    </div>

                    <div className="text-left md:text-right text-xs">
                      <span className="text-muted-foreground block">Proposed Contract Contract Value:</span>
                      <span className="text-2xl font-black text-amber-500 font-mono mt-0.5 block">
                        ₹{booking.pricingBreakdown.total.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  {/* Status Stepper Progression */}
                  <div className="py-2 select-none">
                    {booking.status === 'cancelled' ? (
                      /* Cancelled Alternate Timeline Banner */
                      <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-3.5 flex items-start gap-2.5 max-w-2xl">
                        <Ban className="h-5 w-5 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <h4 className="text-xs font-bold leading-none">Contract Terminated Abruptly</h4>
                          <p className="text-xs leading-normal opacity-85">
                            This contract was marked as CANCELLED on {booking.cancelledAt ? new Date(booking.cancelledAt).toLocaleString('en-IN') : 'N/A'}. All scheduled resources, dedicated database caches, and human-proctor assignments are revoked.
                          </p>
                          {booking.cancellationReason && (
                            <p className="text-xs font-mono bg-background/50 p-2 rounded border border-destructive/10 mt-2 text-foreground">
                              <strong>Reason specified:</strong> "{booking.cancellationReason}"
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Regular 4-Step Stepper */
                      <div className="max-w-3xl">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-4">
                          SLA Service Progression Timestamps
                        </h4>
                        <div className="grid grid-cols-4 gap-2 relative">
                          {/* Linear visual thread line under icons */}
                          <div className="absolute top-[18px] left-[10%] right-[10%] h-0.5 bg-border/40 -z-10" />

                          {[
                            { stepId: 'quoted', label: '1. Quoted', time: booking.quotedAt },
                            { stepId: 'paid', label: '2. Paid Reconciled', time: booking.paidAt },
                            { stepId: 'provisioned', label: '3. Cluster Provisioned', time: booking.provisionedAt },
                            { stepId: 'completed', label: '4. Service Finalized', time: booking.status === 'completed' ? new Date().toISOString() : null }, // Just a mock complete schedule representation
                          ].map((step, idx) => {
                            const statuses = ['quoted', 'paid', 'provisioned', 'completed'];
                            const currentIdx = statuses.indexOf(booking.status);
                            const stepIdx = statuses.indexOf(step.stepId);

                            const isPassed = stepIdx <= currentIdx;
                            const isActive = stepIdx === currentIdx;

                            return (
                              <div key={step.stepId} className="flex flex-col items-center text-center space-y-1.5">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${
                                  isPassed
                                    ? 'bg-amber-500 border-amber-500 text-black shadow-sm font-bold'
                                    : 'bg-card border-border/60 text-muted-foreground/60'
                                }`}>
                                  {isPassed && !isActive ? (
                                    <Check className="h-4.5 w-4.5 stroke-[3]" />
                                  ) : (
                                    <span className="text-[11px] font-bold font-mono">{idx + 1}</span>
                                  )}
                                </div>
                                <span className={`text-[10px] font-bold leading-none ${isActive ? 'text-amber-500' : isPassed ? 'text-foreground' : 'text-muted-foreground/70'}`}>
                                  {step.label}
                                </span>
                                {step.time ? (
                                  <span className="text-[9px] text-muted-foreground/80 font-mono">
                                    {new Date(step.time).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-muted-foreground/30 font-mono italic">pending...</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Split Columns Details & Cost Card */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* LEFT: Parameters, Client & SLA log */}
                  <div className="lg:col-span-7 space-y-6">
                    {/* Client Information */}
                    <div className="bg-card border border-border/50 rounded-xl p-5 space-y-4">
                      <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5 select-none">
                        <Building2 className="h-4 w-4 text-amber-500" /> Client Organization Details
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground block leading-none">Organization:</span>
                          <span className="text-xs font-bold text-foreground block pt-1">{getOrgNameForBooking(booking)}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground block leading-none">Contact Person/Email:</span>
                          <span className="text-xs font-semibold text-foreground block pt-1">{getOrgEmailForBooking(booking)}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground block leading-none">Event Schedule Slot:</span>
                          <span className="text-xs font-semibold text-foreground block pt-1">
                            {booking.desiredStartTime ? (
                              <span className="flex items-center gap-1 text-amber-500 font-bold">
                                <Calendar className="h-3.5 w-3.5 shrink-0" />
                                {new Date(booking.desiredStartTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                            ) : (
                              <span className="italic text-muted-foreground/60">On-demand / Quick launch</span>
                            )}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground block leading-none">Created Operator Representative:</span>
                          <span className="text-xs font-semibold text-foreground block pt-1 font-mono text-muted-foreground">
                            {booking.createdByAdminName || 'Platform Automator'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Technical execution scale metrics */}
                    <div className="bg-card border border-border/50 rounded-xl p-5 space-y-4">
                      <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5 select-none">
                        <Activity className="h-4 w-4 text-amber-500" /> Infrastructure Scale Configurations
                      </h3>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-3 bg-secondary/10 border border-border/40 rounded-lg text-center space-y-1">
                          <span className="text-[9px] text-muted-foreground block uppercase leading-none">Duration</span>
                          <span className="text-sm font-black font-mono text-foreground block">{booking.durationMinutes} Mins</span>
                        </div>
                        <div className="p-3 bg-secondary/10 border border-border/40 rounded-lg text-center space-y-1">
                          <span className="text-[9px] text-muted-foreground block uppercase leading-none">Questions</span>
                          <span className="text-sm font-black font-mono text-foreground block">{booking.questionCount} Units</span>
                        </div>
                        <div className="p-3 bg-secondary/10 border border-border/40 rounded-lg text-center space-y-1">
                          <span className="text-[9px] text-muted-foreground block uppercase leading-none">Candidates</span>
                          <span className="text-sm font-black font-mono text-amber-500 block">{(booking.participantCount).toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      {/* Add-ons Checklist */}
                      <div className="pt-2 select-none">
                        <span className="text-[10px] text-muted-foreground block font-bold mb-2">Activated Premium Service Add-ons</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                          <div className={`p-2.5 rounded-lg border flex items-center gap-1.5 ${
                            booking.addOnsSelected.proctoring 
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 font-bold' 
                              : 'bg-secondary/10 border-border/40 text-muted-foreground/60'
                          }`}>
                            <Check className={`h-3.5 w-3.5 shrink-0 ${booking.addOnsSelected.proctoring ? 'text-amber-500' : 'text-muted-foreground/30'}`} />
                            <span>AI Proctoring</span>
                          </div>

                          <div className={`p-2.5 rounded-lg border flex items-center gap-1.5 ${
                            booking.addOnsSelected.certificates 
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 font-bold' 
                              : 'bg-secondary/10 border-border/40 text-muted-foreground/60'
                          }`}>
                            <Check className={`h-3.5 w-3.5 shrink-0 ${booking.addOnsSelected.certificates ? 'text-amber-500' : 'text-muted-foreground/30'}`} />
                            <span>Certificates branding</span>
                          </div>

                          <div className={`p-2.5 rounded-lg border flex items-center gap-1.5 ${
                            booking.addOnsSelected.prioritySupport 
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 font-bold' 
                              : 'bg-secondary/10 border-border/40 text-muted-foreground/60'
                          }`}>
                            <Check className={`h-3.5 w-3.5 shrink-0 ${booking.addOnsSelected.prioritySupport ? 'text-amber-500' : 'text-muted-foreground/30'}`} />
                            <span>Priority SLA technician</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Payment Audit Logs (if paid) */}
                    {booking.paidAt && (
                      <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-5 space-y-3">
                        <h3 className="text-xs font-bold uppercase text-emerald-500 tracking-wider flex items-center gap-1.5 select-none">
                          <CheckCircle2 className="h-4 w-4" /> Financial Ledger Reconciled
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Settle Date:</span>
                            <span className="font-medium text-foreground block pt-0.5">{new Date(booking.paidAt).toLocaleString('en-IN')}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Method / Gate:</span>
                            <span className="font-bold text-emerald-500 block pt-0.5">{booking.paymentMethod}</span>
                          </div>
                          <div className="sm:col-span-2">
                            <span className="text-[10px] text-muted-foreground block">Compliance Reference Tag:</span>
                            <span className="font-mono text-foreground font-bold bg-secondary/50 p-1.5 rounded border border-border/40 block mt-1 select-all">{booking.paymentReference}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* RIGHT: Frozen breakdown card */}
                  <div className="lg:col-span-5 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                    <div className="bg-secondary/40 border-b border-border/50 px-5 py-4 select-none">
                      <h3 className="font-bold text-foreground text-xs uppercase tracking-widest flex items-center gap-1.5">
                        <Lock className="h-4 w-4 text-amber-500 shrink-0" /> Frozen Cost Breakdown
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-1">This proposal rate is locked and immune to setting updates.</p>
                    </div>

                    <div className="p-5 space-y-4">
                      <div className="space-y-3 border-b border-border/40 pb-4 text-xs text-muted-foreground">
                        {/* Base booking fee */}
                        <div className="flex justify-between leading-none">
                          <span>Base reservation fee:</span>
                          <span className="font-bold text-foreground">₹{booking.pricingBreakdown.baseFee.toLocaleString('en-IN')}</span>
                        </div>

                        {/* Compute */}
                        <div className="flex justify-between leading-none items-start">
                          <div className="space-y-0.5">
                            <span>Compute Overheads:</span>
                            <span className="block text-[9px] text-muted-foreground font-semibold">
                              (Capacity allocated for {booking.participantCount.toLocaleString('en-IN')} concurrent users)
                            </span>
                          </div>
                          <span className="font-bold text-foreground">₹{booking.pricingBreakdown.computeCost.toLocaleString('en-IN')}</span>
                        </div>

                        {/* Cache */}
                        <div className="flex justify-between leading-none">
                          <span>Cache session infrastructure:</span>
                          <span className="font-bold text-foreground">₹{booking.pricingBreakdown.cacheCost.toLocaleString('en-IN')}</span>
                        </div>

                        {/* Question */}
                        <div className="flex justify-between leading-none">
                          <span>Question processing pipelines:</span>
                          <span className="font-bold text-foreground">₹{booking.pricingBreakdown.questionCost.toLocaleString('en-IN')}</span>
                        </div>

                        {/* Add-ons */}
                        <div className="flex justify-between leading-none items-start">
                          <span>Activated premium add-ons:</span>
                          <span className="font-bold text-foreground">₹{booking.pricingBreakdown.addOnsCost.toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      {/* Subtotal and proposed total contract value */}
                      <div className="space-y-2 pb-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Subtotal cost:</span>
                          <span>₹{booking.pricingBreakdown.subtotal.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Markup SLA margin:</span>
                          <span>₹{booking.pricingBreakdown.margin.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 font-black rounded-lg flex justify-between items-center text-sm font-sans select-all">
                          <span>Contract Total (₹):</span>
                          <span className="font-mono text-base font-black">₹{booking.pricingBreakdown.total.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* RECONCILE PAYMENT COSMETIC DIALOG MODAL */}
      {showPaymentModal && booking && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border/50 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4 font-sans"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/40 select-none">
              <h3 className="font-bold text-emerald-500 text-sm flex items-center gap-1.5">
                <Coins className="h-4 w-4" /> Reconcile Cash Receipt
              </h3>
              <button 
                onClick={() => setShowPaymentModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div className="p-3.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-xs leading-relaxed text-muted-foreground select-none">
                Reconciliation updates booking ID <strong>{booking.id}</strong> status to <span className="text-emerald-500 font-bold uppercase font-mono">PAID</span>. This action registers contract capital on-ledger and activates container cluster provisioning pipelines.
              </div>

              {/* Amount preview */}
              <div className="flex justify-between text-xs select-none">
                <span>Contract Due Amount:</span>
                <span className="font-bold text-foreground">₹{booking.pricingBreakdown.total.toLocaleString('en-IN')}</span>
              </div>

              {/* Payment Method Select */}
              <div className="space-y-1.5">
                <label htmlFor="reconcile-payment-method" className="text-xs font-bold text-foreground">Payment Instrument Method</label>
                <select
                  id="reconcile-payment-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full h-10 px-3 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-muted-foreground"
                >
                  <option value="Credit Card (Stripe)">Credit Card (Stripe proxy)</option>
                  <option value="Razorpay">Razorpay API checkout</option>
                  <option value="Bank Transfer">Bank wire transaction</option>
                  <option value="Manual Ledger">Manual accounts receivable ledger</option>
                </select>
              </div>

              {/* Payment Reference Input */}
              <div className="space-y-1.5">
                <label htmlFor="reconcile-reference-input" className="text-xs font-bold text-foreground">Audit/Compliance Reference String <span className="text-destructive">*</span></label>
                <input
                  id="reconcile-reference-input"
                  type="text"
                  required
                  placeholder="e.g. TXN-928374-RAZORPAY"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground cursor-pointer"
                >
                  Abort Reconcile
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingStatus}
                  className="px-4 py-2 text-xs font-bold rounded-md bg-emerald-500 hover:bg-emerald-600 text-black shadow-sm cursor-pointer"
                >
                  {isUpdatingStatus ? 'Applying payment...' : 'Mark as Paid'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* CONTRACT CANCELLATION COMPLIANCE DIALOG MODAL */}
      {showCancelModal && booking && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border/50 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4 font-sans"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/40 select-none">
              <h3 className="font-bold text-destructive text-sm flex items-center gap-1.5">
                <Ban className="h-4 w-4" /> Terminate Active Contract
              </h3>
              <button 
                onClick={() => setShowCancelModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <div className="p-3.5 bg-destructive/5 border border-destructive/10 rounded-lg text-xs leading-relaxed text-muted-foreground select-none">
                🚫 <strong>Destructive Compliance Override:</strong> Cancelling contract ID <strong>{booking.id}</strong> releases all reserved containers, clears ElastiCache blocks, and marks state as <span className="text-destructive font-bold uppercase font-mono">CANCELLED</span>. This is irreversible.
              </div>

              {/* Cancellation Reason input */}
              <div className="space-y-1.5">
                <label htmlFor="cancel-reason-input" className="text-xs font-bold text-foreground">Cancellation compliance reason <span className="text-destructive">*</span></label>
                <textarea
                  id="cancel-reason-input"
                  required
                  rows={3}
                  placeholder="e.g. Budget constraints / client rescheduled slot to next quarter..."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="w-full p-3 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-muted-foreground leading-normal"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground cursor-pointer"
                >
                  Abort Cancellation
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingStatus}
                  className="px-4 py-2 text-xs font-bold rounded-md bg-destructive hover:bg-destructive/90 text-white shadow-sm cursor-pointer"
                >
                  {isUpdatingStatus ? 'Cancelling contract...' : 'Confirm Termination'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* CLUSTER PROVISIONING ACTIVE HARDWARE SIMULATOR MODAL */}
      {isProvisioning && (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border/50 shadow-2xl rounded-xl p-8 w-full max-w-lg space-y-6 text-center font-sans"
          >
            <div className="space-y-2">
              <Loader2 className="h-10 w-10 animate-spin text-amber-500 mx-auto" />
              <h3 className="font-black text-foreground text-base tracking-tight">Active Cluster Provisioning Sequence</h3>
              <p className="text-xs text-muted-foreground">Launching high-volume on-demand hosting resources.</p>
            </div>

            {/* Custom high-contrast progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[10px] font-mono font-bold select-none text-muted-foreground">
                <span>DOCKER & K8S ENGINE STATE</span>
                <span className="text-amber-500">{provisioningProgress}%</span>
              </div>
              <div className="w-full h-2 bg-secondary/50 rounded-full overflow-hidden border border-border/40">
                <div 
                  className="h-full bg-amber-500 rounded-full transition-all duration-300" 
                  style={{ width: `${provisioningProgress}%` }}
                />
              </div>
            </div>

            {/* Steps & active hardware logs console representation */}
            <div className="bg-secondary/40 border border-border/50 rounded-lg p-3 text-left font-mono text-[10px] text-muted-foreground select-none leading-relaxed min-h-[50px] flex items-center">
              <span className="text-amber-500 font-bold shrink-0 mr-1.5">❯</span>
              <span>{provisioningMessage}</span>
            </div>

            <div className="p-3 bg-secondary/20 rounded-lg text-[9px] text-muted-foreground leading-normal max-w-sm mx-auto">
              ⚠️ Do not interrupt this administrative turn or navigate away from the session. AWS resource initialization handles real-time concurrency configs.
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
