'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOrganizations, useOrganizationDetail } from '@/lib/hooks/useOrganizations';
import { usePlans } from '@/lib/hooks/usePlans';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import OrganizationSubscriptionTab from '@/components/views/OrganizationSubscriptionTab';
import { Organization, SubscriptionPlan, OrgStatus, ContestStatus, Participant, SupportNote } from '@/lib/types';
import { 
  Search, 
  Filter, 
  Globe, 
  User, 
  Phone, 
  Mail, 
  Calendar, 
  X, 
  Lock, 
  Unlock, 
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Layers,
  Clock,
  ArrowUpDown,
  Plus,
  Trash2,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  CreditCard,
  Notebook,
  DollarSign,
  Trophy,
  Users,
  Check,
  ShieldCheck,
  Building,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { writeAuditLogEntry } from '@/lib/api/auditLog';

const CONTEST_BADGES: Record<ContestStatus, { label: string; style: string }> = {
  DRAFT: { label: 'Draft', style: 'bg-slate-100 text-slate-700 border-slate-200' },
  PUBLISHED: { label: 'Published', style: 'bg-blue-50 text-blue-700 border-blue-200' },
  REGISTRATION_CLOSED: { label: 'Reg Closed', style: 'bg-amber-50 text-amber-800 border-amber-200' },
  LIVE: { label: 'Live Now', style: 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse' },
  EVALUATION: { label: 'Evaluating', style: 'bg-purple-50 text-purple-700 border-purple-200' },
  RESULTS_OUT: { label: 'Results Out', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  COMPLETED: { label: 'Completed', style: 'bg-teal-50 text-teal-700 border-teal-200' },
  CANCELLED: { label: 'Cancelled', style: 'bg-red-50 text-red-700 border-red-200' },
};

export default function OrganizationsPlaceholder() {
  const { hasPermission } = useCurrentAdmin();
  const { toast } = useToast();
  const { plans } = usePlans();
  const searchParams = useSearchParams();
  const orgIdFromUrl = searchParams.get('orgId');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Selection states
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
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

  // Read the org to auto-open from the ?orgId= URL query param
  useEffect(() => {
    if (orgIdFromUrl) {
      setSelectedOrgId(orgIdFromUrl);
    }
  }, [orgIdFromUrl]);

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

  // Render Page 3: Organization Detail View if an org is selected
  if (selectedOrgId) {
    return (
      <OrganizationDetailView 
        orgId={selectedOrgId} 
        onBack={() => {
          setSelectedOrgId(null);
          refetch();
        }} 
      />
    );
  }

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
                  const planName = plans.find(p => p.id === org.planId)?.name || org.planId;
                  const isChecked = !!selectedRowIds[org.id];

                  return (
                    <tr
                      id={`org-row-${org.id}`}
                      key={org.id}
                      className={`hover:bg-secondary/20 cursor-pointer transition-colors ${
                        isChecked ? 'bg-primary/5 hover:bg-primary/10' : ''
                      }`}
                      onClick={() => setSelectedOrgId(org.id)}
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
                            onClick={() => setSelectedOrgId(org.id)}
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

/**
 * PAGE 3: ORGANIZATION DETAIL FULL VIEW
 */
interface DetailViewProps {
  orgId: string;
  onBack: () => void;
}

type DetailTab = 'overview' | 'members' | 'contests' | 'participants' | 'payments' | 'notes' | 'subscription';

function OrganizationDetailView({ orgId, onBack }: DetailViewProps) {
  const { hasPermission, admin } = useCurrentAdmin();
  const { toast } = useToast();
  const { plans } = usePlans();

  // Active Tab
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  // Load Organization Details & Queries
  const {
    organization,
    contests,
    members,
    payments,
    useParticipants,
    isLoadingDetails,
    isLoadingMembers,
    isLoadingPayments,
    suspendOrg,
    activateOrg,
    deleteOrg,
    updateOrg,
    addNote,
    isSuspending,
    isActivating,
    isDeleting,
    isUpdating,
    isAddingNote
  } = useOrganizationDetail(orgId);

  // Load participants hook query
  const { data: participants = [], isLoading: isLoadingParticipants } = useParticipants();

  const handleConfirmImpersonation = () => {
    if (!organization) return;
    
    // 1. Audit Log Entry
    writeAuditLogEntry(
      'org.impersonated',
      'organization',
      organization.id,
      organization.name,
      {
        ipAddress: '192.168.1.5',
        actorAdminId: admin?.id,
        actorAdminName: admin?.name,
        actorAdminRole: admin?.role,
      }
    );

    // 2. Dispatch custom event
    const impersonationEvent = new CustomEvent('quizbuzz_impersonate', {
      detail: {
        orgId: organization.id,
        orgName: organization.name
      }
    });
    window.dispatchEvent(impersonationEvent);
    
    setIsImpersonateConfirmOpen(false);
  };

  // Dialog states inside detail view
  const [isSuspendOpen, setIsSuspendOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isImpersonateConfirmOpen, setIsImpersonateConfirmOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [confirmNameDelete, setConfirmNameDelete] = useState('');

  // Edit fields
  const [editFields, setEditFields] = useState({
    name: '',
    website: '',
    logoUrl: '',
    planId: ''
  });

  // Notes form fields
  const [noteBody, setNoteBody] = useState('');
  const [noteTags, setNoteTags] = useState('');

  // Sub-resource tables search & filter
  const [contestSearch, setContestSearch] = useState('');
  const [contestStatusFilter, setContestStatusFilter] = useState<string>('all');
  const [participantSearch, setParticipantSearch] = useState('');

  // Trigger Edit Modal on current values
  useEffect(() => {
    if (organization) {
      setEditFields({
        name: organization.name,
        website: organization.website,
        logoUrl: organization.logoUrl,
        planId: organization.planId
      });
    }
  }, [organization]);

  // Payment aggregates in detail view
  const paymentAggregates = useMemo(() => {
    let collected = 0;
    let pending = 0;
    let refunded = 0;

    (payments || []).forEach(p => {
      if (p.status === 'PAID') collected += p.amount;
      else if (p.status === 'PENDING') pending += p.amount;
      else if (p.status === 'REFUNDED') refunded += p.amount;
    });

    return { collected, pending, refunded };
  }, [payments]);

  if (isLoadingDetails || !organization) {
    return (
      <div className="space-y-6 font-sans animate-pulse">
        <div className="h-10 w-44 bg-secondary rounded" />
        <div className="h-28 bg-card border border-border/30 rounded-xl" />
        <div className="h-10 bg-secondary/30 rounded-lg" />
        <div className="h-80 bg-card border border-border/30 rounded-xl" />
      </div>
    );
  }

  const currentPlan = plans.find(p => p.id === organization.planId);

  // Form handlers
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateOrg(editFields);
      toast('Profile Updated', 'Organization modifications have been saved.', 'success');
      setIsEditOpen(false);
    } catch (err: any) {
      toast('Update Failed', err.message || 'Operation failed.', 'error');
    }
  };

  const handleSuspendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspendReason.trim()) {
      toast('Reason Required', 'Justification must be supplied.', 'warning');
      return;
    }
    try {
      await suspendOrg({ reason: suspendReason });
      toast('Organization Suspended', `"${organization.name}" compliance lock applied.`, 'success');
      setIsSuspendOpen(false);
      setSuspendReason('');
    } catch (err: any) {
      toast('Suspension Failed', err.message || 'Operation failed.', 'error');
    }
  };

  const handleReactivateClick = async () => {
    try {
      await activateOrg();
      toast('Organization Reactivated', `"${organization.name}" operations are restored.`, 'success');
    } catch (err: any) {
      toast('Activation Failed', err.message || 'Operation failed.', 'error');
    }
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmNameDelete !== organization.name) {
      toast('Validation Error', 'Names do not match.', 'warning');
      return;
    }
    try {
      await deleteOrg();
      toast('Deleted Successfully', `"${organization.name}" has been deleted.`, 'success');
      setIsDeleteOpen(false);
      onBack();
    } catch (err: any) {
      toast('Deletion Failed', err.message || 'Operation failed.', 'error');
    }
  };

  const handleAddNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) {
      toast('Text Required', 'Please input notes detail.', 'warning');
      return;
    }
    try {
      const tags = noteTags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      await addNote({
        authorName: admin?.name || 'Support Executive',
        body: noteBody,
        tags
      });
      toast('Note Appended', 'Support log note updated.', 'success');
      setNoteBody('');
      setNoteTags('');
    } catch (err: any) {
      toast('Note Failed', err.message || 'Operation failed.', 'error');
    }
  };

  // Sub-resource Filters
  const filteredContests = contests
    .filter(c => {
      const matchSearch = c.title.toLowerCase().includes(contestSearch.toLowerCase()) || c.id.toLowerCase().includes(contestSearch.toLowerCase());
      const matchStatus = contestStatusFilter === 'all' || c.status === contestStatusFilter;
      return matchSearch && matchStatus;
    });

  const filteredParticipants = participants
    .filter(p => {
      const term = participantSearch.toLowerCase();
      const matchName = `${p.firstName} ${p.lastName}`.toLowerCase().includes(term);
      const matchContact = p.email.toLowerCase().includes(term) || p.phone.includes(term);
      return matchName || matchContact;
    });

  const TABS_LIST: Array<{ id: DetailTab; label: string; icon: any }> = [
    { id: 'overview', label: 'Overview', icon: Globe },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'contests', label: 'Contests', icon: Trophy },
    { id: 'participants', label: 'Participants', icon: User },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'notes', label: 'Support Notes', icon: Notebook },
    { id: 'subscription', label: 'Subscription', icon: Layers },
  ];

  return (
    <div id="org-detail-view" className="space-y-6 font-sans select-text pointer-events-auto">
      
      {/* Breadcrumb back navigation */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer hover:translate-x-[-2px] duration-150"
      >
        <ChevronLeft className="h-4 w-4" />
        <span>Back to organizations directory</span>
      </button>

      {/* Hero Header Area */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-card border border-border/50 rounded-xl p-6 shadow-sm">
        
        {/* Org Profile basics */}
        <div className="flex items-center gap-4 min-w-0">
          <img 
            src={organization.logoUrl} 
            alt={organization.name} 
            className="h-16 w-16 rounded bg-background border border-border/30 object-contain p-1 shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="truncate block">{organization.name}</span>
              {organization.status === 'ACTIVE' ? (
                <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0 animate-pulse" />
              )}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono text-[11px] uppercase tracking-wider">{organization.slug}</span>
              <span>•</span>
              <a 
                href={organization.website} 
                target="_blank" 
                rel="noreferrer" 
                className="hover:text-primary flex items-center gap-0.5 hover:underline"
              >
                <span>{organization.website.replace('https://', '')}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
              <span>•</span>
              <span>Joined {format(new Date(organization.createdAt), 'dd MMM yyyy')}</span>
            </div>
          </div>
        </div>

        {/* Header control deck actions */}
        <div className="flex flex-wrap gap-2 shrink-0">
          
          {/* Impersonate button */}
          <button 
            onClick={() => setIsImpersonateConfirmOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-black flex items-center gap-1.5 cursor-pointer shadow-sm transition-all hover:scale-[1.02]"
          >
            <User className="h-4 w-4" />
            <span>Impersonate Staff</span>
          </button>

          {/* Edit Profile button */}
          <button
            onClick={() => setIsEditOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-border/50 bg-card hover:bg-secondary/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-sm"
          >
            Edit Profile
          </button>

          {/* Suspend / Reactivate dropdown trigger */}
          {organization.status === 'ACTIVE' ? (
            <button
              onClick={() => setIsSuspendOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/20 border border-destructive/20 transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <Lock className="h-4 w-4" />
              <span>Suspend Tenant</span>
            </button>
          ) : (
            <button
              onClick={handleReactivateClick}
              disabled={isActivating}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <Unlock className="h-4 w-4" />
              <span>{isActivating ? 'Reclaiming...' : 'Reactivate Access'}</span>
            </button>
          )}

          {/* Destructive Delete button */}
          <button
            onClick={() => setIsDeleteOpen(true)}
            className="p-2 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-all cursor-pointer"
            title="Soft Delete Organization"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Compliance Warning banner */}
      {organization.status === 'SUSPENDED' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800 flex gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-red-600 animate-pulse" />
          <div className="space-y-1 font-sans">
            <span className="font-bold block text-sm">SaaS Compliance Lockdown Enforced</span>
            <p className="leading-relaxed text-[11px] text-slate-700">
              This organization is currently suspended due to security or billing compliance guidelines. 
              Administrator logins are locked, quiz portals are offline, and all automated registration fee payouts have been suspended.
            </p>
            {organization.suspendReason && (
              <p className="mt-1.5 p-2 bg-red-100/50 rounded border border-red-200 text-slate-800 italic">
                <span className="font-semibold not-italic">Lockdown Cause:</span> "{organization.suspendReason}"
              </p>
            )}
            {organization.suspendedAt && (
              <span className="block text-[10px] text-muted-foreground/90 font-mono mt-1">
                Lock enforced at: {format(new Date(organization.suspendedAt), 'dd MMM yyyy, HH:mm z')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Core Tabs Navigation bar */}
      <div className="border-b border-border/40 flex overflow-x-auto gap-4 scrollbar-none">
        {TABS_LIST.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-3 text-xs font-semibold relative shrink-0 transition-colors cursor-pointer ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <TabIcon className="h-4 w-4" />
              <span>{tab.label}</span>
              {isActive && (
                <motion.div 
                  layoutId="activeTabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Active Tab Container */}
      <div className="min-h-[300px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.12 }}
          >
            
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                
                {/* Statistics Highlights */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-5 rounded-xl border border-border/30 bg-card shadow-sm space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Quizzes Hosted</span>
                    <h3 className="text-2xl font-bold text-foreground font-mono">{contests.length}</h3>
                    <p className="text-[10px] text-muted-foreground">
                      {contests.filter(c => c.status === 'COMPLETED').length} completed • {contests.filter(c => c.status === 'PUBLISHED').length} scheduled
                    </p>
                  </div>
                  <div className="p-5 rounded-xl border border-border/30 bg-card shadow-sm space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Total Registrations</span>
                    <h3 className="text-2xl font-bold text-foreground font-mono">
                      {participants.length.toLocaleString('en-IN')}
                    </h3>
                    <p className="text-[10px] text-muted-foreground">
                      Across all hosted trivia and exams
                    </p>
                  </div>
                  <div className="p-5 rounded-xl border border-border/30 bg-card shadow-sm space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Total Revenue Log</span>
                    <h3 className="text-2xl font-bold text-foreground font-mono flex items-baseline">
                      <span className="text-lg mr-0.5 font-sans">₹</span>
                      {paymentAggregates.collected.toLocaleString('en-IN')}
                    </h3>
                    <p className="text-[10px] text-muted-foreground">
                      Includes renewal subs + user registration tickets
                    </p>
                  </div>
                </div>

                {/* Profile dossier and contacts details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Detailed profile cards */}
                  <div className="p-6 border border-border/30 rounded-xl bg-card space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Building className="h-4 w-4 text-primary" /> Tenant Information Dossier
                    </h4>
                    <div className="divide-y divide-border/25 text-xs">
                      <div className="py-2.5 flex justify-between">
                        <span className="text-muted-foreground">Tenant Slug</span>
                        <span className="font-mono font-semibold text-foreground">{organization.slug}</span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-muted-foreground">Billing Subscription Plan</span>
                        <span className="font-bold text-primary">{currentPlan?.name || organization.planId}</span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-muted-foreground">Administrative Staff</span>
                        <span className="font-mono text-foreground font-bold">{organization.memberCount || organization.membersCount} users</span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-muted-foreground">Created On</span>
                        <span className="text-foreground">{format(new Date(organization.createdAt), 'dd MMMM yyyy, hh:mm a')}</span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-muted-foreground">Last Updated Profile</span>
                        <span className="text-foreground">{organization.updatedAt ? format(new Date(organization.updatedAt), 'dd MMM yyyy, hh:mm a') : 'Unrecorded'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Owner contacts person card */}
                  <div className="p-6 border border-border/30 rounded-xl bg-card space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <User className="h-4 w-4 text-primary" /> Primary Legal Contact
                    </h4>
                    <div className="space-y-4 text-xs font-sans">
                      <div className="flex items-center gap-3 bg-secondary/10 p-3 rounded-xl border border-border/20">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {organization.ownerName?.charAt(0) || 'C'}
                        </div>
                        <div>
                          <span className="font-bold text-foreground block text-sm">{organization.ownerName || organization.contactPerson.name}</span>
                          <span className="text-[10px] text-muted-foreground">Primary Owner / Account Manager</span>
                        </div>
                      </div>

                      <div className="space-y-2 pt-1 px-1">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Mail className="h-4.5 w-4.5 text-muted-foreground shrink-0" />
                          <a href={`mailto:${organization.ownerEmail || organization.contactPerson.email}`} className="hover:text-primary hover:underline font-semibold text-foreground">
                            {organization.ownerEmail || organization.contactPerson.email}
                          </a>
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Phone className="h-4.5 w-4.5 text-muted-foreground" />
                          <span className="font-semibold text-foreground font-mono">{organization.contactPerson.phone}</span>
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Globe className="h-4.5 w-4.5 text-muted-foreground" />
                          <a href={organization.website} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline text-foreground truncate">
                            {organization.website}
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* MEMBERS TAB */}
            {activeTab === 'members' && (
              <div className="bg-card border border-border/30 rounded-xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-secondary/10 border-b border-border/25">
                  <h3 className="font-semibold text-sm">Tenant Authorized Administrators</h3>
                  <p className="text-[11px] text-muted-foreground">Staff members authorized to login to the tenant's own dashboard.</p>
                </div>

                <div className="overflow-x-auto">
                  {isLoadingMembers ? (
                    <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">Loading staff logs...</div>
                  ) : members.length === 0 ? (
                    <div className="p-12 text-center text-xs text-muted-foreground">No administrators found.</div>
                  ) : (
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-border/30 bg-secondary/5 text-muted-foreground font-semibold">
                          <th className="py-3 px-6">Name</th>
                          <th className="py-3 px-6">Email Address</th>
                          <th className="py-3 px-6">Access Role</th>
                          <th className="py-3 px-6 text-right">Joined Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/25">
                        {members.map(member => (
                          <tr key={member.id} className="hover:bg-secondary/15 transition-all">
                            <td className="py-3.5 px-6 font-semibold text-foreground flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-secondary/80 flex items-center justify-center text-[10px] font-bold">
                                {member.name.charAt(0)}
                              </div>
                              <span>{member.name}</span>
                            </td>
                            <td className="py-3.5 px-6 font-mono text-muted-foreground">{member.email}</td>
                            <td className="py-3.5 px-6">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                                member.role === 'Owner' 
                                  ? 'bg-primary/10 text-primary border-primary/20' 
                                  : member.role === 'Admin' 
                                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                              }`}>
                                {member.role}
                              </span>
                            </td>
                            <td className="py-3.5 px-6 text-right text-muted-foreground font-mono">
                              {format(new Date(member.joinedDate), 'dd MMM yyyy')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* CONTESTS TAB */}
            {activeTab === 'contests' && (
              <div className="space-y-4">
                
                {/* Search & filters */}
                <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-card p-3 border border-border/30 rounded-xl shadow-sm">
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute inset-y-0 left-2.5 my-auto h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search quizzes by title or ID..."
                      value={contestSearch}
                      onChange={(e) => setContestSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/35 focus:bg-card border border-border/40 rounded-md outline-none text-foreground font-sans"
                    />
                  </div>
                  
                  <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Status:</span>
                    <select
                      value={contestStatusFilter}
                      onChange={(e) => setContestStatusFilter(e.target.value)}
                      className="px-2 py-1.5 text-xs bg-secondary/35 border border-border/40 rounded outline-none text-foreground cursor-pointer font-medium"
                    >
                      <option value="all">All Quizzes</option>
                      <option value="DRAFT">Draft</option>
                      <option value="PUBLISHED">Published</option>
                      <option value="LIVE">Live Now</option>
                      <option value="EVALUATION">Evaluating</option>
                      <option value="RESULTS_OUT">Results Out</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>
                </div>

                {/* Contests table */}
                <div className="bg-card border border-border/30 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    {filteredContests.length === 0 ? (
                      <div className="p-12 text-center text-xs text-muted-foreground">No contests matching filters.</div>
                    ) : (
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-border/30 bg-secondary/10 text-muted-foreground font-semibold">
                            <th className="py-3 px-4">Quiz Title</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Scheduled Date</th>
                            <th className="py-3 px-4 text-center">Duration</th>
                            <th className="py-3 px-4 text-right">Fee</th>
                            <th className="py-3 px-4 text-right">Participants</th>
                            <th className="py-3 px-4 text-right">Revenue</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/25">
                          {filteredContests.map(c => {
                            const badge = CONTEST_BADGES[c.status] || { label: c.status, style: 'bg-muted' };
                            return (
                              <tr key={c.id} className="hover:bg-secondary/15 transition-all">
                                <td className="py-3 px-4 font-semibold text-foreground">
                                  <div className="max-w-[180px] truncate">
                                    <span>{c.title}</span>
                                    <span className="block text-[10px] font-mono text-muted-foreground uppercase leading-none mt-0.5">ID: {c.id}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide ${badge.style}`}>
                                    {badge.label}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-muted-foreground">
                                  {format(new Date(c.startTime), 'dd MMM yyyy, hh:mm a')}
                                </td>
                                <td className="py-3 px-4 text-center font-mono text-muted-foreground">{c.duration} mins</td>
                                <td className="py-3 px-4 text-right font-mono text-foreground/80">₹{c.registrationFee}</td>
                                <td className="py-3 px-4 text-right font-mono font-bold text-foreground/80">{c.participantCount}</td>
                                <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">₹{(c.revenueCollected || 0).toLocaleString('en-IN')}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* PARTICIPANTS TAB */}
            {activeTab === 'participants' && (
              <div className="space-y-4">
                
                {/* Search */}
                <div className="flex bg-card p-3 border border-border/30 rounded-xl shadow-sm">
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute inset-y-0 left-2.5 my-auto h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search participants by name, email, phone..."
                      value={participantSearch}
                      onChange={(e) => setParticipantSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/35 focus:bg-card border border-border/40 rounded-md outline-none text-foreground font-sans"
                    />
                  </div>
                </div>

                {/* Table */}
                <div className="bg-card border border-border/30 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    {isLoadingParticipants ? (
                      <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">Loading registration rolls...</div>
                    ) : filteredParticipants.length === 0 ? (
                      <div className="p-12 text-center text-xs text-muted-foreground">No participants found matching details.</div>
                    ) : (
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-border/30 bg-secondary/10 text-muted-foreground font-semibold">
                            <th className="py-3 px-4">Name</th>
                            <th className="py-3 px-4">Contact Person</th>
                            <th className="py-3 px-4">Contest Quiz</th>
                            <th className="py-3 px-4">Quiz Status</th>
                            <th className="py-3 px-4">Payment</th>
                            <th className="py-3 px-4 text-right">Fee Paid</th>
                            <th className="py-3 px-4 text-right">Registered Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/25 font-sans">
                          {filteredParticipants.map(p => {
                            const quizTitle = contests.find(c => c.id === p.contestId)?.title || p.contestId;
                            
                            return (
                              <tr key={p.id} className="hover:bg-secondary/15 transition-all">
                                <td className="py-3 px-4 font-semibold text-foreground">
                                  {p.firstName} {p.lastName}
                                </td>
                                <td className="py-3 px-4 space-y-0.5">
                                  <span className="block font-mono text-muted-foreground text-[10px]">{p.email}</span>
                                  <span className="block text-muted-foreground/80 font-mono text-[10px]">{p.phone}</span>
                                </td>
                                <td className="py-3 px-4 font-medium text-slate-700 truncate max-w-[150px]" title={quizTitle}>
                                  {quizTitle}
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase border tracking-wide ${
                                    p.status === 'SUBMITTED' 
                                      ? 'bg-teal-50 text-teal-700 border-teal-200' 
                                      : p.status === 'IN_QUIZ' 
                                      ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse' 
                                      : p.status === 'REGISTERED' 
                                      ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                      : 'bg-slate-50 text-slate-600 border-slate-200'
                                  }`}>
                                    {p.status.replace('_', ' ')}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border tracking-wide ${
                                    p.paymentStatus === 'PAID' 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                      : p.paymentStatus === 'PENDING' 
                                      ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                      : 'bg-red-50 text-red-700 border-red-200'
                                  }`}>
                                    {p.paymentStatus}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right font-mono font-semibold text-foreground/80">₹{p.paymentAmount}</td>
                                <td className="py-3 px-4 text-right text-muted-foreground font-mono">
                                  {format(new Date(p.registeredAt), 'dd MMM, hh:mm')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* PAYMENTS TAB */}
            {activeTab === 'payments' && (
              <div className="space-y-6">
                
                {/* Collected summaries cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider block">Total Collected</span>
                      <h3 className="text-xl font-bold font-mono text-emerald-700 flex items-baseline">
                        <span className="text-sm mr-0.5 font-sans">₹</span>
                        {paymentAggregates.collected.toLocaleString('en-IN')}
                      </h3>
                    </div>
                    <CheckCircle2 className="h-7 w-7 text-emerald-600/70" />
                  </div>

                  <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-amber-800 font-bold uppercase tracking-wider block">Pending / Unpaid</span>
                      <h3 className="text-xl font-bold font-mono text-amber-700 flex items-baseline">
                        <span className="text-sm mr-0.5 font-sans">₹</span>
                        {paymentAggregates.pending.toLocaleString('en-IN')}
                      </h3>
                    </div>
                    <Clock className="h-7 w-7 text-amber-600/70 animate-pulse" />
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-800 font-bold uppercase tracking-wider block">Refunds Paid</span>
                      <h3 className="text-xl font-bold font-mono text-slate-700 flex items-baseline">
                        <span className="text-sm mr-0.5 font-sans">₹</span>
                        {paymentAggregates.refunded.toLocaleString('en-IN')}
                      </h3>
                    </div>
                    <AlertCircle className="h-7 w-7 text-slate-600/70" />
                  </div>
                </div>

                {/* Ledger table */}
                <div className="bg-card border border-border/30 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-border/25 bg-secondary/10 flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-sm">Financial Receipts & Ledger</h3>
                      <p className="text-[11px] text-muted-foreground">Comprehensive transactional timeline of both subscriptions and quiz tickets.</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    {isLoadingPayments ? (
                      <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">Computing financials...</div>
                    ) : payments.length === 0 ? (
                      <div className="p-12 text-center text-xs text-muted-foreground">No payment transactions found.</div>
                    ) : (
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-border/30 bg-secondary/5 text-muted-foreground font-semibold">
                            <th className="py-3 px-5">Payee Name</th>
                            <th className="py-3 px-5">Source Item</th>
                            <th className="py-3 px-5">Description</th>
                            <th className="py-3 px-5">Reference ID</th>
                            <th className="py-3 px-5">Gateway</th>
                            <th className="py-3 px-5 text-right">Amount</th>
                            <th className="py-3 px-5">Status</th>
                            <th className="py-3 px-5 text-right">Transaction Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/25 font-sans">
                          {payments.map(p => (
                            <tr key={p.id} className="hover:bg-secondary/15 transition-all">
                              <td className="py-3.5 px-5 font-semibold text-foreground">{p.payeeName}</td>
                              <td className="py-3.5 px-5">
                                <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                  p.source === 'subscription' 
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}>
                                  {p.source.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="py-3.5 px-5 text-slate-700 font-medium max-w-[180px] truncate">{p.description}</td>
                              <td className="py-3.5 px-5 font-mono text-muted-foreground text-[10px]">{p.referenceId}</td>
                              <td className="py-3.5 px-5 text-muted-foreground">{p.paymentMethod}</td>
                              <td className="py-3.5 px-5 text-right font-mono font-bold text-foreground">₹{p.amount.toLocaleString('en-IN')}</td>
                              <td className="py-3.5 px-5">
                                <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide ${
                                  p.status === 'PAID' 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                    : p.status === 'PENDING' 
                                    ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                    : p.status === 'REFUNDED'
                                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                                    : 'bg-red-50 text-red-700 border-red-200'
                                }`}>
                                  {p.status}
                                </span>
                              </td>
                              <td className="py-3.5 px-5 text-right text-muted-foreground font-mono">
                                {format(new Date(p.date), 'dd MMM yyyy, hh:mm a')}
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

            {/* NOTES TAB */}
            {activeTab === 'notes' && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                
                {/* Note creation form */}
                <div className="lg:col-span-2 p-5 bg-card border border-border/30 rounded-xl shadow-sm space-y-4 h-fit">
                  <div className="space-y-0.5">
                    <h3 className="font-bold text-sm">Append Support Log Note</h3>
                    <p className="text-[11px] text-muted-foreground">Add internal audit remarks regarding terms checks or billing discussions.</p>
                  </div>

                  <form onSubmit={handleAddNoteSubmit} className="space-y-3 font-sans">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Note Content</label>
                      <textarea
                        required
                        rows={4}
                        placeholder="Detail the interaction, discussion, or warning issued..."
                        value={noteBody}
                        onChange={(e) => setNoteBody(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-secondary/15 focus:bg-card border border-border/55 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground resize-none leading-relaxed"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Tags (comma-separated)</label>
                      <input
                        type="text"
                        placeholder="e.g. Support, Billing, Warning"
                        value={noteTags}
                        onChange={(e) => setNoteTags(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-secondary/15 focus:bg-card border border-border/55 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground font-mono"
                      />
                    </div>

                    {/* Quick selects */}
                    <div className="flex flex-wrap gap-1.5">
                      {['Upgrade', 'Sales', 'Infringement', 'Abuse', 'Billing'].map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            const prev = noteTags ? noteTags.split(',').map(t => t.trim()) : [];
                            if (!prev.includes(tag)) {
                              const next = [...prev, tag].filter(Boolean).join(', ');
                              setNoteTags(next);
                            }
                          }}
                          className="px-2 py-0.5 text-[9px] font-semibold border border-border bg-secondary/10 hover:bg-secondary/40 text-muted-foreground rounded transition-all cursor-pointer"
                        >
                          +{tag}
                        </button>
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={isAddingNote}
                      className="w-full py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/95 transition-all shadow-sm cursor-pointer"
                    >
                      {isAddingNote ? 'Appending Note...' : 'Add Note Entry'}
                    </button>
                  </form>
                </div>

                {/* Timeline */}
                <div className="lg:col-span-3 space-y-4">
                  <h3 className="font-bold text-sm">Interact/Audit Timeline Notes</h3>
                  
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {!organization.notes || organization.notes.length === 0 ? (
                      <div className="p-12 text-center text-xs text-muted-foreground border border-dashed border-border/30 rounded-xl bg-secondary/10">
                        No support log notes recorded for this tenant.
                      </div>
                    ) : (
                      organization.notes.map((note) => (
                        <div 
                          key={note.id} 
                          className="p-4 border border-border/30 bg-card rounded-xl shadow-sm space-y-2.5 font-sans relative"
                        >
                          <div className="flex justify-between items-center text-[10px]">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-foreground">{note.authorName}</span>
                              <span className="text-muted-foreground">• Support Desk</span>
                            </div>
                            <span className="font-mono text-muted-foreground/80">
                              {format(new Date(note.createdAt), 'dd MMM yyyy, HH:mm')}
                            </span>
                          </div>

                          <p className="text-xs text-slate-700 leading-relaxed font-sans">{note.body}</p>

                          {note.tags && note.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1 border-t border-border/10">
                              {note.tags.map((tag) => (
                                <span 
                                  key={tag} 
                                  className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground text-[9px] font-bold border border-border/50 uppercase tracking-wide font-sans"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* SUBSCRIPTION LIMITS TAB */}
            {activeTab === 'subscription' && (
              <OrganizationSubscriptionTab organization={organization} />
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* SECURE ADMINISTRATOR IMPERSONATION DIALOG */}
      {isImpersonateConfirmOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border/50 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/40">
              <h3 className="font-bold text-amber-500 text-sm flex items-center gap-1.5">
                <User className="h-4 w-4" /> Secure Admin Impersonation
              </h3>
              <button onClick={() => setIsImpersonateConfirmOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                You are about to initiate an impersonation session for <strong className="text-foreground font-bold">{organization?.name}</strong>. 
              </p>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-600 leading-normal font-medium space-y-1">
                <p>⚠️ <strong>Audited Action:</strong> This session will be recorded in the security audit ledger as initiated by <strong>{admin?.name}</strong> ({admin?.role}).</p>
                <p>🖥️ <strong>Data Scoping:</strong> All homepage statistics, charts, upcoming contests, and active participant numbers will be filtered to match only this organization's records.</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsImpersonateConfirmOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmImpersonation}
                className="px-4 py-2 text-xs font-bold rounded-md bg-amber-500 hover:bg-amber-600 text-black shadow-sm cursor-pointer transition-all hover:scale-105 animate-pulse"
              >
                Confirm & Start Impersonation
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* COMPLIANCE SUSPEND DIALOG */}
      {isSuspendOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border/50 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/40">
              <h3 className="font-bold text-destructive text-sm flex items-center gap-1.5">
                <Lock className="h-4 w-4" /> Compliance Access Suspension
              </h3>
              <button onClick={() => setIsSuspendOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Applying a suspension will lock all staff access, freeze payments, and place quiz portals offline immediately.
            </p>

            <form onSubmit={handleSuspendSubmit} className="space-y-3 font-sans">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-destructive block">Compliance Reason / Remarks</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Terms violation, multiple copyright notices, billing issues"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-destructive focus:ring-1 focus:ring-destructive transition-all text-foreground"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSuspendOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSuspending}
                  className="px-4 py-2 text-xs font-semibold rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/95 transition-all"
                >
                  {isSuspending ? 'Suspending...' : 'Confirm Suspension'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* EDIT PROFILE DIALOG */}
      {isEditOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border/50 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4 font-sans"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/40">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                Edit Organization Profile
              </h3>
              <button onClick={() => setIsEditOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Organization Name</label>
                <input
                  type="text"
                  required
                  placeholder=" Bangalore Trivia Society"
                  value={editFields.name}
                  onChange={(e) => setEditFields(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Website URL</label>
                <input
                  type="text"
                  required
                  placeholder="https://bangaloretrivia.in"
                  value={editFields.website}
                  onChange={(e) => setEditFields(prev => ({ ...prev, website: e.target.value }))}
                  className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Logo Image URL</label>
                <input
                  type="text"
                  required
                  placeholder="https://images.unsplash.com/..."
                  value={editFields.logoUrl}
                  onChange={(e) => setEditFields(prev => ({ ...prev, logoUrl: e.target.value }))}
                  className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Pricing Subscription Tier</label>
                <select
                  value={editFields.planId}
                  onChange={(e) => setEditFields(prev => ({ ...prev, planId: e.target.value }))}
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
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/95 transition-all animate-all"
                >
                  {isUpdating ? 'Saving profile...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* DESTROY CONFIRM MODAL */}
      {isDeleteOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-destructive/30 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4 font-sans"
          >
            <div className="flex items-center gap-2 pb-2 border-b border-border/40 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 animate-pulse" />
              <h3 className="font-bold text-sm">Authorize Destructive Soft-Delete</h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              You are about to soft-delete <span className="font-bold text-foreground">{organization.name}</span>. 
              This will disable their billing subscription plan and hide the tenant from standard directory lists.
            </p>

            <form onSubmit={handleDeleteSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Please type <span className="font-mono font-bold text-foreground">"{organization.name}"</span> to confirm:
                </label>
                <input
                  type="text"
                  required
                  placeholder={organization.name}
                  value={confirmNameDelete}
                  onChange={(e) => setConfirmNameDelete(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteOpen(false);
                    setConfirmNameDelete('');
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || confirmNameDelete !== organization.name}
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
