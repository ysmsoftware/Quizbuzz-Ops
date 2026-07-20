'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { SubscriptionPlan } from '@/lib/types';
import { X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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

export type PlanFormValues = z.infer<typeof planSchema>;

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

  // Reset form when opening or changing editingPlan
  useEffect(() => {
    if (isOpen) {
      if (editingPlan) {
        reset({
          name: editingPlan.name,
          slug: editingPlan.slug,
          description: editingPlan.description,
          price: editingPlan.price,
          currency: editingPlan.currency || 'INR',
          billingCycle: editingPlan.billingCycle,
          isActive: editingPlan.isActive,
          limits: {
            maxContestsPerCycle: editingPlan.limits.maxContestsPerCycle,
            maxParticipantsPerContest: editingPlan.limits.maxParticipantsPerContest,
            maxQuestionsPerContest: editingPlan.limits.maxQuestionsPerContest,
            maxOrgMembers: editingPlan.limits.maxOrgMembers,
          },
          features: {
            proctoring: editingPlan.features.proctoring,
            customCertificateBranding: editingPlan.features.customCertificateBranding,
            prioritySupport: editingPlan.features.prioritySupport,
            analyticsExport: editingPlan.features.analyticsExport,
            customDomain: editingPlan.features.customDomain,
          }
        });
      } else {
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium mb-1">Price (₹ INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('price')}
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                  />
                  {errors.price && <p className="text-destructive text-[11px] mt-0.5">{errors.price.message}</p>}
                </div>

                <div>
                  <label className="block font-medium mb-1">Billing Cycle</label>
                  <select
                    {...register('billingCycle')}
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>

                <div className="flex items-center pt-5 space-x-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    {...register('isActive')}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                  <label htmlFor="isActive" className="font-medium cursor-pointer">Active Tier</label>
                </div>
              </div>
            </div>

            {/* Quota Limits */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-foreground border-b pb-1">Default Quota Limits</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-1">Max Quizzes per Cycle</label>
                  <input
                    type="number"
                    {...register('limits.maxContestsPerCycle', { valueAsNumber: true })}
                    placeholder="e.g. 10"
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Max Participants per Quiz</label>
                  <input
                    type="number"
                    {...register('limits.maxParticipantsPerContest', { valueAsNumber: true })}
                    placeholder="e.g. 1000"
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Max Questions per Quiz</label>
                  <input
                    type="number"
                    {...register('limits.maxQuestionsPerContest', { valueAsNumber: true })}
                    placeholder="e.g. 50"
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Max Team Members</label>
                  <input
                    type="number"
                    {...register('limits.maxOrgMembers', { valueAsNumber: true })}
                    placeholder="e.g. 5"
                    className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Feature Flags */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-foreground border-b pb-1">Feature Entitlements</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30">
                  <input type="checkbox" {...register('features.proctoring')} className="h-4 w-4 rounded text-primary" />
                  <span>AI Proctoring</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30">
                  <input type="checkbox" {...register('features.customCertificateBranding')} className="h-4 w-4 rounded text-primary" />
                  <span>Certificate Branding</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30">
                  <input type="checkbox" {...register('features.analyticsExport')} className="h-4 w-4 rounded text-primary" />
                  <span>Analytics Export</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted/40 border border-border/30">
                  <input type="checkbox" {...register('features.customDomain')} className="h-4 w-4 rounded text-primary" />
                  <span>Custom Domain</span>
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
