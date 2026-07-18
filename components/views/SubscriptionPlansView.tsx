'use client';

import React, { useState, useEffect } from 'react';
import { useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { usePlans } from '@/lib/hooks/usePlans';
import { useOrganizations } from '@/lib/hooks/useOrganizations';
import { useToast } from '@/components/ui/Toast';
import { SubscriptionPlan } from '@/lib/types';
import { 
  Sparkles, 
  Plus, 
  Edit3, 
  EyeOff, 
  Eye, 
  Check, 
  X, 
  Users, 
  Trophy, 
  Building2, 
  HelpCircle, 
  ShieldCheck, 
  Download, 
  Globe, 
  Lock, 
  Layers, 
  AlertTriangle,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Zod Validation Schema
const planSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric and hyphens only'),
  description: z.string().min(1, 'Description is required'),
  price: z.coerce.number({ message: 'Price must be a number' }).min(0, 'Price must be 0 or positive'),
  currency: z.string().min(1, 'Currency is required'),
  billingCycle: z.enum(['monthly', 'annual']),
  isActive: z.boolean(),
  limits: z.object({
    maxContestsPerCycle: z.number().int().positive('Must be positive').nullable(),
    maxParticipantsPerContest: z.number().int().positive('Must be positive').nullable(),
    maxQuestionsPerContest: z.number().int().positive('Must be positive').nullable(),
    maxOrgMembers: z.number().int().positive('Must be positive').nullable(),
  }),
  features: z.object({
    proctoring: z.boolean(),
    customCertificateBranding: z.boolean(),
    prioritySupport: z.boolean(),
    analyticsExport: z.boolean(),
    customDomain: z.boolean(),
  }),
});

type PlanFormValues = z.infer<typeof planSchema>;

export default function SubscriptionPlansList() {
  const { plans, createPlan, updatePlan, isCreating, isUpdating } = usePlans();
  const { organizations } = useOrganizations({ limit: 1000 });
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  
  // Confirmation states
  const [isEditConfirmOpen, setIsEditConfirmOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<PlanFormValues | null>(null);
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false);
  const [pendingDeactivatePlan, setPendingDeactivatePlan] = useState<SubscriptionPlan | null>(null);

  // Setup form
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema) as any,
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      price: 0,
      currency: 'INR',
      billingCycle: 'monthly',
      isActive: true,
      limits: {
        maxContestsPerCycle: 10,
        maxParticipantsPerContest: 500,
        maxQuestionsPerContest: 30,
        maxOrgMembers: 5,
      },
      features: {
        proctoring: false,
        customCertificateBranding: false,
        prioritySupport: false,
        analyticsExport: false,
        customDomain: false,
      }
    }
  });

  // Auto-generate slug from name
  const watchName = watch('name');
  useEffect(() => {
    if (watchName && !editingPlan) {
      const generatedSlug = watchName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
      setValue('slug', generatedSlug, { shouldValidate: true });
    }
  }, [watchName, setValue, editingPlan]);

  // Read limits to toggle checkboxes
  const limits = watch('limits');

  const getSubscribedOrgCount = (planId: string) => {
    if (!organizations) return 0;
    return organizations.filter(org => org.planId === planId).length;
  };

  const openNewPlanForm = () => {
    setEditingPlan(null);
    reset({
      name: '',
      slug: '',
      description: '',
      price: 0,
      currency: 'INR',
      billingCycle: 'monthly',
      isActive: true,
      limits: {
        maxContestsPerCycle: 10,
        maxParticipantsPerContest: 250,
        maxQuestionsPerContest: 25,
        maxOrgMembers: 5,
      },
      features: {
        proctoring: false,
        customCertificateBranding: false,
        prioritySupport: false,
        analyticsExport: false,
        customDomain: false,
      }
    });
    setIsFormOpen(true);
  };

  const openEditForm = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    reset({
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      price: plan.price,
      currency: plan.currency || 'INR',
      billingCycle: plan.billingCycle,
      isActive: plan.isActive,
      limits: {
        maxContestsPerCycle: plan.limits.maxContestsPerCycle,
        maxParticipantsPerContest: plan.limits.maxParticipantsPerContest,
        maxQuestionsPerContest: plan.limits.maxQuestionsPerContest,
        maxOrgMembers: plan.limits.maxOrgMembers,
      },
      features: {
        proctoring: plan.features.proctoring,
        customCertificateBranding: plan.features.customCertificateBranding,
        prioritySupport: plan.features.prioritySupport,
        analyticsExport: plan.features.analyticsExport,
        customDomain: plan.features.customDomain,
      }
    });
    setIsFormOpen(true);
  };

  const onFormSubmit = (data: PlanFormValues) => {
    if (editingPlan) {
      const affectedCount = getSubscribedOrgCount(editingPlan.id);
      if (affectedCount > 0) {
        setPendingFormData(data);
        setIsEditConfirmOpen(true);
      } else {
        commitPlanUpdate(data);
      }
    } else {
      commitPlanCreate(data);
    }
  };

  const commitPlanCreate = async (data: PlanFormValues) => {
    try {
      await createPlan(data as any);
      toast('Success', `Plan "${data.name}" has been created successfully.`, 'success');
      setIsFormOpen(false);
    } catch (e: any) {
      toast('Error', e.message || 'Failed to create plan', 'error');
    }
  };

  const commitPlanUpdate = async (data: PlanFormValues) => {
    if (!editingPlan) return;
    try {
      await updatePlan({ planId: editingPlan.id, updates: data as any });
      toast('Success', `Plan "${data.name}" updated successfully.`, 'success');
      setIsFormOpen(false);
      setIsEditConfirmOpen(false);
      setPendingFormData(null);
    } catch (e: any) {
      toast('Error', e.message || 'Failed to update plan', 'error');
    }
  };

  const handleDeactivateToggle = async (plan: SubscriptionPlan) => {
    if (plan.isActive) {
      setPendingDeactivatePlan(plan);
      setIsDeactivateConfirmOpen(true);
    } else {
      // Activate directly
      try {
        await updatePlan({ planId: plan.id, updates: { isActive: true } });
        toast('Success', `Plan "${plan.name}" has been activated.`, 'success');
      } catch (e: any) {
        toast('Error', e.message || 'Failed to activate plan', 'error');
      }
    }
  };

  const commitDeactivate = async () => {
    if (!pendingDeactivatePlan) return;
    try {
      await updatePlan({ planId: pendingDeactivatePlan.id, updates: { isActive: false } });
      toast('Deactivated', `Plan "${pendingDeactivatePlan.name}" is now hidden for new tenants.`, 'success');
      setIsDeactivateConfirmOpen(false);
      setPendingDeactivatePlan(null);
    } catch (e: any) {
      toast('Error', e.message || 'Failed to deactivate plan', 'error');
    }
  };

  const toggleLimitUnlimited = (fieldName: keyof PlanFormValues['limits']) => {
    const currentVal = limits[fieldName];
    if (currentVal === null) {
      // Restore default sensible value
      const defaults: Record<string, number> = {
        maxContestsPerCycle: 10,
        maxParticipantsPerContest: 500,
        maxQuestionsPerContest: 50,
        maxOrgMembers: 5,
      };
      setValue(`limits.${fieldName}`, defaults[fieldName]);
    } else {
      // Set to null (unlimited)
      setValue(`limits.${fieldName}`, null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/30 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Subscription Tiers</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure global pricing tiers, usage quotas, and administrative feature gates.
          </p>
        </div>
        <button
          onClick={openNewPlanForm}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New Subscription Plan
        </button>
      </div>

      {/* Grid of Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {plans.map((plan) => {
          const count = getSubscribedOrgCount(plan.id);
          return (
            <motion.div
              layout
              key={plan.id}
              className={`relative flex flex-col justify-between p-6 rounded-2xl bg-card border transition-all duration-300 ${
                plan.isActive 
                  ? 'border-border/60 hover:border-primary/40 shadow-sm' 
                  : 'border-border/30 bg-muted/20 opacity-80'
              }`}
            >
              {/* Badge for Activation Status */}
              <div className="absolute top-4 right-4 flex items-center gap-1.5">
                {plan.isActive ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-wider">
                    <span className="h-1 w-1 rounded-full bg-emerald-500" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-500/10 text-slate-500 border border-slate-500/20 uppercase tracking-wider">
                    <span className="h-1 w-1 rounded-full bg-slate-500" />
                    Disabled
                  </span>
                )}
              </div>

              {/* Tier Details */}
              <div className="space-y-5">
                <div className="space-y-1 pr-16">
                  <h3 className="text-lg font-bold text-foreground font-sans tracking-tight">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed h-10 overflow-hidden line-clamp-2">
                    {plan.description}
                  </p>
                </div>

                {/* Price Display */}
                <div className="flex items-baseline">
                  {plan.price === 0 ? (
                    <span className="text-2xl font-extrabold text-foreground font-sans uppercase tracking-tight">Free</span>
                  ) : (
                    <>
                      <span className="text-2xl font-extrabold text-foreground font-sans tracking-tight">
                        ₹{plan.price.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        /{plan.billingCycle === 'annual' ? 'year' : 'month'}
                      </span>
                    </>
                  )}
                </div>

                {/* Limits List (Quotas) */}
                <div className="space-y-2 border-t border-b border-border/30 py-3.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Plan Quotas</span>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-3 text-xs">
                    <div className="flex items-center gap-1.5 text-foreground/80">
                      <Trophy className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">
                        {plan.limits.maxContestsPerCycle === null ? '∞' : plan.limits.maxContestsPerCycle} Quizzes
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-foreground/80">
                      <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">
                        {plan.limits.maxParticipantsPerContest === null ? '∞' : plan.limits.maxParticipantsPerContest.toLocaleString()} Q_Parts
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-foreground/80">
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">
                        {plan.limits.maxQuestionsPerContest === null ? '∞' : plan.limits.maxQuestionsPerContest} Questions
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-foreground/80">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">
                        {plan.limits.maxOrgMembers === null ? '∞' : plan.limits.maxOrgMembers} Members
                      </span>
                    </div>
                  </div>
                </div>

                {/* Features Checklist */}
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Feature Gates</span>
                  <div className="space-y-1.5 text-xs">
                    {[
                      { key: 'proctoring', label: 'AI Proctoring Lock' },
                      { key: 'customCertificateBranding', label: 'Certificate Branding' },
                      { key: 'prioritySupport', label: 'Priority SLA Help' },
                      { key: 'analyticsExport', label: 'Export Reports' },
                      { key: 'customDomain', label: 'White-label Custom Domain' }
                    ].map((feat) => {
                      const isEnabled = plan.features[feat.key as keyof typeof plan.features];
                      return (
                        <div key={feat.key} className="flex items-center gap-2">
                          {isEnabled ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                          )}
                          <span className={isEnabled ? 'text-foreground/85 font-medium' : 'text-muted-foreground/60 line-through'}>
                            {feat.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Action Deck & Org Count */}
              <div className="space-y-4 border-t border-border/30 mt-6 pt-4">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>{count}</strong> {count === 1 ? 'organization' : 'organizations'} active
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditForm(plan)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold border border-border/60 hover:bg-secondary/45 text-foreground rounded-md transition-colors cursor-pointer"
                  >
                    <Edit3 className="h-3 w-3" />
                    Edit Tier
                  </button>
                  <button
                    onClick={() => handleDeactivateToggle(plan)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                      plan.isActive 
                        ? 'border-red-500/20 hover:bg-red-500/5 text-red-500' 
                        : 'border-emerald-500/20 hover:bg-emerald-500/5 text-emerald-500'
                    }`}
                  >
                    {plan.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* FORM DRAWER */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop Scrim */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFormOpen(false)}
              className="absolute inset-0 bg-background/85 backdrop-blur-xs cursor-pointer"
            />

            {/* Slide-over Content panel */}
            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 24, stiffness: 220 }}
                className="w-screen max-w-md bg-card border-l border-border shadow-2xl flex flex-col justify-between"
              >
                {/* Header */}
                <div className="p-6 border-b border-border/40 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-foreground">
                      {editingPlan ? `Edit "${editingPlan.name}" Plan` : 'Configure New Tier'}
                    </h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {editingPlan ? 'Global edits affect all currently subscribed tenants.' : 'Set resource limits and pricing details.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsFormOpen(false)}
                    className="p-1 rounded-md hover:bg-secondary/50 text-muted-foreground transition-colors cursor-pointer"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>

                {/* Form Fields Body */}
                <form id="plan-tier-form" onSubmit={handleSubmit(onFormSubmit as any)} className="flex-1 overflow-y-auto p-6 space-y-5">
                  
                  {/* Basic Info */}
                  <div className="space-y-3.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary block">1. Basic Properties</span>
                    
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Plan Name</label>
                      <input
                        type="text"
                        {...register('name')}
                        placeholder="e.g. Starter Pack"
                        className="w-full px-3 py-1.5 text-xs bg-background border border-border/60 rounded-md focus:border-primary focus:outline-hidden"
                      />
                      {errors.name && <p className="text-[10px] text-red-500 font-medium">{errors.name.message}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground">Plan Slug</label>
                        <input
                          type="text"
                          {...register('slug')}
                          placeholder="e.g. starter"
                          disabled={!!editingPlan}
                          className="w-full px-3 py-1.5 text-xs bg-background disabled:bg-muted disabled:opacity-60 border border-border/60 rounded-md focus:border-primary focus:outline-hidden"
                        />
                        {errors.slug && <p className="text-[10px] text-red-500 font-medium">{errors.slug.message}</p>}
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground">Billing Cycle</label>
                        <select
                          {...register('billingCycle')}
                          className="w-full px-3 py-1.5 text-xs bg-background border border-border/60 rounded-md focus:border-primary focus:outline-hidden"
                        >
                          <option value="monthly">Monthly</option>
                          <option value="annual">Annual</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs font-semibold text-foreground">Price</label>
                        <input
                          type="number"
                          {...register('price', { valueAsNumber: true })}
                          placeholder="e.g. 2999"
                          className="w-full px-3 py-1.5 text-xs bg-background border border-border/60 rounded-md focus:border-primary focus:outline-hidden"
                        />
                        {errors.price && <p className="text-[10px] text-red-500 font-medium">{errors.price.message}</p>}
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground">Currency</label>
                        <input
                          type="text"
                          {...register('currency')}
                          placeholder="INR"
                          className="w-full px-3 py-1.5 text-xs bg-background border border-border/60 rounded-md focus:border-primary focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Description</label>
                      <textarea
                        {...register('description')}
                        placeholder="Brief summary shown to clients..."
                        rows={2}
                        className="w-full px-3 py-1.5 text-xs bg-background border border-border/60 rounded-md focus:border-primary focus:outline-hidden resize-none"
                      />
                      {errors.description && <p className="text-[10px] text-red-500 font-medium">{errors.description.message}</p>}
                    </div>

                    <div className="flex items-center gap-2 pt-1.5">
                      <input
                        type="checkbox"
                        id="form-isActive-chk"
                        {...register('isActive')}
                        className="rounded text-primary border-border focus:ring-primary h-3.5 w-3.5"
                      />
                      <label htmlFor="form-isActive-chk" className="text-xs font-medium text-foreground">
                        Active & Publishable (allow new tenant subscriptions)
                      </label>
                    </div>
                  </div>

                  {/* Resource Limits (Quotas) */}
                  <div className="space-y-3.5 border-t border-border/30 pt-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary block">2. Resource Quota Limits</span>
                    
                    {[
                      { key: 'maxContestsPerCycle', label: 'Max Quizzes per Period', desc: 'Active contests within a billing cycle.' },
                      { key: 'maxParticipantsPerContest', label: 'Max Participants per Contest', desc: 'Maximum entries allowed in a single contest.' },
                      { key: 'maxQuestionsPerContest', label: 'Max Questions per Contest', desc: 'Limit on the number of trivia items.' },
                      { key: 'maxOrgMembers', label: 'Max Team Members', desc: 'Seats available in organization workspace.' }
                    ].map((lim) => {
                      const isUnlimited = limits?.[lim.key as keyof typeof limits] === null;
                      return (
                        <div key={lim.key} className="p-3 border border-border/40 rounded-xl bg-muted/15 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-semibold text-foreground block">{lim.label}</span>
                              <span className="text-[10px] text-muted-foreground block leading-snug">{lim.desc}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={isUnlimited}
                                onChange={() => toggleLimitUnlimited(lim.key as keyof PlanFormValues['limits'])}
                                id={`unlimited-${lim.key}`}
                                className="rounded text-primary border-border focus:ring-primary h-3 w-3"
                              />
                              <label htmlFor={`unlimited-${lim.key}`} className="text-[11px] font-medium text-muted-foreground select-none">
                                Unlimited
                              </label>
                            </div>
                          </div>

                          {!isUnlimited && (
                            <div className="space-y-1">
                              <input
                                type="number"
                                {...register(`limits.${lim.key}` as any, { valueAsNumber: true })}
                                className="w-full px-2.5 py-1 text-xs bg-background border border-border/60 rounded-md focus:border-primary focus:outline-hidden"
                              />
                              {(errors.limits as any)?.[lim.key] && (
                                <p className="text-[10px] text-red-500 font-medium">
                                  {(errors.limits as any)?.[lim.key]?.message}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Feature Gates Switches */}
                  <div className="space-y-3 border-t border-border/30 pt-4 pb-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary block">3. Feature Access Permissions</span>
                    
                    {[
                      { key: 'proctoring', label: 'AI Proctoring Lockbox', desc: 'Enable full-screen monitoring, audio feeds, and head-tracking.' },
                      { key: 'customCertificateBranding', label: 'Certificate Custom Branding', desc: 'Allow client logos and signatures on PDF templates.' },
                      { key: 'prioritySupport', label: 'SLA Support Priority Ticket Escalation', desc: 'Guaranteed support ticketing replies within 2 hours.' },
                      { key: 'analyticsExport', label: 'Deep CSV/XLSX Analytics Export', desc: 'Allow full export logs of contestant answers and rankings.' },
                      { key: 'customDomain', label: 'White-label Domain Mapping', desc: 'Clients map tests to custom subdomains with dynamic SSL.' }
                    ].map((feat) => (
                      <div key={feat.key} className="flex items-start justify-between gap-4 p-2 rounded-lg hover:bg-secondary/20">
                        <div className="space-y-0.5">
                          <label className="text-xs font-semibold text-foreground cursor-pointer block">{feat.label}</label>
                          <span className="text-[10px] text-muted-foreground leading-snug block">{feat.desc}</span>
                        </div>
                        <input
                          type="checkbox"
                          {...register(`features.${feat.key}` as any)}
                          className="rounded text-primary border-border focus:ring-primary h-4 w-4 shrink-0 mt-1"
                        />
                      </div>
                    ))}
                  </div>

                </form>

                {/* Footer buttons */}
                <div className="p-4 border-t border-border/40 bg-muted/15 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="flex-1 inline-flex justify-center px-4 py-2 text-xs font-semibold border border-border/60 hover:bg-secondary/45 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="plan-tier-form"
                    disabled={isCreating || isUpdating}
                    className="flex-1 inline-flex justify-center px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors shadow-xs cursor-pointer"
                  >
                    {isCreating || isUpdating ? 'Saving...' : editingPlan ? 'Save Changes' : 'Create Tier'}
                  </button>
                </div>

              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMATION: GLOBAL EDIT WARNING */}
      <AnimatePresence>
        {isEditConfirmOpen && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditConfirmOpen(false)}
              className="fixed inset-0 bg-background/80 backdrop-blur-xs cursor-pointer"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3 text-amber-500">
                <AlertTriangle className="h-6 w-6 shrink-0" />
                <h3 className="text-base font-bold text-foreground">Confirm Global Plan Update</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Warning: Editing <strong>{editingPlan?.name}</strong> will instantly modify quotas and feature flags for the{' '}
                <strong>{editingPlan ? getSubscribedOrgCount(editingPlan.id) : 0}</strong> organizations currently subscribed to this tier.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsEditConfirmOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold border border-border/60 hover:bg-secondary/45 rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => pendingFormData && commitPlanUpdate(pendingFormData)}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-md transition-colors shadow-xs cursor-pointer"
                >
                  Update Global Plan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMATION: DEACTIVATE WARNING */}
      <AnimatePresence>
        {isDeactivateConfirmOpen && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeactivateConfirmOpen(false)}
              className="fixed inset-0 bg-background/80 backdrop-blur-xs cursor-pointer"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3 text-red-500">
                <EyeOff className="h-6 w-6 shrink-0" />
                <h3 className="text-base font-bold text-foreground">Deactivate Subscription Plan?</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Deactivating the <strong>{pendingDeactivatePlan?.name}</strong> plan will prevent new organizations from joining this tier.
                <br />
                <br />
                The <strong>{pendingDeactivatePlan ? getSubscribedOrgCount(pendingDeactivatePlan.id) : 0}</strong> existing organizations currently on this plan will maintain their exact quotas and features.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsDeactivateConfirmOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold border border-border/60 hover:bg-secondary/45 rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={commitDeactivate}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors shadow-xs cursor-pointer"
                >
                  Confirm Deactivation
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
