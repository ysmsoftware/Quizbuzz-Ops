'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganizations, useOrganizationDetail } from '@/lib/hooks/useOrganizations';
import { usePlans } from '@/lib/hooks/usePlans';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { Organization } from '@/lib/types';
import { 
  Search, 
  Globe, 
  X, 
  Lock, 
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Plus,
  Trash2,
  AlertTriangle,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

export default function OrganizationsView() {
  const router = useRouter();
  const { hasPermission } = useCurrentAdmin();
  const { toast } = useToast();
  const { plans } = usePlans();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Selection states
  const [selectedRowIds, setSelectedRowIds] = useState<Record<string, boolean>>({});

  // Sorting
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'membersCount'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isBulkSuspendOpen, setIsBulkSuspendOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);
  const [deleteInputName, setDeleteInputName] = useState('');

  // Bulk Suspend Form
  const [bulkSuspendReason, setBulkSuspendReason] = useState('');

  // Hook query
  const { organizations, pagination, isLoading, refetch } = useOrganizations({
    page: currentPage,
    limit: itemsPerPage,
    search: searchQuery,
    status: statusFilter,
    planId: planFilter,
  });

  // Compute selected row counts
  const selectedCount = useMemo(() => {
    return Object.values(selectedRowIds).filter(Boolean).length;
  }, [selectedRowIds]);

  const handleSelectAll = (checked: boolean) => {
    if (!organizations) return;
    const next: Record<string, boolean> = {};
    if (checked) {
      organizations.forEach(org => {
        next[org.id] = true;
      });
    }
    setSelectedRowIds(next);
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedRowIds(prev => ({
      ...prev,
      [id]: checked
    }));
  };

  // Create organization mutation
  const { createOrg, isCreating } = useOrganizationDetail('');
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    ownerName: '',
    ownerEmail: '',
    planId: 'plan_starter'
  });

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name || !createForm.slug || !createForm.ownerEmail || !createForm.ownerName) {
      toast('Form Incomplete', 'Please fill in all mandatory fields.', 'warning');
      return;
    }
    try {
      await createOrg(createForm);
      toast('Organization Created', `"${createForm.name}" has been successfully onboarded.`, 'success');
      setIsCreateModalOpen(false);
      setCreateForm({
        name: '',
        slug: '',
        ownerName: '',
        ownerEmail: '',
        planId: 'plan_starter'
      });
      refetch();
    } catch (err: any) {
      toast('Creation Failed', err.message || 'Operation failed.', 'error');
    }
  };

  // Bulk Suspend handler
  const { bulkSuspend, isBulkSuspending } = useOrganizationDetail('');
  const handleBulkSuspendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkSuspendReason.trim()) {
      toast('Reason Required', 'Please enter a compliance reason.', 'warning');
      return;
    }
    const targetIds = Object.entries(selectedRowIds).filter(([_, v]) => v).map(([k]) => k);
    try {
      await bulkSuspend({ orgIds: targetIds, reason: bulkSuspendReason });
      toast('Bulk Suspension Complete', `${targetIds.length} organizations have been suspended.`, 'success');
      setSelectedRowIds({});
      setIsBulkSuspendOpen(false);
      setBulkSuspendReason('');
      refetch();
    } catch (err: any) {
      toast('Bulk Action Failed', err.message || 'Operation failed.', 'error');
    }
  };

  // Delete organization handler
  const { deleteOrg, isDeleting } = useOrganizationDetail(orgToDelete?.id || '');
  const handleDeleteConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgToDelete) return;
    if (deleteInputName !== orgToDelete.name) {
      toast('Validation Error', 'The typed organization name does not match.', 'warning');
      return;
    }
    try {
      await deleteOrg();
      toast('Organization Deleted', `"${orgToDelete.name}" has been removed from active registers.`, 'success');
      setIsDeleteConfirmOpen(false);
      setOrgToDelete(null);
      setDeleteInputName('');
      refetch();
    } catch (err: any) {
      toast('Deletion Failed', err.message || 'Operation failed.', 'error');
    }
  };

  const triggerDelete = (org: Organization) => {
    if (!hasPermission('ORG_SUSPEND')) {
      toast('Permission Denied', 'Your administrative role is not authorized to delete organizations.', 'error');
      return;
    }
    setOrgToDelete(org);
    setDeleteInputName('');
    setIsDeleteConfirmOpen(true);
  };

  // Filter handlers
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
    setSelectedRowIds({});
  };

  const handleStatusFilter = (val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
    setSelectedRowIds({});
  };

  const handlePlanFilter = (val: string) => {
    setPlanFilter(val);
    setCurrentPage(1);
    setSelectedRowIds({});
  };

  // Sort function client-side
  const sortedOrganizations = useMemo(() => {
    if (!organizations) return [];
    return [...organizations].sort((a, b) => {
      let aVal: any = a[sortBy];
      let bVal: any = b[sortBy];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [organizations, sortBy, sortOrder]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div id="orgs-manager-view" className="space-y-6 font-sans">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Organizations Directory</h2>
          <p className="text-xs text-muted-foreground">Verify tenant records, subscription packages, and host stats.</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/95 transition-all shadow-sm cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>New Organization</span>
        </button>
      </div>

      {/* Bulk actions / Toolbar Container */}
      <div className="flex flex-col gap-3">
        
        {/* Bulk Selection Ribbon */}
        <AnimatePresence>
          {selectedCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 overflow-hidden shadow-sm"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-bold text-foreground">
                  {selectedCount} organizations selected for batch administrative control
                </span>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setIsBulkSuspendOpen(true)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Bulk Suspend</span>
                </button>
                <button
                  onClick={() => setSelectedRowIds({})}
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
          
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-muted-foreground" />
            <input
              id="orgs-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search organizations by name, slug, email, contact person..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-secondary/30 hover:bg-secondary/50 focus:bg-card border border-border/40 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute inset-y-0 right-3 my-auto text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            
            {/* Status Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground font-sans">Status:</span>
              <select
                id="filter-status-select"
                value={statusFilter}
                onChange={(e) => handleStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-secondary/30 hover:bg-secondary/50 border border-border/40 rounded-md outline-none text-foreground cursor-pointer font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>

            {/* Plan Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground font-sans">Tier:</span>
              <select
                id="filter-plan-select"
                value={planFilter}
                onChange={(e) => handlePlanFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-secondary/30 hover:bg-secondary/50 border border-border/40 rounded-md outline-none text-foreground cursor-pointer font-medium"
              >
                <option value="all">All Plans</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/40 bg-secondary/10 text-xs font-semibold text-muted-foreground">
                <th className="py-3.5 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={organizations?.length ? organizations.every(o => selectedRowIds[o.id]) : false}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-border"
                  />
                </th>
                <th className="py-3.5 px-4 cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('name')}>
                  <div className="flex items-center gap-1">
                    <span>Organization</span>
                    <ArrowUpDown className="h-3 w-3 shrink-0" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Owner Email</th>
                <th className="py-3.5 px-4">Plan</th>
                <th className="py-3.5 px-4 cursor-pointer hover:text-foreground select-none text-center" onClick={() => toggleSort('membersCount')}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Staff</span>
                    <ArrowUpDown className="h-3 w-3 shrink-0" />
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center">Quizzes</th>
                <th className="py-3.5 px-4 text-center">Participants</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('createdAt')}>
                  <div className="flex items-center gap-1">
                    <span>Created Date</span>
                    <ArrowUpDown className="h-3 w-3 shrink-0" />
                  </div>
                </th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 text-xs font-sans">
              {isLoading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={10} className="py-4.5 px-4">
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
              ) : sortedOrganizations.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-20 text-center text-muted-foreground font-sans">
                    <div className="flex flex-col items-center gap-2 max-w-xs mx-auto">
                      <Globe className="h-8 w-8 text-muted-foreground/60" />
                      <span className="font-semibold text-foreground">No Organizations Found</span>
                      <span className="text-[11px] leading-relaxed">
                        We couldn't find any organization matching your search or filters. Try adjusting your parameters.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedOrganizations.map((org: any) => {
                  const planName = plans.find(p => p.id === org.planId || p.slug === org.planId)?.name || org.planId;
                  const isChecked = !!selectedRowIds[org.id];

                  return (
                    <tr
                      id={`org-row-${org.id}`}
                      key={org.id}
                      className={`hover:bg-secondary/20 cursor-pointer transition-colors ${
                        isChecked ? 'bg-primary/5 hover:bg-primary/10' : ''
                      }`}
                      onClick={() => router.push(`/dashboard/organizations/${org.id}`)}
                    >
                      <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleSelectRow(org.id, e.target.checked)}
                          className="rounded border-border"
                        />
                      </td>
                      <td className="py-4 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2.5">
                          <img 
                            src={org.logoUrl} 
                            alt={org.name} 
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
                          {planName}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-medium text-foreground">
                        {org.memberCount || org.membersCount}
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-bold text-muted-foreground">
                        {org.contestCount || 0}
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-bold text-foreground/80">
                        {(org.participantCount || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${
                          org.status === 'ACTIVE' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {org.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-muted-foreground">
                        {format(new Date(org.createdAt), 'dd MMM yyyy')}
                      </td>
                      <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => router.push(`/dashboard/organizations/${org.id}`)}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          >
                            View Dossier
                          </button>
                          <button
                            onClick={() => triggerDelete(org)}
                            className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/15 transition-colors cursor-pointer"
                            title="Delete Organization"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        {pagination && pagination.total > 0 && (
          <div className="px-4 py-3 bg-secondary/10 border-t border-border/30 flex items-center justify-between text-xs font-sans">
            <span className="text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{Math.min((currentPage - 1) * itemsPerPage + 1, pagination.total)}</span> to{' '}
              <span className="font-semibold text-foreground">{Math.min(currentPage * itemsPerPage, pagination.total)}</span> of{' '}
              <span className="font-semibold text-foreground">{pagination.total}</span> organizations
            </span>
            <div className="flex gap-1.5">
              <button
                disabled={currentPage === 1 || isLoading}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1.5 rounded-md border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={currentPage * itemsPerPage >= pagination.total || isLoading}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="p-1.5 rounded-md border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE MODAL DIALOG */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border/50 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/40">
              <div className="space-y-0.5">
                <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                  <Plus className="h-4 w-4 text-primary" /> Onboard New Organization
                </h3>
                <p className="text-[11px] text-muted-foreground">Create a fresh tenant profile and subscribe them to a plan.</p>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOrg} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Organization Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bangalore Trivia Society"
                  value={createForm.name}
                  onChange={(e) => {
                    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    setCreateForm(prev => ({ ...prev, name: e.target.value, slug }));
                  }}
                  className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Unique Slug Wordmark</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. bangalore-trivia"
                  value={createForm.slug}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, slug: e.target.value }))}
                  className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Owner Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Rahul Hegde"
                    value={createForm.ownerName}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, ownerName: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Owner Email</label>
                  <input
                    type="email"
                    required
                    placeholder="rahul@domain.com"
                    value={createForm.ownerEmail}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, ownerEmail: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">SaaS Pricing Plan Tier</label>
                <select
                  value={createForm.planId}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, planId: e.target.value }))}
                  className="w-full px-3 py-2 text-xs bg-secondary/20 border border-border/50 rounded-lg outline-none text-foreground"
                >
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (₹{p.priceINR}/mo)</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border/30">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/95 transition-all"
                >
                  {isCreating ? 'Provisioning...' : 'Complete Onboarding'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

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
                <Lock className="h-4 w-4" /> Batch Compliance Lockdown
              </h3>
              <button onClick={() => setIsBulkSuspendOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              You are about to suspend <span className="font-bold text-foreground">{selectedCount} selected organizations</span>.
              This will freeze all user accounts, active quiz portals, and billing cycles instantly.
            </p>

            <form onSubmit={handleBulkSuspendSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-destructive block">Lockdown Reason / Notes</label>
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
                  className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBulkSuspending}
                  className="px-4 py-2 text-xs font-semibold rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/95 transition-all"
                >
                  {isBulkSuspending ? 'Processing lockdown...' : 'Confirm Bulk Suspension'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* DELETE DESTRUCTIVE CONFIRMATION MODAL */}
      {isDeleteConfirmOpen && orgToDelete && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-destructive/30 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4 font-sans"
          >
            <div className="flex items-center gap-2 pb-2 border-b border-border/40 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3 className="font-bold text-sm">Destructive Action Confirmation</h3>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                You are deleting organization <span className="font-bold text-foreground">{orgToDelete.name}</span>.
                This action soft-deletes the tenant, preventing any future billing and hiding it from search results.
              </p>
              <div className="p-2.5 rounded-lg bg-destructive/10 text-[11px] text-destructive flex items-center gap-1.5 font-sans">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>To safeguard against accidental deletions, this action is locked.</span>
              </div>
            </div>

            <form onSubmit={handleDeleteConfirmSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Please type <span className="font-mono font-bold text-foreground">"{orgToDelete.name}"</span> to authorize:
                </label>
                <input
                  type="text"
                  required
                  placeholder={orgToDelete.name}
                  value={deleteInputName}
                  onChange={(e) => setDeleteInputName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteConfirmOpen(false);
                    setOrgToDelete(null);
                    setDeleteInputName('');
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || deleteInputName !== orgToDelete.name}
                  className="px-4 py-2 text-xs font-semibold rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {isDeleting ? 'Deleting registers...' : 'Authorize Deletion'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

    </div>
  );
}
