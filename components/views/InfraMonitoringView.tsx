'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOps } from '@/lib/hooks/useOps';
import { usePlatformStats } from '@/lib/hooks/usePlatformStats';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { 
  Server, 
  Cpu, 
  Database, 
  TrendingUp, 
  DollarSign, 
  Layers, 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  ArrowRight,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

export default function InfraMonitoringView() {
  const router = useRouter();
  const { infraStatus, isLoadingInfra, scalingConfig, isLoadingScaling } = useOps();
  const { stats, isLoading: isLoadingStats } = usePlatformStats();
  const { admin } = useCurrentAdmin();
  const [isCostBreakdownExpanded, setIsCostBreakdownExpanded] = useState(false);

  if (isLoadingInfra || isLoadingScaling || isLoadingStats || !infraStatus || !scalingConfig) {
    return (
      <div className="space-y-6 font-sans animate-pulse">
        {/* Banner skeleton */}
        <div className="h-32 bg-secondary/30 rounded-xl border border-border/30" />
        {/* KPI Grid skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-card rounded-xl border border-border/30" />
          ))}
        </div>
        {/* Configuration skeleton */}
        <div className="h-64 bg-card rounded-xl border border-border/30" />
      </div>
    );
  }

  // Format mode duration
  let modeDurationStr = 'unknown duration';
  try {
    const changeDate = parseISO(infraStatus.modeChangedAt);
    modeDurationStr = formatDistanceToNow(changeDate, { addSuffix: true });
  } catch (e) {
    console.error(e);
  }

  // Cost calculations
  const totalCost = infraStatus.estimatedMonthToDateCostUsd;
  const permCost = infraStatus.estimatedMonthToDateCostBreakdown.permanentInfra;
  const ephemCost = infraStatus.estimatedMonthToDateCostBreakdown.ephemeralInfra;
  const permPercent = totalCost > 0 ? (permCost / totalCost) * 100 : 0;
  const ephemPercent = totalCost > 0 ? (ephemCost / totalCost) * 100 : 0;

  // Render ElastiCache Status Badge
  const getCacheBadge = (status: typeof infraStatus.elastiCacheStatus) => {
    switch (status) {
      case 'not_provisioned':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-secondary text-muted-foreground border border-border/60">
            <span className="h-2 w-2 rounded-full bg-muted-foreground" />
            Not Provisioned
          </span>
        );
      case 'provisioning':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Provisioning
          </span>
        );
      case 'available':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            Available
          </span>
        );
      case 'destroying':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-500 border border-red-500/20">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            Destroying
          </span>
        );
      default:
        return <span className="text-xs text-muted-foreground">{status}</span>;
    }
  };

  return (
    <div className="space-y-8 font-sans max-w-7xl mx-auto pb-12">
      
      {/* 1. FRONT & CENTER MODE INDICATOR CARD */}
      <div 
        id="ops-infra-mode-banner"
        className={`relative overflow-hidden rounded-2xl border transition-all p-6 sm:p-8 ${
          infraStatus.mode === 'live' 
            ? 'bg-gradient-to-br from-amber-950/20 via-background to-background border-amber-500/30 shadow-lg shadow-amber-500/5'
            : 'bg-card border-border/40 shadow-sm'
        }`}
      >
        {/* Soft background decor */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-48 h-48 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                infraStatus.mode === 'live' ? 'bg-amber-500 text-amber-950' : 'bg-secondary text-muted-foreground'
              }`}>
                System Mode
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Updated {modeDurationStr}
              </span>
            </div>

            <div className="flex items-baseline gap-3">
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight flex items-center gap-3">
                {infraStatus.mode === 'live' ? (
                  <>
                    <span className="text-amber-500">LIVE MODE</span>
                    <span className="relative flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground/60">IDLE MODE</span>
                )}
              </h1>
            </div>

            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {infraStatus.mode === 'live' 
                ? 'High-concurrency cluster parameters are ACTIVE. Auto Scaling Groups have expanded compute resources, and real-time state synchronizers are running to serve ongoing contest events.'
                : 'Baseline cluster footprint is ACTIVE. No active high-volume contest events are running; computing resources have scaled down to minimize costs.'
              }
            </p>
          </div>

          <div className="shrink-0 flex flex-col justify-center sm:min-w-[240px] bg-secondary/20 rounded-xl p-4 sm:p-5 border border-border/30">
            {infraStatus.mode === 'live' ? (
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold block">Active Scale Instances</span>
                  <span className="text-3xl font-black text-amber-500 font-mono mt-1 block">
                    {infraStatus.activeAsgInstanceCount} <span className="text-xs text-muted-foreground font-normal">nodes running</span>
                  </span>
                </div>
                
                {infraStatus.currentLiveContestIds.length > 0 && stats?.upcomingContests && (
                  <div className="border-t border-border/40 pt-3">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold block mb-2">Triggering Contests</span>
                    <div className="space-y-1.5">
                      {infraStatus.currentLiveContestIds.map(id => {
                        // Find this contest in our dummy stats
                        const matching = stats.upcomingContests.find(c => c.id === id);
                        return (
                          <button
                            key={id}
                            onClick={() => router.push(`/dashboard/organizations?orgId=${matching?.orgId || 'org_1'}`)}
                            className="w-full flex items-center justify-between text-left text-xs font-semibold text-foreground hover:text-amber-500 transition-colors group cursor-pointer"
                          >
                            <span className="truncate max-w-[160px] underline underline-offset-2">
                              {matching?.title || `Contest #${id}`}
                            </span>
                            <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold block">Quiescent State</span>
                <span className="text-sm font-semibold text-foreground block">Ready for Next Wave</span>
                <span className="text-xs text-muted-foreground block leading-relaxed">
                  System monitors the active schedule. Live scale-up triggers approximately 15 minutes prior to scheduled start times.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. THREE-CARD ROW: COMPUTE, CACHE, COST */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* COMPUTE CAPACITY CARD */}
        <div id="ops-infra-compute-card" className="bg-card border border-border/40 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                Compute Footprint
              </span>
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">ASG</span>
            </div>

            <div className="space-y-1">
              <span className="text-sm text-muted-foreground block">Active Instances</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-foreground">{infraStatus.activeAsgInstanceCount}</span>
                <span className="text-xs text-muted-foreground">nodes online</span>
              </div>
            </div>

            {/* Capacity Progress Bar */}
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
                <span>Min: {infraStatus.minAsgInstanceCount}</span>
                <span>Max: {infraStatus.maxAsgInstanceCount}</span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden relative">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    infraStatus.mode === 'live' ? 'bg-amber-500' : 'bg-primary'
                  }`}
                  style={{ 
                    width: `${Math.max(10, Math.min(100, (infraStatus.activeAsgInstanceCount / infraStatus.maxAsgInstanceCount) * 100))}%` 
                  }}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 mt-4 pt-3 flex justify-between items-center text-[11px] text-muted-foreground font-semibold">
            <span>Auto-scaling: ACTIVE</span>
            <span>Target load: 60% CPU</span>
          </div>
        </div>

        {/* ELASTICACHE STATUS CARD */}
        <div id="ops-infra-cache-card" className="bg-card border border-border/40 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                State Synchronization
              </span>
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">Redis</span>
            </div>

            <div className="space-y-1">
              <span className="text-sm text-muted-foreground block">ElastiCache Clusters</span>
              <div className="mt-1 block">
                {getCacheBadge(infraStatus.elastiCacheStatus)}
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed pt-2">
              {infraStatus.elastiCacheStatus === 'not_provisioned' && 'Redis memory footprint is currently cold/off to save budget. Live contests automatically spin up a cluster 15 minutes prior to start.'}
              {infraStatus.elastiCacheStatus === 'available' && 'In-memory pub/sub engine is hot and running. WebSocket state handles thousands of real-time response streams.'}
              {infraStatus.elastiCacheStatus === 'provisioning' && 'VPC Subnet is generating AWS ElastiCache nodes. Estimated wait is 4-5 minutes before sync active.'}
              {infraStatus.elastiCacheStatus === 'destroying' && 'Graceful snapshot in progress. Tearing down instances to halt hourly server billing.'}
            </p>
          </div>

          <div className="border-t border-border/40 mt-4 pt-3 flex justify-between items-center text-[11px] text-muted-foreground font-semibold">
            <span>Cluster Shards: {scalingConfig.redisClusterSize}</span>
            <span>Type: cache.t4g.medium</span>
          </div>
        </div>

        {/* ESTIMATED BUDGET / COST CARD */}
        <div id="ops-infra-cost-card" className="bg-card border border-border/40 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Ops Cost Control
              </span>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded font-bold">USD MTD</span>
            </div>

            <div className="space-y-1">
              <span className="text-sm text-muted-foreground block">Est. Month-to-Date Spend</span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black font-mono text-foreground">${totalCost.toFixed(2)}</span>
              </div>
            </div>

            {/* Split horizontal visual bar */}
            <div className="space-y-1 pt-2">
              <div className="flex h-2 w-full rounded-full overflow-hidden bg-secondary">
                <div 
                  className="bg-primary h-full transition-all" 
                  style={{ width: `${permPercent}%` }} 
                  title={`Permanent baseline: $${permCost.toFixed(2)}`}
                />
                <div 
                  className="bg-amber-500 h-full transition-all" 
                  style={{ width: `${ephemPercent}%` }} 
                  title={`Ephemeral Live Windows: $${ephemCost.toFixed(2)}`}
                />
              </div>
              <div className="flex justify-between text-[9px] font-bold text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Baseline ({permPercent.toFixed(0)}%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Live burst ({ephemPercent.toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 mt-4 pt-3">
            <button 
              id="expand-cost-breakdown-btn"
              onClick={() => setIsCostBreakdownExpanded(!isCostBreakdownExpanded)}
              className="w-full flex items-center justify-between text-[11px] font-bold text-primary hover:text-primary/80 transition-colors cursor-pointer"
            >
              <span>{isCostBreakdownExpanded ? 'Hide cost breakdown' : 'View cost breakdown'}</span>
              {isCostBreakdownExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {isCostBreakdownExpanded && (
              <div className="mt-2.5 pt-2 border-t border-dashed border-border/40 space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Always-On baseline (S3, VPC, Aurora)</span>
                  <span className="font-mono font-semibold text-foreground">${permCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Live burst-mode compute & cache</span>
                  <span className="font-mono font-semibold text-foreground">${ephemCost.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 3. SCALING CONFIGURATION GRID */}
      <div id="ops-infra-scaling-config" className="bg-card border border-border/40 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-4">
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <Layers className="h-4.5 w-4.5 text-primary" />
              Runtime Scaling Engine Variables
            </h3>
            <p className="text-[11px] text-muted-foreground">
              These values are environment-driven and changed via infrastructure config, not from this dashboard — shown here for visibility only.
            </p>
          </div>
          <span className="text-[10px] bg-secondary text-muted-foreground px-2 py-1 rounded font-mono font-semibold self-start sm:self-center">
            config.yaml (production)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4 text-xs">
          
          <div className="space-y-1 border-l-2 border-primary/20 pl-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">Baseline Node Count</span>
            <span className="text-sm font-black font-mono text-foreground">{scalingConfig.instanceCount}</span>
          </div>

          <div className="space-y-1 border-l-2 border-primary/20 pl-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">Max WS Conns / Node</span>
            <span className="text-sm font-black font-mono text-foreground">{scalingConfig.maxWsConnectionsPerInstance.toLocaleString()}</span>
          </div>

          <div className="space-y-1 border-l-2 border-primary/20 pl-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">Redis Cluster Size</span>
            <span className="text-sm font-black font-mono text-foreground">{scalingConfig.redisClusterSize} shd</span>
          </div>

          <div className="space-y-1 border-l-2 border-primary/20 pl-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">Queue Concurrency</span>
            <span className="text-sm font-black font-mono text-foreground">{scalingConfig.queueConcurrency} thr</span>
          </div>

          <div className="space-y-1 border-l-2 border-primary/20 pl-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">Background Workers</span>
            <span className="text-sm font-black font-mono text-foreground">{scalingConfig.workerInstances} asg</span>
          </div>

          <div className="space-y-1 border-l-2 border-primary/20 pl-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">WS Heartbeat Interval</span>
            <span className="text-sm font-black font-mono text-foreground">{(scalingConfig.wsHeartbeatIntervalMs / 1000).toFixed(0)}s</span>
          </div>

          <div className="space-y-1 border-l-2 border-primary/20 pl-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">Quiz Session TTL</span>
            <span className="text-sm font-black font-mono text-foreground">{(scalingConfig.quizSessionTtlSeconds / 3600).toFixed(0)} hrs</span>
          </div>

          <div className="space-y-1 border-l-2 border-primary/20 pl-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">Rate Limit Window</span>
            <span className="text-sm font-black font-mono text-foreground">{(scalingConfig.rateLimitWindowSeconds / 60).toFixed(0)} min</span>
          </div>

          <div className="space-y-1 border-l-2 border-primary/20 pl-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">Max API Requests</span>
            <span className="text-sm font-black font-mono text-foreground">{scalingConfig.rateLimitMax} req</span>
          </div>

          <div className="space-y-1 border-l-2 border-primary/20 pl-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">OTP Send Limit</span>
            <span className="text-sm font-black font-mono text-foreground">{scalingConfig.otpRateLimit} / 10m</span>
          </div>

        </div>
      </div>

      {/* 4. UPCOMING LIVE-MODE WINDOWS */}
      <div id="ops-infra-upcoming-windows" className="bg-card border border-border/40 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border/40 pb-4">
          <Calendar className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-extrabold text-foreground tracking-tight">
            Upcoming Live-Mode Event Infrastructure Projections (Next 7 Days)
          </h3>
        </div>

        {(!stats?.upcomingContests || stats.upcomingContests.length === 0) ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No upcoming high-volume contest events detected in the next 7 days. Auto-scale will remain on standby.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.upcomingContests.map(contest => {
              // Estimate required nodes
              const estimatedNodes = Math.max(1, Math.ceil(contest.participantCount / 1000));
              const willTriggerLive = contest.participantCount >= 50;

              return (
                <div 
                  key={contest.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between gap-3 text-xs transition-colors ${
                    willTriggerLive 
                      ? 'bg-amber-500/[0.02] border-amber-500/20 hover:border-amber-500/30' 
                      : 'bg-secondary/10 border-border/50 hover:border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] font-bold text-muted-foreground block truncate">{contest.orgName}</span>
                      <h4 className="font-extrabold text-foreground tracking-tight truncate leading-tight">{contest.title}</h4>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Starts {format(parseISO(contest.startTime), 'dd MMM yyyy, hh:mm a')}
                      </p>
                    </div>

                    <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] shrink-0 uppercase ${
                      willTriggerLive ? 'bg-amber-500/10 text-amber-500' : 'bg-secondary text-muted-foreground'
                    }`}>
                      {contest.participantCount} registered
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/30 pt-3">
                    <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
                      {willTriggerLive ? (
                        <>
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-amber-500 font-bold">Will trigger LIVE MODE (~{estimatedNodes} {estimatedNodes === 1 ? 'node' : 'nodes'})</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
                          <span>Muted burst (baseline compute)</span>
                        </>
                      )}
                    </span>

                    <button
                      onClick={() => router.push(`/dashboard/organizations?orgId=${contest.orgId}`)}
                      className="text-primary hover:text-primary/80 transition-colors font-bold text-[11px] flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>Tenant Specs</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
