'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, X, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { MessageTemplateDescriptor, OpsMessageTemplate } from '@/lib/types';
import { useOrganizationDetail } from '@/lib/hooks/useOrganizations';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { usePlans } from '@/lib/hooks/usePlans';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { previewMessage } from '@/lib/api/messaging';
import OrgPicker, { OrgPickerOption } from './OrgPicker';
import MessagePreviewPanel from './MessagePreviewPanel';

interface SendMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: MessageTemplateDescriptor[];
  isSending: boolean;
  onSubmit: (payload: {
    organizationId: string;
    template: OpsMessageTemplate;
    recipient: string;
    subject?: string;
    params: Record<string, string>;
  }) => void;
}

/**
 * Everything about the selected organization we already know and can use to
 * prefill template variables — the org's owner name, current plan, active
 * subscription cycle, and most recent paid subscription invoice. Nothing
 * transactional (amounts owed on a specific failed payment, a suspension
 * reason, etc.) is guessable, so those variables are left for manual entry.
 */
function useOrgDefaults(orgId: string | undefined) {
  const { organization, payments, isLoadingDetails } = useOrganizationDetail(orgId || '');
  const { subscription } = useSubscription(orgId || '');
  const { plans } = usePlans();

  return useMemo(() => {
    if (!orgId || !organization) return { values: {} as Record<string, string>, isLoading: isLoadingDetails };

    const currentPlan = plans.find((p) => p.id === organization.planId || p.slug === organization.planId);
    const lastSubscriptionPayment = (payments || [])
      .filter((p) => p.source === 'subscription' && p.status === 'PAID')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    const daysRemaining = subscription?.currentPeriodEnd
      ? Math.max(1, Math.ceil((new Date(subscription.currentPeriodEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : undefined;

    const candidates: Record<string, string | undefined> = {
      adminName: organization.ownerName,
      planName: currentPlan?.name,
      toPlan: currentPlan?.name,
      billingCycle: subscription?.billingCycle,
      currentPeriodEnd: subscription?.currentPeriodEnd ? subscription.currentPeriodEnd.slice(0, 10) : undefined,
      daysRemaining: daysRemaining != null ? String(daysRemaining) : undefined,
      amount: lastSubscriptionPayment ? String(lastSubscriptionPayment.amount) : undefined,
      baseAmount: lastSubscriptionPayment?.baseAmount != null ? String(lastSubscriptionPayment.baseAmount) : undefined,
      gatewayFeeAmount: lastSubscriptionPayment?.gatewayFeeAmount != null ? String(lastSubscriptionPayment.gatewayFeeAmount) : undefined,
      gstAmount: lastSubscriptionPayment?.gstAmount != null ? String(lastSubscriptionPayment.gstAmount) : undefined,
      paidAt: lastSubscriptionPayment ? lastSubscriptionPayment.date.slice(0, 10) : undefined,
      razorpayPaymentId: lastSubscriptionPayment?.referenceId,
    };

    const values: Record<string, string> = {};
    Object.entries(candidates).forEach(([key, value]) => {
      if (value) values[key] = value;
    });

    return { values, isLoading: isLoadingDetails };
  }, [orgId, organization, payments, subscription, plans, isLoadingDetails]);
}

/**
 * Compose-and-send modal — a settings column on the left and a live preview
 * of the actual rendered email on the right, with Cancel/Send in a shared
 * footer beneath both. Mirrors the existing OrgEditModal's overlay/card
 * treatment for visual consistency with the rest of the dashboard.
 */
export default function SendMessageModal({ isOpen, onClose, templates, isSending, onSubmit }: SendMessageModalProps) {
  const [org, setOrg] = useState<OrgPickerOption | null>(null);
  const [templateId, setTemplateId] = useState<OpsMessageTemplate | ''>('');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  // Only holds variables the admin has actually touched — everything else
  // falls back to the auto-computed default at render/submit time, so a
  // default that arrives after an async fetch never clobbers a manual edit.
  const [params, setParams] = useState<Record<string, string>>({});

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const { values: defaultParams } = useOrgDefaults(org?.id);

  // Prefill the recipient with the org owner's email once an org is picked, but leave it editable.
  useEffect(() => {
    if (org) setRecipient(org.ownerEmail);
  }, [org]);

  // Clear manual overrides whenever the template changes — a previous
  // template's variable values shouldn't leak into a different template.
  useEffect(() => {
    setParams({});
  }, [templateId]);

  const resetAndClose = () => {
    setOrg(null);
    setTemplateId('');
    setRecipient('');
    setSubject('');
    setParams({});
    onClose();
  };

  const resolveParam = (variable: string) => params[variable] ?? defaultParams[variable] ?? '';

  // The merged (manual override or auto-filled) value for every variable the
  // current template actually uses — this is both what gets submitted and
  // what drives the live preview.
  const currentParams = useMemo(() => {
    if (!selectedTemplate) return {};
    const out: Record<string, string> = {};
    selectedTemplate.variables.forEach((v) => { out[v] = resolveParam(v); });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate, params, defaultParams]);

  // Debounced so every keystroke doesn't fire a preview request.
  const debouncedParams = useDebouncedValue(currentParams, 350);

  const previewQuery = useQuery({
    queryKey: ['messages', 'preview', templateId, debouncedParams],
    queryFn: () => previewMessage({ template: templateId as OpsMessageTemplate, params: debouncedParams }),
    enabled: !!templateId,
    placeholderData: (prev) => prev, // keep the last render visible while the debounced update settles
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || !templateId || !recipient || !selectedTemplate) return;
    onSubmit({
      organizationId: org.id,
      template: templateId,
      recipient,
      subject: subject || undefined,
      params: currentParams,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border/50 shadow-2xl rounded-xl w-full max-w-3xl font-sans flex flex-col max-h-[90vh]"
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-border/40 shrink-0">
          <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
            <Send className="h-4 w-4 text-primary" /> Compose Message
          </h3>
          <button onClick={resetAndClose} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-6 overflow-y-auto">
            {/* Left column — settings */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Organization</label>
                <OrgPicker value={org} onChange={setOrg} />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Template</label>
                <select
                  required
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value as OpsMessageTemplate)}
                  className="w-full px-3 py-2 text-xs bg-secondary/20 border border-border/50 rounded-lg outline-none text-foreground cursor-pointer"
                >
                  <option value="" disabled>Select a template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Recipient Email</label>
                <input
                  type="email"
                  required
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="owner@organization.com"
                  className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Subject (optional)</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Leave blank to use the template default"
                  className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
                />
              </div>

              {selectedTemplate && selectedTemplate.variables.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/30">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Template Variables
                    {org && <span className="normal-case font-normal text-muted-foreground/70 ml-1">— known fields filled from {org.name}</span>}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedTemplate.variables.map((variable) => {
                      const isAutoFilled = params[variable] === undefined && !!defaultParams[variable];
                      return (
                        <div key={variable} className="space-y-1">
                          <label className="text-[9px] font-mono text-muted-foreground flex items-center gap-1 truncate" title={variable}>
                            {variable}
                            {isAutoFilled && <Sparkles className="h-2.5 w-2.5 text-primary shrink-0" aria-label="Auto-filled" />}
                          </label>
                          <input
                            type="text"
                            value={resolveParam(variable)}
                            onChange={(e) => setParams((prev) => ({ ...prev, [variable]: e.target.value }))}
                            className={`w-full px-2.5 py-1.5 text-[11px] bg-secondary/20 focus:bg-card border rounded-md outline-none focus:border-primary text-foreground ${isAutoFilled ? 'border-primary/30' : 'border-border/50'}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right column — live preview */}
            <div className="min-h-[320px] md:min-h-0">
              <MessagePreviewPanel
                recipient={recipient}
                subject={previewQuery.data?.subject ?? null}
                html={previewQuery.data?.html ?? null}
                isLoading={previewQuery.isFetching}
                hasTemplate={!!templateId}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-border/40 shrink-0">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending || !org || !templateId || !recipient}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {isSending ? 'Queuing...' : 'Send Message'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
