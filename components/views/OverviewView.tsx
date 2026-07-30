'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { usePlatformStats } from '@/lib/hooks/usePlatformStats';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useAuditLogs } from '@/lib/hooks/useAuditLogs';
import { useToast } from '@/components/ui/Toast';
import { resetDatabaseToSeed } from '@/lib/data/db';
import { motion } from 'motion/react';
import { AuditLogEntry } from '@/lib/types';
import { 
  Building2, 
  Users, 
  Sparkles, 
  TrendingUp, 
  IndianRupee, 
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Trophy,
  Calendar,
  Clock,
  ExternalLink,
  ChevronRight
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
import { format } from 'date-fns';

export default function OverviewPlaceholder() {
  const { stats, isLoading, isError, refetch } = usePlatformStats();
  const { admin } = useCurrentAdmin();
  const { logs } = useAuditLogs();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleResetData = () => {
    resetDatabaseToSeed();
    queryClient.invalidateQueries();
    toast('Demo Data Reset', 'The platform mock database has been restored to default seed values.', 'success');
  };

  // Color mapping for contest status donut
  const CONTEST_STATUS_COLORS: Record<string, string> = {
    DRAFT: '#64748b',             // Slate
    PUBLISHED: '#0284c7',         // Sky
    REGISTRATION_CLOSED: '#d97706',// Amber
    LIVE: '#ef4444',              // Red
    EVALUATION: '#8b5cf6',        // Purple
    RESULTS_OUT: '#10b981',       // Emerald
    COMPLETED: '#0d9488',         // Teal
    CANCELLED: '#ec4899',         // Pink
  };

  // Prepare contest status pie data
  const contestStatusData = stats?.contests.statusBreakdown
    ? Object.entries(stats.contests.statusBreakdown)
        .map(([status, count]) => ({
          name: status.replace('_', ' '),
          rawStatus: status,
          value: count,
        }))
        .filter(item => item.value > 0)
    : [];

  // Render Skeleton Loader while stats query is pending
  if (isLoading) {
    return (
      <div className="space-y-6 font-sans animate-pulse">

        {/* KPI Grid Skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-card rounded-xl border border-border/30 p-6 flex justify-between items-center">
              <div className="space-y-3">
                <div className="h-3 w-20 bg-secondary/60 rounded" />
                <div className="h-8 w-24 bg-secondary rounded" />
                <div className="h-2.5 w-32 bg-secondary/40 rounded" />
              </div>
              <div className="h-12 w-12 rounded-xl bg-secondary/50" />
            </div>
          ))}
        </div>

        {/* Charts Grid Skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 h-80 bg-card rounded-xl border border-border/30 p-6 space-y-4">
            <div className="h-4 w-40 bg-secondary rounded" />
            <div className="h-2.5 w-60 bg-secondary/60 rounded" />
            <div className="h-52 bg-secondary/20 rounded" />
          </div>
          <div className="lg:col-span-2 h-80 bg-card rounded-xl border border-border/30 p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="h-4 w-32 bg-secondary rounded" />
              <div className="h-2.5 w-48 bg-secondary/60 rounded" />
            </div>
            <div className="h-32 w-32 mx-auto rounded-full border-8 border-secondary" />
            <div className="h-4 w-full bg-secondary/30 rounded" />
          </div>
        </div>

        {/* Tables & Feeds Skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 h-96 bg-card rounded-xl border border-border/30 p-6 space-y-4">
            <div className="h-4 w-36 bg-secondary rounded" />
            <div className="space-y-3 pt-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-14 bg-secondary/25 rounded-lg" />
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 h-96 bg-card rounded-xl border border-border/30 p-6 space-y-4">
            <div className="h-4 w-44 bg-secondary rounded" />
            <div className="space-y-3 pt-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-14 bg-secondary/25 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] border border-dashed border-border/55 rounded-xl bg-card p-8 text-center space-y-4">
        <div className="p-3 bg-destructive/10 rounded-full text-destructive">
          <RotateCcw className="h-8 w-8 animate-spin" />
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-lg text-foreground">Error Loading Platform Metrics</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            We encountered a problem fetching the aggregate system metrics from our secure datastore.
          </p>
        </div>
        <button 
          onClick={() => refetch()} 
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/95 transition-all shadow-sm"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  // Calculate status percentages for small trends
  const activePercent = stats.organizations.total > 0 
    ? Math.round((stats.organizations.active / stats.organizations.total) * 100) 
    : 0;

  const getLogDetailsString = (log: AuditLogEntry) => {
    switch (log.action) {
      case 'org.suspended':
        return `Suspended organization "${log.targetLabel}" due to: ${log.metadata?.reason || 'No reason provided'}`;
      case 'org.activated':
        return `Reactivated organization "${log.targetLabel}"`;
      case 'org.edited':
        return `Updated profile details for organization "${log.targetLabel}"`;
      case 'org.note_added':
        return `Added operational support note to organization "${log.targetLabel}"`;
      case 'plan.created':
        return `Created new subscription plan "${log.targetLabel}"`;
      case 'plan.updated':
        return `Updated features or limits for plan "${log.targetLabel}"`;
      case 'org.plan_changed':
        return `Changed subscription plan for "${log.targetLabel}" from ${log.metadata?.oldPlanId || 'N/A'} to ${log.metadata?.newPlanId || 'N/A'}`;
      case 'override.added':
        return `Added subscription override for "${log.targetLabel}" (${log.metadata?.field}: ${log.metadata?.value})`;
      case 'override.removed':
        return `Removed subscription override for "${log.targetLabel}" (${log.metadata?.field})`;
      case 'payment.refunded':
        return `Issued refund of ₹${log.metadata?.amount || '0'} for participant ${log.metadata?.participantName || ''} on contest "${log.targetLabel}"`;
      case 'org.impersonated':
        return `Initiated impersonation session for organization "${log.targetLabel}"`;
      case 'org.impersonation_ended':
        return `Terminated impersonation session for organization "${log.targetLabel}"`;
      default:
        return `Executed action "${log.action}" on ${log.targetType} "${log.targetLabel}"`;
    }
  };

  const isImpersonating = typeof window !== 'undefined' && !!localStorage.getItem('quizbuzz_impersonated_org_id');
  const impersonatedOrgName = typeof window !== 'undefined' ? localStorage.getItem('quizbuzz_impersonated_org_name') : null;

  return (
    <div id="overview-dashboard-view" className="space-y-6 font-sans">
      


      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Organizations */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm flex items-center justify-between hover:shadow-md transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Organizations</p>
            <h3 className="text-3xl font-bold font-mono tracking-tight text-foreground">{stats.organizations.total}</h3>
            <p className="text-[10px] text-muted-foreground">
              <span className="text-success font-semibold font-mono">{stats.organizations.active} active</span> ({activePercent}%) • <span className="text-destructive font-semibold font-mono">{stats.organizations.suspended} suspended</span>
            </p>
          </div>
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <Building2 className="h-6 w-6" />
          </div>
        </div>

        {/* Total Contests */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm flex items-center justify-between hover:shadow-md transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Contests</p>
            <h3 className="text-3xl font-bold font-mono tracking-tight text-foreground">{stats.contests.total}</h3>
            <p className="text-[10px] text-muted-foreground">
              <span className="text-rose-500 font-semibold font-mono">{stats.contests.statusBreakdown.LIVE} live</span> • <span className="text-blue-500 font-semibold font-mono">{stats.contests.statusBreakdown.PUBLISHED} scheduled</span>
            </p>
          </div>
          <div className="p-3 bg-amber/10 rounded-xl text-amber-600">
            <Trophy className="h-6 w-6" />
          </div>
        </div>

        {/* Total Participants */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm flex items-center justify-between hover:shadow-md transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Participants</p>
            <h3 className="text-3xl font-bold font-mono tracking-tight text-foreground">{stats.participants.total.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] text-muted-foreground">
              Aggregated lifetime contest submissions
            </p>
          </div>
          <div className="p-3 bg-accent/10 rounded-xl text-accent-foreground">
            <Users className="h-6 w-6" />
          </div>
        </div>

        {/* Total Revenue */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm flex items-center justify-between hover:shadow-md transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Revenue</p>
            <h3 className="text-3xl font-bold font-mono tracking-tight text-foreground flex items-baseline">
              <IndianRupee className="h-5 w-5 mr-0.5" />
              {stats.revenue.totalAllTime.toLocaleString('en-IN')}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              <span className="text-success font-semibold font-mono">₹{stats.revenue.thisMonth.toLocaleString('en-IN')}</span> this month (MRR + entry)
            </p>
          </div>
          <div className="p-3 bg-success/10 rounded-xl text-success">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* Growth Trend Area Chart */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm lg:col-span-3 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-semibold text-foreground text-sm font-sans">Organizations Growth Trend</h3>
              <p className="text-[11px] text-muted-foreground">Weekly cumulative signups of QuizBuzz customer tenants over the last 12 weeks</p>
            </div>
          </div>
          
          <div className="h-64 w-full text-xs font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.growthTrend} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOrgs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="week" stroke="var(--muted-foreground)" opacity={0.6} tickLine={false} />
                <YAxis stroke="var(--muted-foreground)" opacity={0.6} tickLine={false} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ 
                    background: 'var(--card)', 
                    borderColor: 'var(--border)', 
                    borderRadius: '8px',
                    color: 'var(--foreground)'
                  }} 
                />
                <Area type="monotone" dataKey="orgs" name="Signups" stroke="var(--primary)" fillOpacity={1} fill="url(#colorOrgs)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Contests by Status Donut Chart */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm lg:col-span-2 flex flex-col justify-between">
          <div className="mb-2">
            <h3 className="font-semibold text-foreground text-sm font-sans">Contests by Status</h3>
            <p className="text-[11px] text-muted-foreground">Distribution of active and historical quizzes across all tenants</p>
          </div>

          <div className="h-64 w-full flex flex-col justify-center text-xs">
            <div className="h-44 w-full relative">
              {contestStatusData.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  No contest records found
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={contestStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {contestStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CONTEST_STATUS_COLORS[entry.rawStatus] || '#94a3b8'} />
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

            {/* Custom Legend */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 max-h-24 overflow-y-auto px-1 custom-scrollbar">
              {contestStatusData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <span 
                    className="h-2.5 w-2.5 rounded-full shrink-0" 
                    style={{ backgroundColor: CONTEST_STATUS_COLORS[entry.rawStatus] || '#94a3b8' }} 
                  />
                  <span className="truncate">{entry.name}</span>
                  <span className="font-mono ml-auto font-bold text-foreground/80">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Upcoming Contests Table & Recently Created Orgs List */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* Upcoming Contests (Next 7 Days) */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm lg:col-span-3 space-y-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-foreground text-sm font-sans flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" /> Upcoming Contests (Next 7 days)
              </h3>
              <p className="text-[11px] text-muted-foreground">Global schedule of quizzes with registrations open or about to commence</p>
            </div>
            <button
              onClick={() => router.push('/dashboard/organizations')}
              className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-0.5 hover:underline"
            >
              <span>View Tenants</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="grow mt-2 min-h-[220px] overflow-x-auto">
            {stats.upcomingContests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[220px] text-center p-4 border border-dashed border-border/30 rounded-lg bg-secondary/10">
                <Clock className="h-6 w-6 text-muted-foreground mb-1.5 animate-pulse" />
                <span className="text-xs font-semibold text-muted-foreground">No upcoming quizzes scheduled</span>
                <span className="text-[10px] text-muted-foreground/75 mt-0.5">Tenant organizations have no quizzes in the next 7 days</span>
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground">
                    <th className="pb-2 font-semibold">Quiz Title</th>
                    <th className="pb-2 font-semibold">Organization</th>
                    <th className="pb-2 font-semibold">Scheduled Date</th>
                    <th className="pb-2 font-semibold text-right">Participants</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/35">
                  {stats.upcomingContests.map((c) => (
                    <tr key={c.id} className="hover:bg-secondary/20 transition-all">
                      <td className="py-2.5 font-medium text-foreground max-w-[150px] truncate">{c.title}</td>
                      <td className="py-2.5">
                        <button
                          onClick={() => router.push(`/dashboard/organizations?orgId=${c.orgId}`)}
                          className="hover:underline text-primary/95 text-[11px] font-semibold text-left max-w-[120px] truncate block flex items-center gap-0.5"
                        >
                          {c.orgName} <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {format(new Date(c.startTime), 'dd MMM, hh:mm a')}
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-foreground/80">{c.participantCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recently Created Organizations */}
        <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm lg:col-span-2 space-y-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-foreground text-sm font-sans flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-primary" /> Newly Registered Tenants
              </h3>
              <p className="text-[11px] text-muted-foreground">The five most recent organizations onboarded to QuizBuzz</p>
            </div>
          </div>

          <div className="grow space-y-2 mt-2">
            {stats.recentOrganizations.map((o) => (
              <div 
                key={o.id} 
                className="flex items-center justify-between p-2.5 rounded-lg border border-border/20 bg-secondary/10 hover:bg-secondary/20 hover:border-border/50 transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img 
                    src={o.logoUrl} 
                    alt={o.name} 
                    className="h-8 w-8 rounded bg-background border border-border/30 object-contain p-0.5"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-foreground block truncate max-w-[160px]">{o.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono uppercase block">{o.planId.replace('plan_', '')}</span>
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/dashboard/organizations?orgId=${o.id}`)}
                  className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-card hover:border hover:border-border/30 transition-all shrink-0 cursor-pointer flex items-center text-[10px] font-semibold gap-0.5"
                >
                  <span>View</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Logs block */}
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-foreground text-sm font-sans">Recent Security Logs</h3>
            <p className="text-[11px] text-muted-foreground">Latest administrator operations recorded in audit ledger</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/audit-log')}
            className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-0.5 hover:underline"
          >
            <span>Audit Ledger</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-3">
          {logs.slice(0, 3).map((log) => (
            <div 
              key={log.id} 
              className="text-xs p-3 border border-border/30 bg-secondary/20 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-border/60 transition-all font-sans"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{log.actorAdminName}</span>
                  <span className="px-1.5 py-0.5 rounded bg-muted text-[9px] font-bold font-mono text-muted-foreground uppercase">
                    {log.actorAdminRole.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-muted-foreground leading-normal text-[11px]">{getLogDetailsString(log)}</p>
              </div>
              <span className="text-[10px] text-muted-foreground/80 font-mono shrink-0">
                {format(new Date(log.createdAt), 'dd MMM yyyy HH:mm')}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
