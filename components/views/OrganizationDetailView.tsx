'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganizationDetail } from '@/lib/hooks/useOrganizations';
import { usePlans } from '@/lib/hooks/usePlans';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { Globe, Users, Trophy, User, CreditCard, Notebook, Layers } from 'lucide-react';
import { writeAuditLogEntry } from '@/lib/api/auditLog';

import OrgDetailHeader from './organization-detail/OrgDetailHeader';
import OrgOverviewTab from './organization-detail/tabs/OrgOverviewTab';
import OrgMembersTab from './organization-detail/tabs/OrgMembersTab';
import OrgContestsTab from './organization-detail/tabs/OrgContestsTab';
import OrgParticipantsTab from './organization-detail/tabs/OrgParticipantsTab';
import OrgPaymentsTab from './organization-detail/tabs/OrgPaymentsTab';
import OrgNotesTab from './organization-detail/tabs/OrgNotesTab';
import OrganizationSubscriptionTab from './OrganizationSubscriptionTab';

import OrgEditModal from './organization-detail/modals/OrgEditModal';
import OrgSuspendModal from './organization-detail/modals/OrgSuspendModal';
import OrgDeleteModal from './organization-detail/modals/OrgDeleteModal';
import OrgImpersonateModal from './organization-detail/modals/OrgImpersonateModal';

interface DetailViewProps {
  orgId: string;
  onBack?: () => void;
}

type DetailTab = 'overview' | 'members' | 'contests' | 'participants' | 'payments' | 'notes' | 'subscription';

export default function OrganizationDetailView({ orgId, onBack }: DetailViewProps) {
  const router = useRouter();
  const { admin } = useCurrentAdmin();
  const { toast } = useToast();
  const { plans } = usePlans();

  // Active Tab State
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

  // Dialog States
  const [isSuspendOpen, setIsSuspendOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isImpersonateConfirmOpen, setIsImpersonateConfirmOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [confirmNameDelete, setConfirmNameDelete] = useState('');

  // Edit Form Fields State
  const [editFields, setEditFields] = useState({
    name: '',
    website: '',
    logoUrl: '',
    planId: ''
  });

  // Populate Edit Fields when organization is loaded
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

  // Payment Financial Aggregates
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

  // Event Handlers
  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      router.push('/dashboard/organizations');
    }
  };

  const handleConfirmImpersonation = () => {
    if (!organization) return;
    
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

    const impersonationEvent = new CustomEvent('quizbuzz_impersonate', {
      detail: {
        orgId: organization.id,
        orgName: organization.name
      }
    });
    window.dispatchEvent(impersonationEvent);
    
    setIsImpersonateConfirmOpen(false);
  };

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
      handleBackClick();
    } catch (err: any) {
      toast('Deletion Failed', err.message || 'Operation failed.', 'error');
    }
  };

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
      
      {/* Header Component */}
      <OrgDetailHeader
        organization={organization}
        onBackClick={handleBackClick}
        onOpenImpersonate={() => setIsImpersonateConfirmOpen(true)}
        onOpenEdit={() => setIsEditOpen(true)}
        onOpenSuspend={() => setIsSuspendOpen(true)}
        onReactivate={handleReactivateClick}
        onOpenDelete={() => setIsDeleteOpen(true)}
        isActivating={isActivating}
      />

      {/* Tabs Navigation Bar */}
      <div className="border-b border-border/40 font-sans overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {TABS_LIST.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                  isActive
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/20'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Panels */}
      <div className="pt-2">
        {activeTab === 'overview' && (
          <OrgOverviewTab
            organization={organization}
            contests={contests}
            members={members}
            participantsCount={participants.length}
            paymentAggregates={paymentAggregates}
            currentPlan={currentPlan}
          />
        )}

        {activeTab === 'members' && (
          <OrgMembersTab
            members={members}
            isLoadingMembers={isLoadingMembers}
          />
        )}

        {activeTab === 'contests' && (
          <OrgContestsTab contests={contests} />
        )}

        {activeTab === 'participants' && (
          <OrgParticipantsTab
            participants={participants}
            contests={contests}
            isLoadingParticipants={isLoadingParticipants}
          />
        )}

        {activeTab === 'payments' && (
          <OrgPaymentsTab
            payments={payments}
            isLoadingPayments={isLoadingPayments}
            paymentAggregates={paymentAggregates}
          />
        )}

        {activeTab === 'notes' && (
          <OrgNotesTab
            notes={organization.notes}
            authorName={admin?.name}
            isAddingNote={isAddingNote}
            addNote={addNote}
          />
        )}

        {activeTab === 'subscription' && (
          <OrganizationSubscriptionTab organization={organization} />
        )}
      </div>

      {/* Modals */}
      <OrgEditModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        editFields={editFields}
        setEditFields={setEditFields}
        plans={plans}
        isUpdating={isUpdating}
        onSubmit={handleEditSubmit}
      />

      <OrgSuspendModal
        isOpen={isSuspendOpen}
        onClose={() => setIsSuspendOpen(false)}
        orgName={organization.name}
        suspendReason={suspendReason}
        setSuspendReason={setSuspendReason}
        isSuspending={isSuspending}
        onSubmit={handleSuspendSubmit}
      />

      <OrgDeleteModal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setConfirmNameDelete('');
        }}
        orgName={organization.name}
        confirmNameDelete={confirmNameDelete}
        setConfirmNameDelete={setConfirmNameDelete}
        isDeleting={isDeleting}
        onSubmit={handleDeleteSubmit}
      />

      <OrgImpersonateModal
        isOpen={isImpersonateConfirmOpen}
        onClose={() => setIsImpersonateConfirmOpen(false)}
        orgName={organization.name}
        orgSlug={organization.slug}
        adminEmail={admin?.email}
        onConfirm={handleConfirmImpersonation}
      />

    </div>
  );
}
