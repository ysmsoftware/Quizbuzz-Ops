'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAmbassadorTypes } from '@/lib/hooks/useAmbassadorTypes';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { getAmbassadorTypeOrgAccess, setAmbassadorTypeOrgAccess } from '@/lib/api/ops';
import { OrganizationCombobox } from '@/components/ui/OrganizationCombobox';
import { useOrganizations } from '@/lib/hooks/useOrganizations';
import { AmbassadorApplicationFieldDef, AmbassadorApplicationFieldType, AmbassadorType } from '@/lib/types';
import {
  UserSquare2,
  Plus,
  Building2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Lock,
  Pencil,
  X,
  GripVertical,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

type ToastFn = (title: string, description?: string, type?: 'success' | 'warning' | 'error' | 'info') => void;

const FIELD_TYPES: AmbassadorApplicationFieldType[] = ['TEXT', 'EMAIL', 'PHONE', 'NUMBER', 'SELECT', 'DATE'];

// ─── Application field builder — used by both the create and edit forms ───
// Renders/edits an AmbassadorApplicationFieldDef[] as repeating rows. This is
// the actual "where do we define what data an ambassador type collects"
// control — see ambassador-incentive-program-plan.md §0.3/§1.2.
function ApplicationFieldsBuilder({
  fields,
  onChange,
}: {
  fields: AmbassadorApplicationFieldDef[];
  onChange: (fields: AmbassadorApplicationFieldDef[]) => void;
}) {
  const addField = () => {
    onChange([...fields, { key: '', label: '', type: 'TEXT', required: true }]);
  };

  const updateField = (index: number, patch: Partial<AmbassadorApplicationFieldDef>) => {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const updateOptions = (index: number, raw: string) => {
    const options = raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    updateField(index, { options });
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        Application Fields
      </label>
      <p className="text-[11px] text-muted-foreground">
        What this type&apos;s applicants fill in beyond name/email/phone/proof — e.g. College, Department,
        Employee ID. No code change needed to add or edit these.
      </p>

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">No extra fields yet — only the fixed baseline is collected.</p>
      )}

      <div className="space-y-2">
        {fields.map((field, i) => (
          <div key={i} className="p-3 bg-secondary/20 border border-border/30 rounded-lg space-y-2">
            <div className="flex items-start gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground mt-2 shrink-0" />
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input
                  value={field.key}
                  onChange={(e) => updateField(i, { key: e.target.value })}
                  placeholder="key (e.g. college)"
                  className="h-8 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground font-mono"
                />
                <input
                  value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  placeholder="Label shown to applicant"
                  className="h-8 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground"
                />
                <select
                  value={field.type}
                  onChange={(e) => updateField(i, { type: e.target.value as AmbassadorApplicationFieldType })}
                  className="h-8 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => updateField(i, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>
              <button
                onClick={() => removeField(i)}
                className="shrink-0 p-1.5 rounded-md text-destructive hover:bg-destructive/10 cursor-pointer"
                title="Remove field"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {field.type === 'SELECT' && (
              <input
                value={(field.options ?? []).join(', ')}
                onChange={(e) => updateOptions(i, e.target.value)}
                placeholder="Options, comma-separated (e.g. 2026, 2027, 2028)"
                className="w-full h-8 px-2 ml-6 text-xs rounded-md bg-background border border-border/40 text-foreground"
              />
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addField}
        className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5" />
        Add field
      </button>
    </div>
  );
}

// ─── Per-organization enablement — same interaction shape as FeatureFlagsView's
// OrgOverridesPanel, against a different (simpler, no-reason) table. ───
function OrgAccessPanel({ typeKey, canManage, toast }: { typeKey: string; canManage: boolean; toast: ToastFn }) {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);

  const accessQuery = useQuery({
    queryKey: ['ops', 'ambassador-types', typeKey, 'access'],
    queryFn: () => getAmbassadorTypeOrgAccess(typeKey),
  });

  // Resolve raw organizationId -> name/owner for display only — access rows
  // and the mutation itself still key off the plain id.
  const { organizations } = useOrganizations({ limit: 500 });
  const orgById = new Map((organizations ?? []).map((o) => [o.id, o]));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ops', 'ambassador-types', typeKey, 'access'] });
    queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
  };

  const setMutation = useMutation({
    mutationFn: () => setAmbassadorTypeOrgAccess(typeKey, orgId.trim(), isEnabled),
    onSuccess: () => {
      const orgName = orgById.get(orgId.trim())?.name ?? orgId.trim();
      toast('Access Updated', `"${orgName}" ${isEnabled ? 'can now' : 'can no longer'} accept this ambassador type.`, 'success');
      setOrgId('');
      setIsEnabled(true);
      invalidate();
    },
    onError: (err: any) => {
      toast('Failed to Update Access', err?.message || 'Could not update organization access.', 'error');
    },
  });

  return (
    <div className="ml-2 sm:ml-4 p-4 bg-secondary/20 border border-border/30 rounded-lg space-y-4">
      <div className="space-y-2">
        {accessQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading organization access…</p>
        ) : accessQuery.data?.length ? (
          accessQuery.data.map((access) => {
            const org = orgById.get(access.organizationId);
            return (
            <div
              key={access.id}
              className="flex items-start justify-between gap-3 p-3 bg-card border border-border/30 rounded-lg"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">
                    {org?.name ?? 'Unknown organization'}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      access.isEnabled ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {access.isEnabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {org?.ownerName ?? org?.ownerEmail ?? access.organizationId}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  By {access.updatedByName} · {format(parseISO(access.updatedAt), 'dd MMM yyyy, hh:mm a')}
                </p>
              </div>
            </div>
            );
          })
        ) : (
          <p className="text-xs text-muted-foreground">No organizations have this type enabled yet.</p>
        )}
      </div>

      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!orgId.trim()) return;
            setMutation.mutate();
          }}
          className="flex flex-wrap items-end gap-2 pt-2 border-t border-border/20"
        >
          <div className="flex-1 min-w-[220px] space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Organization</label>
            <OrganizationCombobox value={orgId} onChange={setOrgId} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Value</label>
            <select
              value={isEnabled ? 'on' : 'off'}
              onChange={(e) => setIsEnabled(e.target.value === 'on')}
              className="h-8 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground"
            >
              <option value="on">Enabled</option>
              <option value="off">Disabled</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={setMutation.isPending || !orgId.trim()}
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {setMutation.isPending ? 'Saving…' : 'Set Access'}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Create / edit type form, shown in a lightweight modal (same hand-rolled
// pattern as FeatureFlagsView's confirmation dialog) ───
function TypeFormModal({
  initial,
  onClose,
  onSubmit,
  submitting,
}: {
  initial?: AmbassadorType;
  onClose: () => void;
  onSubmit: (input: {
    key: string;
    label: string;
    description?: string;
    proofFieldLabel: string;
    applicationFields: AmbassadorApplicationFieldDef[];
  }) => void;
  submitting: boolean;
}) {
  const [key, setKey] = useState(initial?.key ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [proofFieldLabel, setProofFieldLabel] = useState(initial?.proofFieldLabel ?? 'Identity / Enrollment Proof');
  const [applicationFields, setApplicationFields] = useState<AmbassadorApplicationFieldDef[]>(
    initial?.applicationFields ?? []
  );

  const isEdit = !!initial;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border/60 rounded-xl p-6 shadow-2xl max-w-lg w-full space-y-4 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <h2 className="text-base font-black text-foreground tracking-tight">
            {isEdit ? `Edit "${initial!.label}"` : 'New Ambassador Type'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary/60 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">Key (immutable)</label>
              <input
                value={key}
                disabled={isEdit}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="student"
                className="w-full h-8 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground font-mono disabled:opacity-60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">Label</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Student Ambassador"
                className="w-full h-8 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Currently enrolled students at a partner college"
              className="w-full h-8 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Proof document label</label>
            <input
              value={proofFieldLabel}
              onChange={(e) => setProofFieldLabel(e.target.value)}
              placeholder="College ID Card"
              className="w-full h-8 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground"
            />
          </div>

          <ApplicationFieldsBuilder fields={applicationFields} onChange={setApplicationFields} />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/20">
          <button onClick={onClose} className="h-9 px-4 rounded-md hover:bg-secondary/60 text-foreground font-semibold text-xs cursor-pointer">
            Cancel
          </button>
          <button
            disabled={submitting || !key.trim() || !label.trim()}
            onClick={() =>
              onSubmit({
                key: key.trim(),
                label: label.trim(),
                description: description.trim() || undefined,
                proofFieldLabel: proofFieldLabel.trim() || 'Identity / Enrollment Proof',
                applicationFields,
              })
            }
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground font-extrabold text-xs cursor-pointer disabled:opacity-50"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Type'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AmbassadorTypesView() {
  const { types, isLoadingTypes, createType, isCreating, updateType } = useAmbassadorTypes();
  const { hasPermission } = useCurrentAdmin();
  const { toast } = useToast();

  const canManage = hasPermission('FEATURE_FLAG_MANAGE'); // same SUPER_ADMIN gate as Feature Flags
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{ open: boolean; editing?: AmbassadorType }>({ open: false });

  if (isLoadingTypes) {
    return (
      <div className="space-y-6 font-sans animate-pulse">
        <div className="h-10 w-64 bg-secondary/30 rounded" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-card rounded-xl border border-border/30" />
          ))}
        </div>
      </div>
    );
  }

  const handleCreate = async (input: Parameters<typeof createType>[0]) => {
    try {
      await createType(input);
      toast('Ambassador Type Created', `"${input.label}" is now available for orgs to enable.`, 'success');
      setModalState({ open: false });
    } catch (err: any) {
      toast('Failed to Create Type', err?.message || 'Could not create the ambassador type.', 'error');
    }
  };

  const handleUpdate = async (input: Parameters<typeof createType>[0]) => {
    try {
      await updateType(input);
      toast('Ambassador Type Updated', `"${input.label}" has been updated.`, 'success');
      setModalState({ open: false });
    } catch (err: any) {
      toast('Failed to Update Type', err?.message || 'Could not update the ambassador type.', 'error');
    }
  };

  return (
    <div className="space-y-8 font-sans max-w-4xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <UserSquare2 className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Ops Workspace</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Ambassador Types</h1>
          <p className="text-xs text-muted-foreground max-w-xl">
            Curate the ambassador profiles orgs can offer (General, Student, Faculty, and any future type
            like Industry) and what each one asks applicants for. Created and edited here, never seeded —
            per-org enablement is managed per type below. The program itself is gated separately, per org,
            from Feature Flags → <code className="font-mono text-[10px]">ambassador_program_enabled</code>.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setModalState({ open: true })}
            className="flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-bold cursor-pointer self-start sm:self-center shrink-0"
          >
            <Plus className="h-4 w-4" />
            New Type
          </button>
        )}
      </div>

      {!canManage && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl flex items-start gap-3">
          <Lock className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold">Read-Only Access</h4>
            <p className="leading-relaxed opacity-90">
              Creating or editing ambassador types is limited to <strong>SUPER_ADMIN</strong>.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {types.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground border border-dashed border-border/40 rounded-xl">
            No ambassador types yet. Create the first one to let an organization start accepting
            applications once their program is enabled.
          </div>
        )}

        {types.map((type) => {
          const isExpanded = expandedKey === type.key;
          return (
            <div key={type.id} className="space-y-2">
              <div className="p-5 sm:p-6 bg-card border border-border/40 hover:border-border rounded-xl shadow-sm transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-2 max-w-xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-sm sm:text-base text-foreground tracking-tight">{type.label}</h3>
                    <code className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary/80 text-muted-foreground">
                      {type.key}
                    </code>
                    {!type.isActive && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        RETIRED
                      </span>
                    )}
                  </div>
                  {type.description && <p className="text-xs text-muted-foreground leading-relaxed">{type.description}</p>}
                  <p className="text-[11px] text-muted-foreground">
                    Proof: <span className="font-medium text-foreground">{type.proofFieldLabel}</span> · {type.applicationFields.length}{' '}
                    extra field{type.applicationFields.length === 1 ? '' : 's'}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground font-semibold pt-1 border-t border-border/10">
                    <span>By {type.createdByName}</span>
                    <span>Updated {format(parseISO(type.updatedAt), 'dd MMM yyyy, hh:mm a')}</span>
                    <button
                      onClick={() => setExpandedKey(isExpanded ? null : type.key)}
                      className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
                    >
                      <Building2 className="h-3 w-3" />
                      Manage organizations
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={() => setModalState({ open: true, editing: type })}
                    className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-xs font-semibold hover:bg-secondary/60 cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
              </div>
              {isExpanded && <OrgAccessPanel typeKey={type.key} canManage={canManage} toast={toast} />}
            </div>
          );
        })}
      </div>

      {modalState.open && (
        <TypeFormModal
          initial={modalState.editing}
          submitting={isCreating}
          onClose={() => setModalState({ open: false })}
          onSubmit={(input) => (modalState.editing ? handleUpdate(input) : handleCreate(input))}
        />
      )}
    </div>
  );
}
