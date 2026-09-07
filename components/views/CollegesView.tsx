'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { State, City } from 'country-state-city';
import { useColleges, useCollegeDepartments, useUnlistedRequests } from '@/lib/hooks/useColleges';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/SearchSelect';
import { College, Department } from '@/lib/types';
import {
  GraduationCap,
  Building2,
  Landmark,
  Plus,
  Pencil,
  Lock,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  AlertTriangle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

type ToastFn = (title: string, description?: string, type?: 'success' | 'warning' | 'error' | 'info') => void;

const PAGE_SIZE = 20;

// Region pickers are India-only for now (fits the platform's colleges), backed by the
// country-state-city dataset already used elsewhere in this codebase (Quizbuzz-new's
// org onboarding). That dataset has no separate district tier — "district" reuses the
// same state-scoped city/town list as "city" (in India these overlap heavily, e.g.
// "Nashik" is both a city and a district), which still gives a controlled, typo-free
// value instead of free text, just without a fully distinct district dataset.
const INDIA_ISO = 'IN';
const INDIA_STATE_OPTIONS: SearchSelectOption[] = State.getStatesOfCountry(INDIA_ISO).map((s) => ({
  value: s.name,
  label: s.name,
}));

function useIndiaCityOptions(stateName: string): SearchSelectOption[] {
  return useMemo(() => {
    if (!stateName) return [];
    const state = State.getStatesOfCountry(INDIA_ISO).find((s) => s.name === stateName);
    if (!state) return [];
    return City.getCitiesOfState(INDIA_ISO, state.isoCode).map((c) => ({ value: c.name, label: c.name }));
  }, [stateName]);
}

// ─── Department search + CRUD, shown inside the big per-college modal — a college can
// have 25+ departments, so this needs its own scrollable, searchable space rather than a
// cramped panel inline in the table row. ───
function DepartmentsManager({ collegeId, canManage, toast }: { collegeId: string; canManage: boolean; toast: ToastFn }) {
  const { departments, isLoadingDepartments, createDepartment, isCreatingDepartment, updateDepartment } =
    useCollegeDepartments(collegeId);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => d.name.toLowerCase().includes(q));
  }, [departments, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createDepartment({ name: name.trim() });
      setName('');
    } catch (err: any) {
      toast('Failed to Add Department', err?.message || 'Could not create the department.', 'error');
    }
  };

  const handleRename = async (department: Department) => {
    if (!editing || editing.id !== department.id || !editing.name.trim()) return;
    try {
      await updateDepartment({ departmentId: department.id, name: editing.name.trim() });
      setEditing(null);
    } catch (err: any) {
      toast('Failed to Update Department', err?.message || 'Could not update the department.', 'error');
    }
  };

  const toggleActive = async (department: Department) => {
    try {
      await updateDepartment({ departmentId: department.id, isActive: !department.isActive });
    } catch (err: any) {
      toast('Failed to Update Department', err?.message || 'Could not update the department.', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute inset-y-0 left-3 my-auto h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search departments..."
            className="w-full pl-8 pr-3 h-9 text-xs bg-secondary/30 hover:bg-secondary/50 focus:bg-card border border-border/40 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
          />
        </div>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
          {departments.length} total
        </span>
      </div>

      {/* Add form stays pinned above the list — with 25+ departments this would otherwise
          get pushed further down (and eventually off-screen) the more get added below it. */}
      {canManage && (
        <form onSubmit={handleCreate} className="flex items-end gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Department name, e.g. Computer Science"
            className="flex-1 h-9 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground"
          />
          <button
            type="submit"
            disabled={isCreatingDepartment || !name.trim()}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-bold cursor-pointer disabled:opacity-50 shrink-0"
          >
            {isCreatingDepartment ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}

      {/* Fixed-height scroll area (not max-height) so the list's footprint stays constant
          as departments are added/removed, instead of the modal growing and shrinking. */}
      <div className="h-[420px] overflow-y-auto space-y-1.5 pr-1 border-t border-border/20 pt-3">
        {isLoadingDepartments ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Loading departments…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            {departments.length === 0 ? 'No departments yet.' : 'No departments match your search.'}
          </p>
        ) : (
          filtered.map((department) => (
            <div
              key={department.id}
              className="flex items-center justify-between gap-3 p-2.5 bg-secondary/20 border border-border/30 rounded-lg"
            >
              {editing?.id === department.id ? (
                <input
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ id: department.id, name: e.target.value })}
                  onBlur={() => handleRename(department)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename(department)}
                  className="flex-1 h-7 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground"
                />
              ) : (
                <span className="text-xs font-semibold text-foreground">{department.name}</span>
              )}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleActive(department)}
                  disabled={!canManage}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer disabled:cursor-default ${
                    department.isActive ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {department.isActive ? 'ACTIVE' : 'RETIRED'}
                </button>
                {canManage && (
                  <button
                    onClick={() => setEditing({ id: department.id, name: department.name })}
                    className="p-1 rounded-md hover:bg-secondary/60 cursor-pointer"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Big modal: college identity/region fields (editable in place) + full department
// management. Replaces the old expand-in-place row panel — at the scale this is meant to
// handle (hundreds of colleges, 10-25+ departments each), an inline panel per row doesn't
// give departments enough room to search/manage. ───
function CollegeModal({
  college,
  canManage,
  toast,
  onClose,
  onSave,
}: {
  college: College;
  canManage: boolean;
  toast: ToastFn;
  onClose: () => void;
  onSave: (input: { name?: string; state?: string; district?: string; city?: string; isActive?: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(college.name);
  const [state, setState] = useState(college.state ?? '');
  const [district, setDistrict] = useState(college.district ?? '');
  const [city, setCity] = useState(college.city ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const cityOptions = useIndiaCityOptions(state);

  // Re-sync local fields if the college's data refreshes from under us (e.g. after a
  // department mutation invalidates the list) — never clobber an in-progress edit though.
  useEffect(() => {
    setName(college.name);
    setState(college.state ?? '');
    setDistrict(college.district ?? '');
    setCity(college.city ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [college.id]);

  const handleSaveInfo = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await onSave({ name: name.trim(), state: state.trim(), district: district.trim(), city: city.trim() });
      toast('College Updated', `"${name.trim()}" has been updated.`, 'success');
    } catch (err: any) {
      toast('Failed to Update College', err?.message || 'Could not update the college.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async () => {
    try {
      await onSave({ isActive: !college.isActive });
    } catch (err: any) {
      toast('Failed to Update College', err?.message || 'Could not update the college.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border/60 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border/20 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Manage college</p>
            <h2 className="text-lg font-black text-foreground tracking-tight truncate">{college.name}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary/60 cursor-pointer shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                College details
              </label>
              <button
                onClick={toggleActive}
                disabled={!canManage}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer disabled:cursor-default ${
                  college.isActive ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {college.isActive ? 'ACTIVE' : 'RETIRED'}
              </button>
            </div>
            <input
              value={name}
              disabled={!canManage}
              onChange={(e) => setName(e.target.value)}
              placeholder="College name"
              className="w-full h-9 px-2 text-sm font-semibold rounded-md bg-background border border-border/40 text-foreground disabled:opacity-60"
            />
            <div className="grid grid-cols-3 gap-2">
              <SearchSelect
                options={INDIA_STATE_OPTIONS}
                value={state}
                disabled={!canManage}
                onChange={(v) => {
                  setState(v);
                  setDistrict('');
                  setCity('');
                }}
                placeholder="State"
                searchPlaceholder="Search states..."
              />
              <SearchSelect
                options={cityOptions}
                value={district}
                disabled={!canManage || !state}
                onChange={setDistrict}
                placeholder="District"
                searchPlaceholder="Search..."
              />
              <SearchSelect
                options={cityOptions}
                value={city}
                disabled={!canManage || !state}
                onChange={setCity}
                placeholder="City"
                searchPlaceholder="Search..."
              />
            </div>
            {canManage && (
              <button
                onClick={handleSaveInfo}
                disabled={isSaving || !name.trim()}
                className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Save details'}
              </button>
            )}
            <p className="text-[10px] text-muted-foreground pt-1">
              By {college.createdByName} · Updated {format(parseISO(college.updatedAt), 'dd MMM yyyy, hh:mm a')}
            </p>
          </div>

          <div className="space-y-3 pt-2 border-t border-border/20">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Departments
            </label>
            <DepartmentsManager collegeId={college.id} canManage={canManage} toast={toast} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateCollegeModal({
  initialName,
  onClose,
  onSubmit,
  submitting,
}: {
  initialName?: string;
  onClose: () => void;
  onSubmit: (input: { name: string; state?: string; district?: string; city?: string }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(initialName ?? '');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const cityOptions = useIndiaCityOptions(state);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border/60 rounded-xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between">
          <h2 className="text-base font-black text-foreground tracking-tight">New College</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary/60 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="XYZ University"
              className="w-full h-9 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">State</label>
              <SearchSelect
                options={INDIA_STATE_OPTIONS}
                value={state}
                onChange={(v) => {
                  setState(v);
                  setDistrict('');
                  setCity('');
                }}
                placeholder="State"
                searchPlaceholder="Search states..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">District</label>
              <SearchSelect
                options={cityOptions}
                value={district}
                onChange={setDistrict}
                disabled={!state}
                placeholder="District"
                searchPlaceholder="Search..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">City</label>
              <SearchSelect
                options={cityOptions}
                value={city}
                onChange={setCity}
                disabled={!state}
                placeholder="City"
                searchPlaceholder="Search..."
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/20">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md hover:bg-secondary/60 text-foreground font-semibold text-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            disabled={submitting || !name.trim()}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                state: state.trim() || undefined,
                district: district.trim() || undefined,
                city: city.trim() || undefined,
              })
            }
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground font-extrabold text-xs cursor-pointer disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Create College'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── "Other" submissions report — a college/department participant typed as free text
// because it wasn't in the catalog. Read-only aggregation off the main app's own contacts
// table (see colleges.repository.ts's listUnlistedColleges/listUnlistedDepartments); this
// is the visibility the "Not listed" fallback was missing — otherwise those submissions are
// just free text with no way to tell which colleges are worth adding to the catalog. ───
function UnlistedRequestsPanel({
  onAddCollege,
  onViewCollege,
}: {
  onAddCollege: (name: string) => void;
  onViewCollege: (collegeId: string) => void;
}) {
  const { unlistedColleges, unlistedDepartments, isLoadingUnlisted } = useUnlistedRequests();
  const [expanded, setExpanded] = useState(false);
  const totalRequests = unlistedColleges.length + unlistedDepartments.length;

  if (!isLoadingUnlisted && totalRequests === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3 p-4 cursor-pointer hover:bg-secondary/20 transition-colors text-left"
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-sm font-bold text-foreground shrink-0">Unlisted requests</span>
          {!isLoadingUnlisted && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 shrink-0">
              {totalRequests}
            </span>
          )}
          <span className="text-xs text-muted-foreground truncate">
            Colleges/departments participants typed as &quot;Other&quot; — worth adding to the catalog?
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/20 p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Colleges not in catalog ({unlistedColleges.length})
            </p>
            {isLoadingUnlisted ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : unlistedColleges.length === 0 ? (
              <p className="text-xs text-muted-foreground">None — every registration matched a catalog college.</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {unlistedColleges.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between gap-2 p-2 bg-secondary/20 border border-border/30 rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.count} registration{c.count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <button
                      onClick={() => onAddCollege(c.name)}
                      className="shrink-0 h-7 px-2 rounded-md bg-primary text-primary-foreground text-[10px] font-bold cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Departments not in catalog ({unlistedDepartments.length})
            </p>
            {isLoadingUnlisted ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : unlistedDepartments.length === 0 ? (
              <p className="text-xs text-muted-foreground">None — every registration matched a catalog department.</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {unlistedDepartments.map((d) => (
                  <div
                    key={`${d.collegeId ?? d.college}-${d.department}`}
                    className="flex items-center justify-between gap-2 p-2 bg-secondary/20 border border-border/30 rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{d.department}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {d.college || 'Unknown college'} · {d.count} registration{d.count === 1 ? '' : 's'}
                      </p>
                    </div>
                    {d.collegeId && (
                      <button
                        onClick={() => onViewCollege(d.collegeId!)}
                        className="shrink-0 h-7 px-2 rounded-md border border-border/50 text-[10px] font-semibold cursor-pointer hover:bg-secondary/60"
                      >
                        View
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type SortField = 'name' | 'departmentCount' | 'updatedAt';

export default function CollegesView() {
  const { colleges, isLoadingColleges, createCollege, isCreatingCollege, updateCollege } = useColleges();
  const { hasPermission } = useCurrentAdmin();
  const { toast } = useToast();
  const canManage = hasPermission('COLLEGE_MANAGE');

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'retired'>('all');
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createPrefillName, setCreatePrefillName] = useState<string | undefined>(undefined);
  const [manageCollegeId, setManageCollegeId] = useState<string | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, stateFilter, statusFilter]);

  const states = useMemo(() => {
    const set = new Set(colleges.map((c) => c.state).filter((s): s is string => !!s));
    return Array.from(set).sort();
  }, [colleges]);

  const totalDepartments = useMemo(() => colleges.reduce((sum, c) => sum + c.departmentCount, 0), [colleges]);
  const activeCount = useMemo(() => colleges.filter((c) => c.isActive).length, [colleges]);

  const filteredSorted = useMemo(() => {
    let rows = colleges;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.city ?? '').toLowerCase().includes(q) ||
          (c.district ?? '').toLowerCase().includes(q)
      );
    }
    if (stateFilter !== 'all') rows = rows.filter((c) => c.state === stateFilter);
    if (statusFilter !== 'all') rows = rows.filter((c) => (statusFilter === 'active' ? c.isActive : !c.isActive));

    return [...rows].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const aCmp = typeof aVal === 'string' ? aVal.toLowerCase() : aVal;
      const bCmp = typeof bVal === 'string' ? bVal.toLowerCase() : bVal;
      if (aCmp < bCmp) return sortOrder === 'asc' ? -1 : 1;
      if (aCmp > bCmp) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [colleges, search, stateFilter, statusFilter, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const pageRows = filteredSorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const manageCollege = manageCollegeId ? colleges.find((c) => c.id === manageCollegeId) ?? null : null;

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleCreate = async (input: { name: string; state?: string; district?: string; city?: string }) => {
    try {
      await createCollege(input);
      toast('College Created', `"${input.name}" is now available in the registration dropdown.`, 'success');
      setIsCreateOpen(false);
    } catch (err: any) {
      toast('Failed to Create College', err?.message || 'Could not create the college.', 'error');
    }
  };

  const handleSaveCollege = async (input: {
    name?: string;
    state?: string;
    district?: string;
    city?: string;
    isActive?: boolean;
  }) => {
    if (!manageCollegeId) return;
    await updateCollege({ id: manageCollegeId, ...input });
  };

  if (isLoadingColleges) {
    return (
      <div className="space-y-6 font-sans animate-pulse">
        <div className="h-10 w-64 bg-secondary/30 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-card rounded-xl border border-border/30" />
          ))}
        </div>
        <div className="h-96 bg-card rounded-xl border border-border/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <GraduationCap className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Ops Workspace</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Colleges &amp; Departments</h1>
          <p className="text-xs text-muted-foreground max-w-xl">
            The canonical college/department list offered as a dropdown at contest registration and ambassador
            signup, replacing free text so leaderboards can group and sort consistently.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setCreatePrefillName(undefined);
              setIsCreateOpen(true);
            }}
            className="flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-bold cursor-pointer self-start md:self-center shrink-0"
          >
            <Plus className="h-4 w-4" />
            New College
          </button>
        )}
      </div>

      {canManage && (
        <UnlistedRequestsPanel
          onAddCollege={(name) => {
            setCreatePrefillName(name);
            setIsCreateOpen(true);
          }}
          onViewCollege={(collegeId) => setManageCollegeId(collegeId)}
        />
      )}

      {!canManage && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl flex items-start gap-3">
          <Lock className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold">Read-Only Access</h4>
            <p className="leading-relaxed opacity-90">
              Creating or editing colleges and departments is limited to <strong>SUPER_ADMIN</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Colleges</p>
            <h3 className="text-2xl font-bold font-mono tracking-tight text-foreground">{colleges.length}</h3>
            <p className="text-[10px] text-muted-foreground">{activeCount} active</p>
          </div>
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Departments</p>
            <h3 className="text-2xl font-bold font-mono tracking-tight text-foreground">{totalDepartments}</h3>
            <p className="text-[10px] text-muted-foreground">across all colleges</p>
          </div>
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <Building2 className="h-5 w-5" />
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">States Covered</p>
            <h3 className="text-2xl font-bold font-mono tracking-tight text-foreground">{states.length}</h3>
            <p className="text-[10px] text-muted-foreground">with at least one college</p>
          </div>
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <Landmark className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Search & Filter toolbar */}
      <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center bg-card p-4 rounded-xl border border-border/50 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search colleges by name, city, or district..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-secondary/30 hover:bg-secondary/50 focus:bg-card border border-border/40 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-3 my-auto text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">State:</span>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-secondary/30 hover:bg-secondary/50 border border-border/40 rounded-md outline-none text-foreground cursor-pointer font-medium"
            >
              <option value="all">All States</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'retired')}
              className="px-2.5 py-1.5 text-xs bg-secondary/30 hover:bg-secondary/50 border border-border/40 rounded-md outline-none text-foreground cursor-pointer font-medium"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/40 bg-secondary/10 text-xs font-semibold text-muted-foreground">
                <th className="py-3.5 px-4 cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('name')}>
                  <div className="flex items-center gap-1">
                    <span>College</span>
                    <ArrowUpDown className="h-3 w-3 shrink-0" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Region</th>
                <th
                  className="py-3.5 px-4 cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort('departmentCount')}
                >
                  <div className="flex items-center gap-1">
                    <span>Departments</span>
                    <ArrowUpDown className="h-3 w-3 shrink-0" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Status</th>
                <th
                  className="py-3.5 px-4 cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort('updatedAt')}
                >
                  <div className="flex items-center gap-1">
                    <span>Updated</span>
                    <ArrowUpDown className="h-3 w-3 shrink-0" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="h-48 text-center text-sm text-muted-foreground italic">
                    {colleges.length === 0
                      ? 'No colleges yet. Create the first one to start populating the registration dropdown.'
                      : 'No colleges match your search or filters.'}
                  </td>
                </tr>
              ) : (
                pageRows.map((college) => (
                  <tr
                    key={college.id}
                    onClick={() => setManageCollegeId(college.id)}
                    className="border-b border-border/20 hover:bg-secondary/20 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <span className="text-sm font-bold text-foreground hover:text-primary hover:underline">
                        {college.name}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">
                      {[college.city, college.district, college.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-secondary/60 text-foreground">
                        {college.departmentCount}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          college.isActive ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        {college.isActive ? 'ACTIVE' : 'RETIRED'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[11px] text-muted-foreground">
                      {format(parseISO(college.updatedAt), 'dd MMM yyyy')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredSorted.length > 0 && (
          <div className="px-4 py-3 bg-secondary/10 border-t border-border/30 flex items-center justify-between text-xs font-sans">
            <span className="text-muted-foreground">
              Showing{' '}
              <span className="font-semibold text-foreground">
                {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredSorted.length)}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-foreground">
                {Math.min(currentPage * PAGE_SIZE, filteredSorted.length)}
              </span>{' '}
              of <span className="font-semibold text-foreground">{filteredSorted.length}</span> colleges
            </span>
            <div className="flex gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                className="p-1.5 rounded-md border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                className="p-1.5 rounded-md border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {isCreateOpen && (
        <CreateCollegeModal
          initialName={createPrefillName}
          submitting={isCreatingCollege}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}

      {manageCollege && (
        <CollegeModal
          college={manageCollege}
          canManage={canManage}
          toast={toast}
          onClose={() => setManageCollegeId(null)}
          onSave={handleSaveCollege}
        />
      )}
    </div>
  );
}
