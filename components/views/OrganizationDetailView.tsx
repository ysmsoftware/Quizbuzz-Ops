'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganizationDetail } from '@/lib/hooks/useOrganizations';
import { usePlans } from '@/lib/hooks/usePlans';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { Globe, Users, Trophy, User, CreditCard, Notebook, Layers, Landmark, GraduationCap, ToggleRight, type LucideIcon } from 'lucide-react';

import OrgDetailHeader from './organization-detail/OrgDetailHeader';
import OrgOverviewTab from './organization-detail/tabs/OrgOverviewTab';
import OrgMembersTab from './organization-detail/tabs/OrgMembersTab';
import OrgContestsTab from './organization-detail/tabs/OrgContestsTab';
import OrgParticipantsTab from './organization-detail/tabs/OrgParticipantsTab';
import OrgPaymentsTab from './organization-detail/tabs/OrgPaymentsTab';
import OrgPayoutAccountTab from './organization-detail/tabs/OrgPayoutAccountTab';
import OrgNotesTab from './organization-detail/tabs/OrgNotesTab';
import OrgInstitutionTab from './organization-detail/tabs/OrgInstitutionTab';
import OrgFeaturesTab from './organization-detail/tabs/OrgFeaturesTab';
import OrganizationSubscriptionTab from './OrganizationSubscriptionTab';

import OrgEditModal from './organization-detail/modals/OrgEditModal';
import OrgSuspendModal from './organization-detail/modals/OrgSuspendModal';
import OrgDeleteModal from './organization-detail/modals/OrgDeleteModal';
import { useResetOnChange } from '@/lib/hooks/useResetOnChange';
import { errorMessage } from '@/lib/errors';

interface DetailViewProps {
  orgId: string;
  onBack?: () => void;
}

type DetailTab = 'overview' | 'members' | 'contests' | 'participants' | 'institution' | 'features' | 'payments' | 'payout_account' | 'notes' | 'subscription';

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
    isLoadingDetails,
    isLoadingMembers,
    isLoadingPayments,
    suspendOrg,
    activateOrg,
    deleteOrg,
    restoreOrg,
    updateOrg,
    addNote,
    isSuspending,
    isActivating,
    isDeleting,
    isRestoring,
    isUpdating,
    isAddingNote,
    resendReceipt,
    resendingReceiptPaymentId,
  } = useOrganizationDetail(orgId);

  // Dialog States
  const [isSuspendOpen, setIsSuspendOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  // Edit Form Fields State
  const [editFields, setEditFields] = useState({
    name: '',
    logoUrl: '',
  });

  // Populate Edit Fields when organization is loaded
  useResetOnChange(`${organization?.id}|${organization?.name}|${organization?.logoUrl}|${organization?.hasCustomLogo}`, () => {
    if (organization) {
      setEditFields({
        name: organization.name,
        logoUrl: organization.hasCustomLogo ? organization.logoUrl : '',
      });
    }
  });

  // Payment Financial Aggregates
  const paymentAggregates = useMemo(() => {
    let collected = 0;
    let pending = 0;
    let refunded = 0;
    let subscriptionPaid = 0;
    let contestFeesCollected = 0;

    (payments || []).forEach(p => {
      if (p.status === 'PAID') {
        collected += p.amount;
        if (p.source === 'subscription') subscriptionPaid += p.amount;
        else contestFeesCollected += p.amount;
      } else if (p.status === 'PENDING') pending += p.amount;
      else if (p.status === 'REFUNDED') refunded += p.amount;
    });

    return { collected, pending, refunded, subscriptionPaid, contestFeesCollected };
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

  const currentPlan = plans.find(p => p.id === organization.planId || p.slug === organization.planId);

  // Event Handlers
  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      router.push('/dashboard/organizations');
    }
  };



  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateOrg({ name: editFields.name.trim(), logoUrl: editFields.logoUrl.trim() || null });
      toast('Profile Updated', 'Organization modifications have been saved.', 'success');
      setIsEditOpen(false);
    } catch (err) {
      toast('Update Failed', errorMessage(err) || 'Operation failed.', 'error');
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
    } catch (err) {
      toast('Suspension Failed', errorMessage(err) || 'Operation failed.', 'error');
    }
  };

  const handleReactivateClick = async () => {
    try {
      await activateOrg();
      toast('Organization Reactivated', `"${organization.name}" operations are restored.`, 'success');
    } catch (err) {
      toast('Activation Failed', errorMessage(err) || 'Operation failed.', 'error');
    }
  };

  const handleDelete = async (reason: string) => {
    try {
      await deleteOrg(reason);
      toast('Organization Deleted', `"${organization.name}" is hidden from lists. You can restore it from the Deleted filter. The owner was not notified.`, 'success');
      handleBackClick();
    } catch (err: unknown) {
      toast('Deletion Failed', err instanceof Error ? err.message : 'Operation failed.', 'error');
    }
  };

  const handleRestore = async () => {
    try {
      await restoreOrg();
      toast('Organization Restored', `"${organization.name}" is back in the directory.`, 'success');
    } catch (err: unknown) {
      toast('Restore Failed', err instanceof Error ? err.message : 'Operation failed.', 'error');
    }
  };

  const TABS_LIST: Array<{ id: DetailTab; label: string; icon: LucideIcon }> = [
    { id: 'overview', label: 'Overview', icon: Globe },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'contests', label: 'Contests', icon: Trophy },
    { id: 'participants', label: 'Participants', icon: User },
    { id: 'institution', label: 'Institution', icon: GraduationCap },
    { id: 'features', label: 'Features', icon: ToggleRight },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'payout_account', label: 'Payout Account', icon: Landmark },
    { id: 'notes', label: 'Support Notes', icon: Notebook },
    { id: 'subscription', label: 'Subscription', icon: Layers },
  ];

  return (
    <div id="org-detail-view" className="space-y-6 font-sans select-text pointer-events-auto">
      
      {/* Header Component */}
      <OrgDetailHeader
        organization={organization}
        onBackClick={handleBackClick}
        onOpenEdit={() => setIsEditOpen(true)}
        onOpenSuspend={() => setIsSuspendOpen(true)}
        onReactivate={handleReactivateClick}
        onOpenDelete={() => setIsDeleteOpen(true)}
        onRestore={handleRestore}
        isActivating={isActivating}
        isRestoring={isRestoring}
        canManage={admin?.role === 'SUPER_ADMIN'}
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
          <OrgParticipantsTab orgId={organization.id} contests={contests} />
        )}

        {activeTab === 'institution' && <OrgInstitutionTab orgId={organization.id} />}

        {activeTab === 'features' && (
          <OrgFeaturesTab orgId={organization.id} canManage={admin?.role === 'SUPER_ADMIN' && organization.status !== 'DELETED'} />
        )}

        {activeTab === 'payments' && (
          <OrgPaymentsTab
            payments={payments}
            isLoadingPayments={isLoadingPayments}
            paymentAggregates={paymentAggregates}
            onResendReceipt={resendReceipt}
            resendingReceiptPaymentId={resendingReceiptPaymentId}
          />
        )}

        {activeTab === 'payout_account' && (
          <OrgPayoutAccountTab
            orgId={organization.id}
            orgName={organization.name}
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
          <OrganizationSubscriptionTab organization={organization} payments={payments} />
        )}
      </div>

      {/* Modals */}
      <OrgEditModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        editFields={editFields}
        setEditFields={setEditFields}
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
        onClose={() => setIsDeleteOpen(false)}
        orgName={organization.name}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
      />

    </div>
  );
}
