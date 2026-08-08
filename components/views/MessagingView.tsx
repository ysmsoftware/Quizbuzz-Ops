'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  MessagesSquare,
  Search,
  Send,
  RefreshCcw,
  Eye,
  ChevronUp,
  Clock,
  Terminal,
  X,
} from 'lucide-react';
import { useMessages, useOrganizationNames } from '@/lib/hooks/useMessaging';
import { useToast } from '@/components/ui/Toast';
import { OpsMessageChannel, OpsMessageStatus, OpsMessageTemplate } from '@/lib/types';
import TablePagination from './organization-detail/TablePagination';
import MessageStatusBadge from './messaging/MessageStatusBadge';
import SendMessageModal from './messaging/SendMessageModal';
import OrgPicker, { OrgPickerOption } from './messaging/OrgPicker';

const STATUS_OPTIONS: OpsMessageStatus[] = ['QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED'];
const CHANNEL_OPTIONS: OpsMessageChannel[] = ['EMAIL', 'WHATSAPP'];

export default function MessagingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const deepLinkedOrgId = searchParams.get('organizationId') || '';

  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState<OrgPickerOption | null>(null);
  const [statusFilter, setStatusFilter] = useState<OpsMessageStatus | ''>('');
  const [channelFilter, setChannelFilter] = useState<OpsMessageChannel | ''>('');
  const [templateFilter, setTemplateFilter] = useState<OpsMessageTemplate | ''>('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  // Deep link from an org's detail page: `?organizationId=` pre-fills the
  // org filter with just the ID (no name yet — the picker shows raw
  // filtering via the id even before a name resolves for the badge below).
  const effectiveOrgId = orgFilter?.id || deepLinkedOrgId || undefined;

  const {
    messages,
    pagination,
    isLoading,
    isFetching,
    templates,
    sendMessage,
    isSending,
    retryMessage,
    retryingMessageId,
    retryFailed,
    isRetryingFailed,
  } = useMessages({
    page,
    limit: 20,
    organizationId: effectiveOrgId,
    status: statusFilter || undefined,
    channel: channelFilter || undefined,
    template: templateFilter || undefined,
    search: search || undefined,
  });

  const orgNamesById = useOrganizationNames(messages.map((m) => m.organizationId));
  // Mirrors useMessages' own refetchInterval condition — used purely to show
  // the "Live" indicator, not to control polling itself.
  const hasInFlight = messages.some((m) => m.status === 'QUEUED' || m.status === 'PROCESSING');

  const templateNameById = useMemo(() => {
    const map: Record<string, string> = {};
    templates.forEach((t) => { map[t.id] = t.name; });
    return map;
  }, [templates]);

  const resetFilters = () => {
    setSearch('');
    setOrgFilter(null);
    setStatusFilter('');
    setChannelFilter('');
    setTemplateFilter('');
    setPage(1);
    if (deepLinkedOrgId) router.replace('/dashboard/messaging');
  };

  const handleRetry = async (id: string) => {
    try {
      await retryMessage(id);
      toast('Message Re-queued', 'The message has been queued for another delivery attempt.', 'success');
    } catch (err: any) {
      toast('Retry Failed', err.message || 'Could not re-queue this message.', 'error');
    }
  };

  const handleRetryAllFailed = async () => {
    if (!effectiveOrgId) return;
    try {
      const result = await retryFailed(effectiveOrgId);
      toast('Bulk Retry Queued', `Queued ${result.count} failed message${result.count === 1 ? '' : 's'} for retry.`, 'success');
    } catch (err: any) {
      toast('Bulk Retry Failed', err.message || 'Could not retry failed messages.', 'error');
    }
  };

  const handleSend = async (payload: Parameters<typeof sendMessage>[0]) => {
    try {
      await sendMessage(payload);
      toast('Message Queued', 'The message has been queued for delivery.', 'success');
      setIsComposeOpen(false);
    } catch (err: any) {
      toast('Send Failed', err.message || 'Could not queue this message.', 'error');
    }
  };

  return (
    <div id="messaging-view" className="space-y-6 font-sans select-text pointer-events-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-primary" />
            Messaging
            {hasInFlight && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[9px] font-bold uppercase tracking-wider"
                title="Queued/processing messages refresh automatically every few seconds"
              >
                <span className={`h-1.5 w-1.5 rounded-full bg-emerald-500 ${isFetching ? 'animate-ping' : 'animate-pulse'}`} />
                Live
              </span>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">Every notification sent by the platform — queued, delivered, or failed — across every organization</p>
        </div>
        <button
          onClick={() => setIsComposeOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
          Compose Message
        </button>
      </div>

      {/* Filters + Table Card */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border/40 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search recipient or subject..."
                className="pl-9 h-9 w-full text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-sans"
              />
            </div>

            {/* Org filter */}
            <OrgPicker
              value={orgFilter}
              onChange={(org) => { setOrgFilter(org); setPage(1); if (deepLinkedOrgId) router.replace('/dashboard/messaging'); }}
              placeholder="Filter by organization..."
              className="w-56"
            />

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as OpsMessageStatus | ''); setPage(1); }}
              className="h-9 px-2.5 text-[11px] font-medium bg-secondary/20 border border-border/40 rounded-lg outline-none text-foreground cursor-pointer"
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Channel filter */}
            <select
              value={channelFilter}
              onChange={(e) => { setChannelFilter(e.target.value as OpsMessageChannel | ''); setPage(1); }}
              className="h-9 px-2.5 text-[11px] font-medium bg-secondary/20 border border-border/40 rounded-lg outline-none text-foreground cursor-pointer"
            >
              <option value="">All Channels</option>
              {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Template filter */}
            <select
              value={templateFilter}
              onChange={(e) => { setTemplateFilter(e.target.value as OpsMessageTemplate | ''); setPage(1); }}
              className="h-9 px-2.5 text-[11px] font-medium bg-secondary/20 border border-border/40 rounded-lg outline-none text-foreground cursor-pointer max-w-[160px]"
            >
              <option value="">All Templates</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            {(search || orgFilter || statusFilter || channelFilter || templateFilter || deepLinkedOrgId) && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 h-9 px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/40 transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {/* Bulk retry, scoped to the active org filter */}
          {effectiveOrgId && (
            <div className="flex items-center justify-between bg-rose-50/50 border border-rose-200/60 rounded-lg px-3 py-2">
              <span className="text-[11px] text-rose-800">
                Retry every failed message for this organization in one action.
              </span>
              <button
                onClick={handleRetryAllFailed}
                disabled={isRetryingFailed}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
              >
                <RefreshCcw className={`h-3 w-3 ${isRetryingFailed ? 'animate-spin' : ''}`} />
                {isRetryingFailed ? 'Retrying...' : 'Retry All Failed'}
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground font-mono animate-pulse">
              Loading message log...
            </div>
          ) : messages.length === 0 ? (
            <div className="py-16 text-center">
              <MessagesSquare className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-xs font-semibold text-muted-foreground">No messages match the selected filters</p>
              <p className="text-[10px] text-muted-foreground/80 mt-0.5">Try widening your search or clearing filters</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/20 text-muted-foreground border-b border-border/40">
                  <th className="py-3 px-5 font-semibold">Recipient</th>
                  <th className="py-3 px-5 font-semibold">Organization</th>
                  <th className="py-3 px-5 font-semibold">Template</th>
                  <th className="py-3 px-5 font-semibold">Channel</th>
                  <th className="py-3 px-5 font-semibold">Status</th>
                  <th className="py-3 px-5 font-semibold">Queued At</th>
                  <th className="py-3 px-5 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {messages.map((msg) => {
                  const isExpanded = expandedId === msg.id;
                  const isRetryingThis = retryingMessageId === msg.id;

                  return (
                    <React.Fragment key={msg.id}>
                      <tr
                        className={`hover:bg-secondary/10 transition-all cursor-pointer ${isExpanded ? 'bg-secondary/15' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                      >
                        <td className="py-3 px-5 font-medium text-foreground max-w-[200px] truncate">{msg.recipient}</td>
                        <td className="py-3 px-5 text-muted-foreground max-w-[160px] truncate">
                          {orgNamesById[msg.organizationId] || msg.organizationId}
                        </td>
                        <td className="py-3 px-5 text-muted-foreground max-w-[180px] truncate">
                          {templateNameById[msg.template] || msg.template}
                        </td>
                        <td className="py-3 px-5">
                          <span className="inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide bg-indigo-50 text-indigo-700 border-indigo-200">
                            {msg.channel}
                          </span>
                        </td>
                        <td className="py-3 px-5"><MessageStatusBadge status={msg.status} /></td>
                        <td className="py-3 px-5 font-mono text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3 text-muted-foreground/70" />
                            {format(new Date(msg.createdAt), 'dd MMM yyyy, HH:mm')}
                          </span>
                        </td>
                        <td className="py-3 px-5">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Blocked only while genuinely in-flight (QUEUED/PROCESSING) — allowed
                                for FAILED (retry) and also for SENT/DELIVERED (manual resend, e.g.
                                the recipient says they never got it), matching the backend's guard
                                in messaging.service.ts#retryMessage. */}
                            {(msg.status === 'FAILED' || msg.status === 'SENT' || msg.status === 'DELIVERED') && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRetry(msg.id); }}
                                disabled={isRetryingThis}
                                title={msg.status === 'FAILED' ? 'Retry this message' : 'Resend this message'}
                                className={`p-1.5 rounded-md hover:bg-card border border-transparent hover:border-border/40 transition-all shrink-0 cursor-pointer disabled:opacity-50 ${
                                  msg.status === 'FAILED' ? 'text-rose-600 hover:text-rose-700' : 'text-indigo-500 hover:text-indigo-600'
                                }`}
                              >
                                <RefreshCcw className={`h-3.5 w-3.5 ${isRetryingThis ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : msg.id); }}
                              className="p-1.5 rounded-md hover:bg-card border border-transparent hover:border-border/40 text-muted-foreground hover:text-foreground transition-all shrink-0 cursor-pointer"
                            >
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="bg-secondary/10 p-5 border-t border-b border-border/40">
                            <div className="bg-slate-950 text-slate-200 p-4 rounded-lg border border-border/60 shadow-inner font-mono text-xs space-y-3">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-[10px] text-slate-400">
                                <span className="flex items-center gap-1.5">
                                  <Terminal className="h-3.5 w-3.5 text-indigo-400" /> MESSAGE DELIVERY DETAIL
                                </span>
                                <span>MSG_ID: {msg.id}</span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px] py-1">
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Attempts</span>
                                  <span className="text-slate-300">{msg.attemptCount} attempt{msg.attemptCount === 1 ? '' : 's'} • {msg.retryCount} manual retr{msg.retryCount === 1 ? 'y' : 'ies'}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Provider Message ID</span>
                                  <span className="text-slate-300">{msg.providerMsgId || '—'}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Sent At</span>
                                  <span className="text-slate-300">{msg.sentAt ? format(new Date(msg.sentAt), 'dd MMM yyyy, HH:mm:ss') : '—'}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Delivered At</span>
                                  <span className="text-slate-300">{msg.deliveredAt ? format(new Date(msg.deliveredAt), 'dd MMM yyyy, HH:mm:ss') : '—'}</span>
                                </div>
                                {msg.failureReason && (
                                  <div className="space-y-1 sm:col-span-2">
                                    <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Failure Reason</span>
                                    <span className="text-rose-400">{msg.failureReason}</span>
                                  </div>
                                )}
                              </div>

                              {msg.params != null && (
                                <div className="space-y-1.5 border-t border-slate-800 pt-3">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Template Parameters</span>
                                  <pre className="p-3 bg-slate-900 rounded border border-slate-800 text-[10px] text-indigo-200 overflow-x-auto leading-normal">
                                    {JSON.stringify(msg.params, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <TablePagination
          currentPage={page}
          totalItems={pagination.total}
          pageSize={pagination.limit}
          itemLabel="messages"
          onPageChange={setPage}
        />
      </div>

      <SendMessageModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        templates={templates}
        isSending={isSending}
        onSubmit={handleSend}
      />
    </div>
  );
}
