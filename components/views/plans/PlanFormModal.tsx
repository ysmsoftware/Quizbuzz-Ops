'use client';

import React, { useEffect } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { SubscriptionPlan } from '@/lib/types';
import { X, Sparkles } from 'lucide-react';
import { OrganizationCombobox } from '@/components/ui/OrganizationCombobox';
import { motion, AnimatePresence } from 'motion/react';

const planSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric and hyphens only'),
  description: z.string().min(1, 'Description is required'),
  currency: z.string().min(1, 'Currency is required'),
  allowsMonthly: z.boolean(),
  allowsAnnual: z.boolean(),
  allowsHalfYearly: z.boolean(),
  isSellable: z.boolean(),
  organizationId: z.string().nullable(),
  audience: z.enum(['ORGANIZER', 'EDUCATION', 'BUSINESS']).nullable(),
  halfYearlyPrice: z.coerce.number({ message: '6-month price must be a number' }).min(0, '6-month price must be 0 or positive').nullable(),
  monthlyPrice: z.coerce.number({ message: 'Monthly price must be a number' }).min(0, 'Monthly price must be 0 or positive').nullable(),
  annualPrice: z.coerce.number({ message: 'Annual price must be a number' }).min(0, 'Annual price must be 0 or positive').nullable(),
  isActive: z.boolean(),
  limits: z.object({
    maxContestsPerCycle: z.number().int().positive('Must be positive').nullable(),
    maxParticipantsPerContest: z.number().int().positive('Must be positive').nullable(),
    maxQuestionsPerContest: z.number().int().positive('Must be positive').nullable(),
    maxOrgMembers: z.number().int().positive('Must be positive').nullable(),
    maxLearners: z.number().int().min(0, 'Must be 0 or more').nullable(),
    maxCandidatesPerMonth: z.number().int().min(0, 'Must be 0 or more').nullable(),
    aiCreditsPerMonth: z.number().int().min(0, 'Must be 0 or more').nullable(),
  }),
  features: z.object({
    proctoring: z.boolean(),
    customCertificateBranding: z.boolean(),
    prioritySupport: z.boolean(),
    analyticsExport: z.boolean(),
    customDomain: z.boolean(),
    learnerGroups: z.boolean(),
    gradebook: z.boolean(),
    ambassadorCampaigns: z.boolean(),
    manualEmails: z.boolean(),
  }),
}).superRefine((data, ctx) => {
  if (!data.allowsMonthly && !data.allowsAnnual) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enable at least one billing cycle', path: ['allowsMonthly'] });
  }
  if (data.allowsMonthly && (data.monthlyPrice === null || data.monthlyPrice === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Monthly price is required', path: ['monthlyPrice'] });
  }
  if (data.allowsHalfYearly && (data.halfYearlyPrice === null || data.halfYearlyPrice === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '6-month price is required', path: ['halfYearlyPrice'] });
  }
  if (data.allowsAnnual && (data.annualPrice === null || data.annualPrice === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Annual price is required', path: ['annualPrice'] });
  }
});

export type PlanFormValues = z.infer<typeof planSchema>;

/** A blank limit box means unlimited. */
const limitInput = { setValueAs: (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v)) };

interface PlanFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PlanFormValues) => void;
  editingPlan: SubscriptionPlan | null;
  isSubmitting: boolean;
}

export default function PlanFormModal({
  isOpen,
  onClose,
  onSubmit,
  editingPlan,
  isSubmitting,
}: PlanFormModalProps) {
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema) as unknown as Resolver<PlanFormValues>,
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      currency: 'INR',
      allowsMonthly: true,
      allowsAnnual: false,
      allowsHalfYearly: false,
      isSellable: false,
      organizationId: null,
      audience: null,
      monthlyPrice: 0,
      annualPrice: null,
      halfYearlyPrice: null,
      isActive: true,
      limits: {
        maxContestsPerCycle: 10,
        maxParticipantsPerContest: 500,
        maxQuestionsPerContest: 30,
        maxOrgMembers: 5,
        maxLearners: 0,
        maxCandidatesPerMonth: null,
        aiCreditsPerMonth: 0,
      },
      features: {
        proctoring: false,
        customCertificateBranding: false,
        prioritySupport: false,
        analyticsExport: false,
        customDomain: false,
        learnerGroups: false,
        gradebook: false,
        ambassadorCampaigns: false,
        manualEmails: false,
      }
    }
  });

  // Reset form when opening or changing editingPlan
  useEffect(() => {
    if (isOpen) {
      if (editingPlan) {
        reset({
          name: editingPlan.name,
          slug: editingPlan.slug,
          description: editingPlan.description,
          currency: editingPlan.currency || 'INR',
          allowsMonthly: editingPlan.allowsMonthly,
          allowsAnnual: editingPlan.allowsAnnual,
          allowsHalfYearly: editingPlan.allowsHalfYearly,
          isSellable: editingPlan.isSellable,
          organizationId: editingPlan.organizationId,
          audience: editingPlan.audience,
          halfYearlyPrice: editingPlan.halfYearlyPrice,
          monthlyPrice: editingPlan.monthlyPrice,
          annualPrice: editingPlan.annualPrice,
          isActive: editingPlan.isActive,
          limits: {
            maxContestsPerCycle: editingPlan.limits.maxContestsPerCycle,
            maxParticipantsPerContest: editingPlan.limits.maxParticipantsPerContest,
            maxQuestionsPerContest: editingPlan.limits.maxQuestionsPerContest,
            maxOrgMembers: editingPlan.limits.maxOrgMembers,
            maxLearners: editingPlan.limits.maxLearners,
            maxCandidatesPerMonth: editingPlan.limits.maxCandidatesPerMonth,
            aiCreditsPerMonth: editingPlan.limits.aiCreditsPerMonth,
          },
          features: {
            proctoring: editingPlan.features.proctoring,
            customCertificateBranding: editingPlan.features.customCertificateBranding,
            prioritySupport: editingPlan.features.prioritySupport,
            analyticsExport: editingPlan.features.analyticsExport,
            customDomain: editingPlan.features.customDomain,
            learnerGroups: editingPlan.features.learnerGroups,
            gradebook: editingPlan.features.gradebook,
            ambassadorCampaigns: editingPlan.features.ambassadorCampaigns,
            manualEmails: editingPlan.features.manualEmails,
          }
        });
      } else {
        reset({
          name: '',
          slug: '',
          description: '',
          currency: 'INR',
          allowsMonthly: true,
          allowsAnnual: false,
          allowsHalfYearly: false,
          isSellable: false,
          organizationId: null,
          audience: null,
          monthlyPrice: 0,
          annualPrice: null,
          halfYearlyPrice: null,
          isActive: true,
          limits: {
            maxContestsPerCycle: 10,
            maxParticipantsPerContest: 250,
            maxQuestionsPerContest: 25,
            maxOrgMembers: 5,
            maxLearners: 0,
            maxCandidatesPerMonth: null,
            aiCreditsPerMonth: 0,
          },
          features: {
            proctoring: false,
            customCertificateBranding: false,
            prioritySupport: false,
            analyticsExport: false,
            customDomain: false,
            learnerGroups: false,
            gradebook: false,
            ambassadorCampaigns: false,
            manualEmails: false,
          }
        });
      }
    }
  }, [isOpen, editingPlan, reset]);

  // Auto-slug generation
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

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card border border-border/80 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border/50 bg-muted/20">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">
                {editingPlan ? `Edit Subscription Plan: ${editingPlan.name}` : 'Create New Subscription Plan'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
            {/* General Info */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-foreground border-b pb-1">Basic Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-1">Plan Name</label>
                  <input
                    type="text"
                    {...register('name')}
                    placeholder="e.g. Growth Pro"
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                  />
                  {errors.name && <p className="text-destructive text-[11px] mt-0.5">{errors.name.message}</p>}
                </div>

                <div>
                  <label className="block font-medium mb-1">Plan Slug</label>
                  <input
                    type="text"
                    {...register('slug')}
                    placeholder="growth-pro"
                    disabled={!!editingPlan}
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary disabled:opacity-60"
                  />
                  {errors.slug && <p className="text-destructive text-[11px] mt-0.5">{errors.slug.message}</p>}
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Description</label>
                <textarea
                  {...register('description')}
                  rows={2}
                  placeholder="Tier description for platform operators..."
                  className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                />
                {errors.description && <p className="text-destructive text-[11px] mt-0.5">{errors.description.message}</p>}
              </div>

              <div className="space-y-3">
                <label className="block font-medium">Billing Cycles &amp; Pricing</label>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  Enable one or both cycles. Annual is not derived from monthly — set its own fixed rate.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className={`p-3 rounded-lg border transition-colors ${watch('allowsMonthly') ? 'border-primary/40 bg-primary/5' : 'border-border/40'}`}>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        {...register('allowsMonthly')}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <span className="font-medium">Monthly billing</span>
                    </label>
                    {watch('allowsMonthly') && (
                      <div className="mt-2">
                        <label className="block text-[11px] text-muted-foreground mb-1">Monthly Price (₹ INR)</label>
                        <input
                          type="number"
                          step="0.01"
                          {...register('monthlyPrice')}
                          className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                        />
                        {errors.monthlyPrice && <p className="text-destructive text-[11px] mt-0.5">{errors.monthlyPrice.message}</p>}
                      </div>
                    )}
                  </div>

                  <div className={`p-3 rounded-lg border transition-colors ${watch('allowsAnnual') ? 'border-primary/40 bg-primary/5' : 'border-border/40'}`}>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        {...register('allowsAnnual')}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <span className="font-medium">Annual billing</span>
                    </label>
                    {watch('allowsAnnual') && (
                      <div className="mt-2">
                        <label className="block text-[11px] text-muted-foreground mb-1">Annual Price (₹ INR)</label>
                        <input
                          type="number"
                          step="0.01"
                          {...register('annualPrice')}
                          className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                        />
                        {errors.annualPrice && <p className="text-destructive text-[11px] mt-0.5">{errors.annualPrice.message}</p>}
                      </div>
                    )}
                  </div>
                </div>
                {errors.allowsMonthly && <p className="text-destructive text-[11px]">{errors.allowsMonthly.message}</p>}

                <div className={`p-3 rounded-lg border transition-colors ${watch('allowsHalfYearly') ? 'border-primary/40 bg-primary/5' : 'border-border/40'}`}>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" {...register('allowsHalfYearly')} className="h-4 w-4 rounded border-input text-primary focus:ring-primary" />
                    <span className="font-medium">6-month billing</span>
                  </label>
                  {watch('allowsHalfYearly') && (
                    <div className="mt-2">
                      <label className="block text-[11px] text-muted-foreground mb-1">6-month Price (₹ INR)</label>
                      <input type="number" step="0.01" {...register('halfYearlyPrice')} className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary" />
                      {errors.halfYearlyPrice && <p className="text-destructive text-[11px] mt-0.5">{errors.halfYearlyPrice.message}</p>}
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="isActive"
                    {...register('isActive')}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                  <label htmlFor="isActive" className="font-medium cursor-pointer">Active Tier</label>
                </div>

                <div className="flex items-center space-x-2">
                  <input type="checkbox" id="isSellable" {...register('isSellable')} className="h-4 w-4 rounded border-input text-primary focus:ring-primary" />
                  <label htmlFor="isSellable" className="font-medium cursor-pointer">On sale to new customers</label>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">Leave off for a contact-sales or retired plan. Ops can still assign it to any organization.</p>

                {!editingPlan && (
                  <div>
                    <label className="block font-medium mb-1">Private to one organization (optional)</label>
                    <OrganizationCombobox
                      value={watch('organizationId') ?? ''}
                      onChange={(id) => {
                        setValue('organizationId', id || null);
                        if (id) setValue('isSellable', false);
                      }}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">For a special price or special limits. It never appears on the website, and only this organization can be put on it.</p>
                  </div>
                )}

                <div>
                  <label htmlFor="audience" className="block font-medium mb-1">Shown on page</label>
                  <select
                    id="audience"
                    {...register('audience', { setValueAs: (v) => v || null })}
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                  >
                    <option value="">None</option>
                    <option value="ORGANIZER">Organizers</option>
                    <option value="EDUCATION">Educators</option>
                    <option value="BUSINESS">Business</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Quota Limits */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-foreground border-b pb-1">Default Quota Limits</h3>
              <p className="text-[11px] text-muted-foreground">Leave a box blank for unlimited.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-1">Max Quizzes per Month</label>
                  <input
                    type="number"
                    {...register('limits.maxContestsPerCycle', limitInput)}
                    placeholder="e.g. 10"
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Max Participants per Quiz</label>
                  <input
                    type="number"
                    {...register('limits.maxParticipantsPerContest', limitInput)}
                    placeholder="e.g. 1000"
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Max Questions per Quiz</label>
                  <input
                    type="number"
                    {...register('limits.maxQuestionsPerContest', limitInput)}
                    placeholder="e.g. 50"
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Max Team Members</label>
                  <input
                    type="number"
                    {...register('limits.maxOrgMembers', limitInput)}
                    placeholder="e.g. 5"
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Max Learners</label>
                  <input type="number" {...register('limits.maxLearners', limitInput)} placeholder="0 means no learner portal" className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary" />
                </div>

                <div>
                  <label className="block font-medium mb-1">Max Candidates per Month</label>
                  <input type="number" {...register('limits.maxCandidatesPerMonth', limitInput)} placeholder="Business plans" className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary" />
                </div>

                <div>
                  <label className="block font-medium mb-1">AI Credits per Month</label>
                  <input type="number" {...register('limits.aiCreditsPerMonth', limitInput)} placeholder="e.g. 300" className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary" />
                </div>
              </div>
            </div>

            {/* Feature Flags */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-foreground border-b pb-1">Feature Entitlements</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30">
                  <input type="checkbox" {...register('features.proctoring')} className="h-4 w-4 rounded text-primary" />
                  <span>Webcam Proctoring</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30">
                  <input type="checkbox" {...register('features.customCertificateBranding')} className="h-4 w-4 rounded text-primary" />
                  <span>Certificate Branding</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30">
                  <input type="checkbox" {...register('features.analyticsExport')} className="h-4 w-4 rounded text-primary" />
                  <span>CSV Export</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30">
                  <input type="checkbox" {...register('features.customDomain')} className="h-4 w-4 rounded text-primary" />
                  <span>Custom Domain</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30">
                  <input type="checkbox" {...register('features.learnerGroups')} className="h-4 w-4 rounded text-primary" />
                  <span>Learner Groups</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30">
                  <input type="checkbox" {...register('features.gradebook')} className="h-4 w-4 rounded text-primary" />
                  <span>Gradebook</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30">
                  <input type="checkbox" {...register('features.ambassadorCampaigns')} className="h-4 w-4 rounded text-primary" />
                  <span>Ambassador Campaigns</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30">
                  <input type="checkbox" {...register('features.manualEmails')} className="h-4 w-4 rounded text-primary" />
                  <span>Broadcast Emails</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30 col-span-2">
                  <input type="checkbox" {...register('features.prioritySupport')} className="h-4 w-4 rounded text-primary" />
                  <span>Priority 24/7 Support</span>
                </label>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-border/50">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
