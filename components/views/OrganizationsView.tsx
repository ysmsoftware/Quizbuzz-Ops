'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganizations, useOrganizationActions } from '@/lib/hooks/useOrganizations';
import { usePlans } from '@/lib/hooks/usePlans';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useTableQuery } from '@/lib/hooks/useTableQuery';
import { useToast } from '@/components/ui/Toast';
import StatusBadge from '@/components/ui/StatusBadge';
import Pagination from '@/components/ui/Pagination';
import OrgCreateModal from '@/components/views/organization-detail/modals/OrgCreateModal';
import OrgDeleteModal from '@/components/views/organization-detail/modals/OrgDeleteModal';
import { ORG_STATUS_FILTERS } from '@/lib/constants/status';
import { formatNumber } from '@/lib/format';
import { INSTITUTION_FLAGS, institutionFlagShort } from '@/lib/constants/institution';
import type { Organization } from '@/lib/types';
import type { CreateOrganizationInput, OrgSortField } from '@/lib/api/organizations';
import {
  Search,
  Globe,
  X,
  Lock,
  ShieldAlert,
  ArrowUpDown,
  Plus,
  Trash2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

const PAGE_SIZE = 8;

type OrgRow = Organization & { contestCount?: number; participantCount?: number };

export default function OrganizationsView() {
  const router = useRouter();
  const { hasPermission } = useCurrentAdmin();
  const { toast } = useToast();
  const { plans } = usePlans();

  // Filters + page. Search is debounced; every filter change returns to page 1.
  const query = useTableQuery({ search: '', status: 'all', plan: 'all', feature: 'all' }, { debounce: ['search'] });
  const { page, setPage } = query;

  // Sorting is done by the server so it orders the whole directory, not just the visible page.
  const [sortBy, setSortBy] = useState<OrgSortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { organizations, pagination, isLoading, isFetching, isError, error, refetch } = useOrganizations({
    page,
    limit: PAGE_SIZE,
    search: query.params.search,
    status: query.params.status,
    planSlug: query.params.plan,
    feature: query.params.feature,
    sort: sortBy,
    order: sortOrder,
  });

  const { createOrg, isCreating, deleteOrg, isDeleting, restoreOrg, bulkSuspend, isBulkSuspending } = useOrganizationActions();

  // Selection is per page: it is cleared whenever the visible rows change.
  const [selectedRowIds, setSelectedRowIds] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.entries(selectedRowIds).filter(([, v]) => v).map(([k]) => k), [selectedRowIds]);
  const clearSelection = () => setSelectedRowIds({});

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkSuspendOpen, setIsBulkSuspendOpen] = useState(false);
  const [bulkSuspendReason, setBulkSuspendReason] = useState('');
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);

  // Server rule: create / edit / suspend / delete are Super Admin only.
  const canManage = hasPermission('ORG_MANAGE');
  const isDeletedView = query.params.status === 'deleted';

  const changeFilter = (key: 'search' | 'status' | 'plan' | 'feature', value: string) => {
    query.setFilter(key, value);
    clearSelection();
  };
  const changePage = (next: number) => {
    setPage(next);
    clearSelection();
  };
  const toggleSort = (field: OrgSortField) => {
    if (sortBy === field) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
    clearSelection();
  };

  const rows = (organizations ?? []) as OrgRow[];
  // Suspend only applies to active orgs; skip the rest instead of failing the whole batch.
  const suspendableIds = selectedIds.filter((id) => rows.find((o) => o.id === id)?.status === 'ACTIVE');

  const handleSelectAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) rows.forEach((org) => (next[org.id] = true));
    setSelectedRowIds(next);
  };

  const handleCreate = async (input: CreateOrganizationInput) => {
    try {
      const result = await createOrg(input);
      toast(
        'Organization Created',
        `"${input.name}" is ready. ${result.createdAccount ? 'The owner was emailed how to set a password.' : 'The owner was emailed.'}${
          result.planAssigned ? '' : ' No plan was assigned — set one from the Subscription tab.'
        }`,
        result.planAssigned ? 'success' : 'warning'
      );
      setIsCreateOpen(false);
      router.push(`/dashboard/organizations/${result.id}`);
    } catch (err: unknown) {
      toast('Creation Failed', err instanceof Error ? err.message : 'Operation failed.', 'error');
    }
  };

  const handleBulkSuspend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkSuspendReason.trim()) {
      toast('Reason Required', 'Please enter a compliance reason.', 'warning');
      return;
    }
    try {
      const result = await bulkSuspend({ orgIds: suspendableIds, reason: bulkSuspendReason.trim() });
      const skipped = selectedIds.length - suspendableIds.length;
      const parts = [`${result.succeeded.length} suspended`];
      if (result.failed.length) parts.push(`${result.failed.length} failed (${result.failed[0].message})`);
      if (skipped) parts.push(`${skipped} skipped (not active)`);
      toast('Bulk Suspension', parts.join(' · '), result.failed.length ? 'warning' : 'success');
      clearSelection();
      setIsBulkSuspendOpen(false);
      setBulkSuspendReason('');
    } catch (err: unknown) {
      toast('Bulk Action Failed', err instanceof Error ? err.message : 'Operation failed.', 'error');
    }
  };

  const handleDelete = async (reason: string) => {
    if (!orgToDelete) return;
    try {
      await deleteOrg({ orgId: orgToDelete.id, reason });
      toast('Organization Deleted', `"${orgToDelete.name}" is hidden from lists. Restore it from the Deleted filter. The owner was not notified.`, 'success');
      setOrgToDelete(null);
    } catch (err: unknown) {
      toast('Deletion Failed', err instanceof Error ? err.message : 'Operation failed.', 'error');
    }
  };

  const handleRestore = async (org: Organization) => {
    try {
      await restoreOrg({ orgId: org.id });
      toast('Organization Restored', `"${org.name}" is back in the directory.`, 'success');
    } catch (err: unknown) {
      toast('Restore Failed', err instanceof Error ? err.message : 'Operation failed.', 'error');
    }
  };

  const planName = (slug: string) => plans.find((p) => p.slug === slug)?.name || slug;

  const sortIcon = (field: OrgSortField) => (
    <ArrowUpDown className={`h-3 w-3 shrink-0 ${sortBy === field ? 'text-primary' : ''}`} />
  );

  return (
    <div id="orgs-manager-view" className="space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Organizations Directory</h2>
          <p className="text-xs text-muted-foreground">Verify tenant records, subscription packages, and host stats.</p>
        </div>
        {canManage && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/95 transition-all shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Organization</span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {/* Bulk Selection Ribbon */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 overflow-hidden shadow-sm"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-bold text-foreground">
                  {selectedIds.length} selected on this page
                  {suspendableIds.length !== selectedIds.length && ` · ${suspendableIds.length} can be suspended`}
                </span>
              </div>
              <div className="flex gap-2 shrink-0">
                {canManage && (
                  <button
                    onClick={() => setIsBulkSuspendOpen(true)}
                    disabled={suspendableIds.length === 0}
                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>Bulk Suspend</span>
                  </button>
                )}
                <button
                  onClick={clearSelection}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md border border-border/50 bg-card text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search & Filter Header Row */}
        <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center bg-card p-4 rounded-xl border border-border/50 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-muted-foreground" />
            <input
              id="orgs-search-input"
              type="text"
              value={query.filters.search}
              onChange={(e) => changeFilter('search', e.target.value)}
              placeholder="Search organizations by name, slug or owner email..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-secondary/30 hover:bg-secondary/50 focus:bg-card border border-border/40 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
            />
            {query.filters.search && (
              <button
                onClick={() => changeFilter('search', '')}
                className="absolute inset-y-0 right-3 my-auto text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground font-sans">Status:</span>
              <select
                id="filter-status-select"
                value={query.filters.status}
                onChange={(e) => changeFilter('status', e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-secondary/30 hover:bg-secondary/50 border border-border/40 rounded-md outline-none text-foreground cursor-pointer font-medium"
              >
                {ORG_STATUS_FILTERS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground font-sans">Tier:</span>
              <select
                id="filter-plan-select"
                value={query.filters.plan}
                onChange={(e) => changeFilter('plan', e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-secondary/30 hover:bg-secondary/50 border border-border/40 rounded-md outline-none text-foreground cursor-pointer font-medium"
              >
                <option value="all">All Plans</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.slug}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground font-sans">Feature:</span>
              <select
                id="filter-feature-select"
                value={query.filters.feature}
                onChange={(e) => changeFilter('feature', e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-secondary/30 hover:bg-secondary/50 border border-border/40 rounded-md outline-none text-foreground cursor-pointer font-medium"
              >
                <option value="all">Any</option>
                <option value="any">Uses institution mode</option>
                {INSTITUTION_FLAGS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>

            {query.hasActiveFilters && (
              <button
                onClick={() => {
                  query.reset();
                  clearSelection();
                }}
                className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/40 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className={`bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden transition-opacity ${isFetching && !isLoading ? 'opacity-70' : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/40 bg-secondary/10 text-xs font-semibold text-muted-foreground">
                <th className="py-3.5 px-4 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={rows.length > 0 && rows.every((o) => selectedRowIds[o.id])}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-border"
                  />
                </th>
                <th className="py-3.5 px-4 cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('name')}>
                  <div className="flex items-center gap-1"><span>Organization</span>{sortIcon('name')}</div>
                </th>
                <th className="py-3.5 px-4">Owner Email</th>
                <th className="py-3.5 px-4">Plan</th>
                <th className="py-3.5 px-4">Institution</th>
                <th className="py-3.5 px-4 cursor-pointer hover:text-foreground select-none text-center" onClick={() => toggleSort('memberCount')}>
                  <div className="flex items-center justify-center gap-1"><span>Staff</span>{sortIcon('memberCount')}</div>
                </th>
                <th className="py-3.5 px-4 cursor-pointer hover:text-foreground select-none text-center" onClick={() => toggleSort('contestCount')}>
                  <div className="flex items-center justify-center gap-1"><span>Quizzes</span>{sortIcon('contestCount')}</div>
                </th>
                <th className="py-3.5 px-4 cursor-pointer hover:text-foreground select-none text-center" onClick={() => toggleSort('participantCount')}>
                  <div className="flex items-center justify-center gap-1"><span>Participants</span>{sortIcon('participantCount')}</div>
                </th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('createdAt')}>
                  <div className="flex items-center gap-1"><span>Created Date</span>{sortIcon('createdAt')}</div>
                </th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 text-xs font-sans">
              {isLoading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={11} className="py-4.5 px-4">
                      <div className="flex gap-4 items-center">
                        <div className="h-4 w-4 bg-secondary rounded" />
                        <div className="h-8 w-8 bg-secondary rounded-full" />
                        <div className="h-4 w-48 bg-secondary rounded" />
                        <div className="h-4 w-32 bg-secondary/60 rounded ml-auto" />
                        <div className="h-4 w-20 bg-secondary/40 rounded ml-auto" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 max-w-sm mx-auto">
                      <AlertTriangle className="h-8 w-8 text-destructive/70" />
                      <span className="font-semibold text-foreground">Couldn&apos;t load organizations</span>
                      <span className="text-[11px] text-muted-foreground">{error?.message || 'The request failed.'}</span>
                      <button
                        onClick={() => refetch()}
                        className="mt-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-20 text-center text-muted-foreground font-sans">
                    <div className="flex flex-col items-center gap-2 max-w-xs mx-auto">
                      <Globe className="h-8 w-8 text-muted-foreground/60" />
                      <span className="font-semibold text-foreground">No Organizations Found</span>
                      <span className="text-[11px] leading-relaxed">
                        {query.hasActiveFilters
                          ? "We couldn't find any organization matching your search or filters."
                          : 'There are no organizations yet.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((org) => {
                  const isChecked = !!selectedRowIds[org.id];
                  return (
                    <tr
                      id={`org-row-${org.id}`}
                      key={org.id}
                      className={`hover:bg-secondary/20 cursor-pointer transition-colors ${isChecked ? 'bg-primary/5 hover:bg-primary/10' : ''}`}
                      onClick={() => router.push(`/dashboard/organizations/${org.id}`)}
                    >
                      <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${org.name}`}
                          checked={isChecked}
                          onChange={(e) => setSelectedRowIds((prev) => ({ ...prev, [org.id]: e.target.checked }))}
                          className="rounded border-border"
                        />
                      </td>
                      <td className="py-4 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={org.logoUrl}
                            alt=""
                            className="h-8 w-8 rounded bg-background border border-border/30 object-contain p-0.5 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0">
                            <span className="block truncate font-semibold">{org.name}</span>
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">{org.slug}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-muted-foreground text-[11px]">
                        <a
                          href={`mailto:${org.ownerEmail}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-primary hover:underline"
                        >
                          {org.ownerEmail}
                        </a>
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-secondary-foreground border border-border/50">
                          {planName(org.planId)}
                        </span>
                        {org.hasSubscription === false && (
                          <span className="block text-[9px] text-muted-foreground mt-0.5" title="No subscription record — this is the free default. Assign a plan from the Subscription tab.">
                            no subscription record
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {org.features && org.features.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[190px]">
                            {INSTITUTION_FLAGS.filter((f) => org.features!.includes(f.key)).map((f) => (
                              <StatusBadge key={f.key} tone="accent">{institutionFlagShort(f.key)}</StatusBadge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-medium text-foreground">
                        {org.memberCount ?? org.membersCount}
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-bold text-muted-foreground">{formatNumber(org.contestCount)}</td>
                      <td className="py-4 px-4 text-center font-mono font-bold text-foreground/80">{formatNumber(org.participantCount)}</td>
                      <td className="py-4 px-4">
                        <StatusBadge kind="org" value={org.status} />
                      </td>
                      <td className="py-4 px-4 text-muted-foreground">{format(new Date(org.createdAt), 'dd MMM yyyy')}</td>
                      <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => router.push(`/dashboard/organizations/${org.id}`)}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          >
                            View Dossier
                          </button>
                          {canManage &&
                            (org.status === 'DELETED' ? (
                              <button
                                onClick={() => handleRestore(org)}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary/40 text-foreground transition-colors cursor-pointer"
                                title="Restore organization"
                              >
                                <RotateCcw className="h-3.5 w-3.5" /> Restore
                              </button>
                            ) : (
                              <button
                                onClick={() => setOrgToDelete(org)}
                                className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/15 transition-colors cursor-pointer"
                                title="Delete organization (soft delete)"
                                aria-label={`Delete ${org.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!isError && (
          <Pagination
            currentPage={page}
            totalItems={pagination.total}
            pageSize={PAGE_SIZE}
            itemLabel={isDeletedView ? 'deleted organizations' : 'organizations'}
            onPageChange={changePage}
            isLoading={isFetching}
          />
        )}
      </div>

      <OrgCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        plans={plans}
        isCreating={isCreating}
        onSubmit={handleCreate}
      />

      <OrgDeleteModal
        isOpen={!!orgToDelete}
        onClose={() => setOrgToDelete(null)}
        orgName={orgToDelete?.name ?? ''}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
      />

      {/* BULK SUSPEND MODAL */}
      {isBulkSuspendOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border/50 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4 font-sans"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/40">
              <h3 className="font-bold text-destructive text-sm flex items-center gap-1.5">
                <Lock className="h-4 w-4" /> Batch Suspension
              </h3>
              <button onClick={() => setIsBulkSuspendOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              You are about to suspend <span className="font-bold text-foreground">{suspendableIds.length} organization{suspendableIds.length === 1 ? '' : 's'}</span>. Each
              team can&apos;t sign in or use the dashboard (they see a &ldquo;suspended&rdquo; message), public registration and joining are paused, and each owner is emailed the reason.
            </p>

            <form onSubmit={handleBulkSuspend} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-destructive block">Reason</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Terms violation, multiple copyright notices"
                  value={bulkSuspendReason}
                  onChange={(e) => setBulkSuspendReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-destructive focus:ring-1 focus:ring-destructive transition-all text-foreground"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBulkSuspendOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBulkSuspending}
                  className="px-4 py-2 text-xs font-semibold rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/95 transition-all cursor-pointer disabled:opacity-60"
                >
                  {isBulkSuspending ? 'Suspending…' : 'Confirm Suspension'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
