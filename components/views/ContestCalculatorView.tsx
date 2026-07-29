'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Calculator, 
  Settings, 
  Info, 
  ShieldAlert, 
  Check, 
  Copy, 
  Calendar, 
  HelpCircle,
  Building2,
  Mail,
  Zap,
  ArrowRight,
  Sparkles,
  Server,
  Network,
  Users,
  Clock,
  HelpCircle as QuestionIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useOrganizations } from '@/lib/hooks/useOrganizations';
import { usePricingConfig, useBookings } from '@/lib/hooks/useBookings';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { calculateBookingEstimate } from '@/lib/api/bookings';
import { PricingConfig } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

const DEFAULT_PRICING_CONFIG: PricingConfig = {
  id: 'pricing_default',
  currency: 'INR',
  baseBookingFee: 5000,
  perParticipantCost: 2.5,
  perQuestionCost: 10,
  perInstanceHourCost: 45,
  participantsPerInstance: 1000,
  elastiCachePerDayCost: 150,
  addOns: {
    proctoring: { enabled: true, flatCost: 3500 },
    certificates: { enabled: true, perParticipantCost: 1.5 },
    prioritySupport: { enabled: true, flatCost: 2000 },
  },
  marginMultiplier: 1.35,
  updatedAt: '',
  updatedByAdminName: 'System Default',
};

// Form validation schema for booking calculator
const calculatorSchema = z.object({
  contestName: z.string().min(3, 'Contest name must be at least 3 characters'),
  orgMode: z.enum(['existing', 'new']),
  organizationId: z.string().optional(),
  organizationName: z.string().optional(),
  organizationEmail: z.string().optional(),
  durationMode: z.string(), // '30', '60', '120', '180', 'custom'
  durationCustom: z.number().min(5, 'Minimum 5 minutes').max(1440, 'Maximum 24 hours').optional(),
  questionCount: z.number().min(1, 'At least 1 question').max(1000, 'Maximum 1000 questions'),
  participantCount: z.number().min(1, 'At least 1 participant').max(1000000, 'Maximum 1,000,000 participants'),
  proctoring: z.boolean(),
  certificates: z.boolean(),
  prioritySupport: z.boolean(),
  desiredStartTime: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.orgMode === 'new') {
    if (!data.organizationName || data.organizationName.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Organization name is required',
        path: ['organizationName'],
      });
    }
    if (!data.organizationEmail || !/\S+@\S+\.\S+/.test(data.organizationEmail)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Contact email is required',
        path: ['organizationEmail'],
      });
    }
  } else {
    if (!data.organizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please select an organization',
        path: ['organizationId'],
      });
    }
  }
  
  if (data.durationMode === 'custom' && !data.durationCustom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Custom duration in minutes is required',
      path: ['durationCustom'],
    });
  }
});

type CalculatorFormValues = z.infer<typeof calculatorSchema>;

// Form validation schema for pricing config settings
const settingsSchema = z.object({
  baseBookingFee: z.number().min(0, 'Must be positive'),
  perParticipantCost: z.number().min(0, 'Must be positive'),
  perQuestionCost: z.number().min(0, 'Must be positive'),
  perInstanceHourCost: z.number().min(0, 'Must be positive'),
  participantsPerInstance: z.number().min(1, 'Must be at least 1'),
  elastiCachePerDayCost: z.number().min(0, 'Must be positive'),
  proctoringFlatCost: z.number().min(0, 'Must be positive'),
  certificatesPerParticipantCost: z.number().min(0, 'Must be positive'),
  prioritySupportFlatCost: z.number().min(0, 'Must be positive'),
  marginMultiplier: z.number().min(1.0, 'Multiplier must be at least 1.0 (no loss)'),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function ContestCalculator() {
  const { toast } = useToast();
  const { admin } = useCurrentAdmin();
  const router = useRouter();
  const { organizations = [] } = useOrganizations({ limit: 1000 });
  const { pricingConfig, updatePricingConfig, isUpdating } = usePricingConfig();
  const { createBooking, isCreating } = useBookings();

  const currentConfig = pricingConfig || DEFAULT_PRICING_CONFIG;

  const [activeTab, setActiveTab] = useState<'calculator' | 'settings'>('calculator');
  const [copied, setCopied] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [pendingSettings, setPendingSettings] = useState<SettingsFormValues | null>(null);

  // Checks if user is authorized to edit config (SUPER_ADMIN or BILLING_ADMIN)
  const isAuthorizedToConfig = admin?.role === 'SUPER_ADMIN' || admin?.role === 'BILLING_ADMIN';

  // Calculator Form setup
  const {
    register: registerCalc,
    handleSubmit: handleSubmitCalc,
    control: controlCalc,
    watch: watchCalc,
    setValue: setValueCalc,
    formState: { errors: errorsCalc, isValid: isValidCalc },
  } = useForm<CalculatorFormValues>({
    resolver: zodResolver(calculatorSchema),
    mode: 'onChange',
    defaultValues: {
      contestName: '',
      orgMode: 'existing',
      organizationId: '',
      organizationName: '',
      organizationEmail: '',
      durationMode: '60',
      durationCustom: 60,
      questionCount: 40,
      participantCount: 500,
      proctoring: false,
      certificates: false,
      prioritySupport: false,
      desiredStartTime: '',
    }
  });

  // Settings Form setup
  const {
    register: registerSettings,
    handleSubmit: handleSubmitSettings,
    watch: watchSettings,
    reset: resetSettings,
    formState: { errors: errorsSettings },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    mode: 'onChange',
  });

  // Reset settings form when pricingConfig changes
  useEffect(() => {
    if (pricingConfig) {
      resetSettings({
        baseBookingFee: pricingConfig.baseBookingFee,
        perParticipantCost: pricingConfig.perParticipantCost,
        perQuestionCost: pricingConfig.perQuestionCost,
        perInstanceHourCost: pricingConfig.perInstanceHourCost,
        participantsPerInstance: pricingConfig.participantsPerInstance,
        elastiCachePerDayCost: pricingConfig.elastiCachePerDayCost,
        proctoringFlatCost: pricingConfig.addOns.proctoring.flatCost,
        certificatesPerParticipantCost: pricingConfig.addOns.certificates.perParticipantCost,
        prioritySupportFlatCost: pricingConfig.addOns.prioritySupport.flatCost,
        marginMultiplier: pricingConfig.marginMultiplier,
      });
    }
  }, [pricingConfig, resetSettings]);

  // Live estimating logic
  const watchedCalc = watchCalc();
  const [estimate, setEstimate] = useState<ReturnType<typeof calculateBookingEstimate> & { instances: number } | null>(null);

  useEffect(() => {
    const duration = watchedCalc.durationMode === 'custom'
      ? (Number(watchedCalc.durationCustom) || 60)
      : Number(watchedCalc.durationMode);

    const calcResult = calculateBookingEstimate({
      durationMinutes: duration,
      questionCount: Number(watchedCalc.questionCount) || 0,
      participantCount: Number(watchedCalc.participantCount) || 0,
      addOnsSelected: {
        proctoring: !!watchedCalc.proctoring,
        certificates: !!watchedCalc.certificates,
        prioritySupport: !!watchedCalc.prioritySupport,
      }
    }, currentConfig);

    setEstimate(calcResult);
  }, [
    watchedCalc.durationMode,
    watchedCalc.durationCustom,
    watchedCalc.questionCount,
    watchedCalc.participantCount,
    watchedCalc.proctoring,
    watchedCalc.certificates,
    watchedCalc.prioritySupport,
    currentConfig
  ]);

  // Settings Preview Estimating logic
  const watchedSettings = watchSettings();
  const [previewEstimate, setPreviewEstimate] = useState<any>(null);

  useEffect(() => {
    if (!watchedSettings.baseBookingFee) return;

    // Use watched values as a mock configuration
    const tempConfig: PricingConfig = {
      id: 'preview',
      currency: 'INR',
      baseBookingFee: Number(watchedSettings.baseBookingFee) || 0,
      perParticipantCost: Number(watchedSettings.perParticipantCost) || 0,
      perQuestionCost: Number(watchedSettings.perQuestionCost) || 0,
      perInstanceHourCost: Number(watchedSettings.perInstanceHourCost) || 0,
      participantsPerInstance: Number(watchedSettings.participantsPerInstance) || 1000,
      elastiCachePerDayCost: Number(watchedSettings.elastiCachePerDayCost) || 0,
      addOns: {
        proctoring: { enabled: true, flatCost: Number(watchedSettings.proctoringFlatCost) || 0 },
        certificates: { enabled: true, perParticipantCost: Number(watchedSettings.certificatesPerParticipantCost) || 0 },
        prioritySupport: { enabled: true, flatCost: Number(watchedSettings.prioritySupportFlatCost) || 0 },
      },
      marginMultiplier: Number(watchedSettings.marginMultiplier) || 1.0,
      updatedAt: '',
      updatedByAdminName: '',
    };

    // Calculate fixed preview (1000 participants, 2 hours, 50 questions, certificates+proctoring selected)
    const res = calculateBookingEstimate({
      durationMinutes: 120,
      questionCount: 50,
      participantCount: 1000,
      addOnsSelected: { proctoring: true, certificates: true, prioritySupport: false },
    }, tempConfig);

    setPreviewEstimate(res);
  }, [
    watchedSettings.baseBookingFee,
    watchedSettings.perParticipantCost,
    watchedSettings.perQuestionCost,
    watchedSettings.perInstanceHourCost,
    watchedSettings.participantsPerInstance,
    watchedSettings.elastiCachePerDayCost,
    watchedSettings.proctoringFlatCost,
    watchedSettings.certificatesPerParticipantCost,
    watchedSettings.prioritySupportFlatCost,
    watchedSettings.marginMultiplier
  ]);

  // Handle Calculator submission (creates booking)
  const onSubmitCalculator = async (data: CalculatorFormValues) => {
    if (!estimate) return;

    const duration = data.durationMode === 'custom'
      ? Number(data.durationCustom)
      : Number(data.durationMode);

    const organizationLabel = data.orgMode === 'existing'
      ? organizations.find(o => o.id === data.organizationId)?.name || 'Existing Tenant'
      : data.organizationName;

    try {
      const newBooking = await createBooking({
        status: 'quoted',
        organizationId: data.orgMode === 'existing' ? data.organizationId || null : null,
        organizationName: data.orgMode === 'new' ? data.organizationName : undefined,
        organizationEmail: data.orgMode === 'new' ? data.organizationEmail : undefined,
        contestName: data.contestName,
        durationMinutes: duration,
        questionCount: Number(data.questionCount),
        participantCount: Number(data.participantCount),
        addOnsSelected: {
          proctoring: data.proctoring,
          certificates: data.certificates,
          prioritySupport: data.prioritySupport,
        },
        pricingBreakdown: {
          baseFee: estimate.baseFee,
          computeCost: estimate.computeCost,
          cacheCost: estimate.cacheCost,
          questionCost: estimate.questionCost,
          addOnsCost: estimate.addOnsCost,
          subtotal: estimate.subtotal,
          margin: estimate.margin,
          total: estimate.total,
        },
        desiredStartTime: data.desiredStartTime ? new Date(data.desiredStartTime).toISOString() : null,
        paidAt: null,
        provisionedAt: null,
        cancelledAt: null,
        createdByAdminName: admin?.name || 'System Operator',
      });

      toast(
        'Quote Generated',
        `Successfully created booking quote for "${data.contestName}" under ${organizationLabel}.`,
        'success'
      );

      // Navigate to the newly created booking detail
      router.push(`/dashboard/bookings?bookingId=${newBooking.id}`);
    } catch (e: any) {
      toast('Booking Failed', e.message || 'Failed to create contest booking.', 'error');
    }
  };

  // Copy shareable estimate to clipboard
  const handleCopyEstimate = () => {
    if (!estimate) return;

    const duration = watchedCalc.durationMode === 'custom'
      ? watchedCalc.durationCustom
      : watchedCalc.durationMode;

    const orgText = watchedCalc.orgMode === 'existing'
      ? `Existing Org ID: ${watchedCalc.organizationId}`
      : `New Org: ${watchedCalc.organizationName} (${watchedCalc.organizationEmail})`;

    const textSummary = `
========================================
QUIZBUZZ CONTEST BOOKING ESTIMATE
========================================
Contest: ${watchedCalc.contestName || 'Untitled Contest'}
Client: ${orgText}
Duration: ${duration} Minutes
Questions: ${watchedCalc.questionCount}
Estimated Participants: ${watchedCalc.participantCount}

INFRASTRUCTURE & SERVICE BREAKDOWN:
- Base Reservation Fee: ₹${estimate.baseFee.toLocaleString('en-IN')}
- Dedicated Compute [${estimate.instances} instance(s)]: ₹${estimate.computeCost.toLocaleString('en-IN')}
- ElastiCache Session State: ₹${estimate.cacheCost.toLocaleString('en-IN')}
- Question Processor Pipeline: ₹${estimate.questionCost.toLocaleString('en-IN')}
- Enabled Add-ons: ₹${estimate.addOnsCost.toLocaleString('en-IN')}
  * Proctoring: ${watchedCalc.proctoring ? 'Yes' : 'No'}
  * Custom Certificates: ${watchedCalc.certificates ? 'Yes' : 'No'}
  * Priority 24/7 SLA Support: ${watchedCalc.prioritySupport ? 'Yes' : 'No'}

----------------------------------------
ESTIMATED TOTAL CONTRACT VALUE (₹):
₹${estimate.total.toLocaleString('en-IN')} (incl. taxes and hosting SLA margin)
========================================
Generated on: ${new Date().toLocaleDateString()}
Assisted by operator: ${admin?.name} (${admin?.role})
`;

    navigator.clipboard.writeText(textSummary.trim());
    setCopied(true);
    toast('Copied!', 'Contest cost proposal has been copied to your clipboard.', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle settings update confirmation
  const handleSettingsSaveClick = (data: SettingsFormValues) => {
    setPendingSettings(data);
    setShowSaveConfirm(true);
  };

  const confirmSettingsSave = async () => {
    if (!pendingSettings) return;

    try {
      await updatePricingConfig({
        updates: {
          baseBookingFee: pendingSettings.baseBookingFee,
          perParticipantCost: pendingSettings.perParticipantCost,
          perQuestionCost: pendingSettings.perQuestionCost,
          perInstanceHourCost: pendingSettings.perInstanceHourCost,
          participantsPerInstance: pendingSettings.participantsPerInstance,
          elastiCachePerDayCost: pendingSettings.elastiCachePerDayCost,
          addOns: {
            proctoring: { enabled: true, flatCost: pendingSettings.proctoringFlatCost },
            certificates: { enabled: true, perParticipantCost: pendingSettings.certificatesPerParticipantCost },
            prioritySupport: { enabled: true, flatCost: pendingSettings.prioritySupportFlatCost },
          },
          marginMultiplier: pendingSettings.marginMultiplier,
        },
        adminName: admin?.name || 'System Operator',
        adminRole: admin?.role,
      });

      toast('Config Saved', 'Pricing engine parameters updated successfully. Existing bookings are unaffected.', 'success');
      setShowSaveConfirm(false);
      setPendingSettings(null);
    } catch (e: any) {
      toast('Save Failed', e.message || 'Failed to update pricing engine config.', 'error');
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Section Tabs & Info Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-border/40 select-none">
        <div>
          <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            Phase 4 • On-Demand
          </span>
          <h1 className="text-2xl font-black text-foreground tracking-tight mt-1.5 flex items-center gap-2">
            <Calculator className="h-6 w-6 text-amber-500" /> Contest Booking Engine
          </h1>
        </div>

        {/* Tab Selection Switch */}
        <div className="flex bg-secondary/40 border border-border/50 p-1 rounded-lg">
          <button
            id="calc-tab-trigger"
            onClick={() => setActiveTab('calculator')}
            className={`px-4 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'calculator'
                ? 'bg-card text-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Zap className="h-3.5 w-3.5" /> Quoting Tool
          </button>
          <button
            id="settings-tab-trigger"
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'settings'
                ? 'bg-card text-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Settings className="h-3.5 w-3.5" /> Engine Settings
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'calculator' ? (
          /* PAGE 1: PRICING CALCULATOR VIEW */
          <motion.div
            key="calculator-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
            {/* LEFT COLUMN: FORM INPUTS */}
            <form 
              id="booking-calc-form"
              onSubmit={handleSubmitCalc(onSubmitCalculator)}
              className="lg:col-span-7 bg-card border border-border/50 rounded-xl p-6 space-y-6"
            >
              <div className="border-b border-border/40 pb-4">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  1. Contest Details & Client Targeting
                </h2>
                <p className="text-xs text-muted-foreground mt-1">Configure who is hosting and what they are launching.</p>
              </div>

              {/* Contest Name Input */}
              <div className="space-y-1.5">
                <label htmlFor="calc-contest-name" className="text-xs font-bold text-foreground">
                  Contest Title <span className="text-destructive">*</span>
                </label>
                <input
                  id="calc-contest-name"
                  type="text"
                  placeholder="e.g. All India Coding Olympiad"
                  {...registerCalc('contestName')}
                  className={`w-full h-10 px-3.5 text-xs rounded-lg border bg-secondary/20 focus:outline-none focus:ring-1 transition-all ${
                    errorsCalc.contestName
                      ? 'border-destructive focus:ring-destructive text-destructive'
                      : 'border-border/60 focus:border-amber-500 focus:ring-amber-500'
                  }`}
                />
                {errorsCalc.contestName && (
                  <p className="text-[10px] text-destructive font-medium">{errorsCalc.contestName.message}</p>
                )}
              </div>

              {/* Org Mode Picker (Existing vs New) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground">Client Affiliation</label>
                <div className="grid grid-cols-2 gap-2 bg-secondary/30 p-1 border border-border/50 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setValueCalc('orgMode', 'existing', { shouldValidate: true })}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-all ${
                      watchedCalc.orgMode === 'existing'
                        ? 'bg-card text-foreground font-bold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Existing Organization
                  </button>
                  <button
                    type="button"
                    onClick={() => setValueCalc('orgMode', 'new', { shouldValidate: true })}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-all ${
                      watchedCalc.orgMode === 'new'
                        ? 'bg-card text-foreground font-bold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    New Client / Prospect
                  </button>
                </div>
              </div>

              {/* Conditional Organization Fields */}
              <AnimatePresence mode="popLayout">
                {watchedCalc.orgMode === 'existing' ? (
                  <motion.div
                    key="org-existing"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-1.5"
                  >
                    <label htmlFor="calc-org-select" className="text-xs font-bold text-foreground">
                      Select Organization <span className="text-destructive">*</span>
                    </label>
                    <Controller
                      name="organizationId"
                      control={controlCalc}
                      render={({ field }) => (
                        <select
                          id="calc-org-select"
                          {...field}
                          className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                        >
                          <option value="">-- Choose Tenant --</option>
                          {organizations.map((org) => (
                            <option key={org.id} value={org.id}>
                              {org.name} ({org.status})
                            </option>
                          ))}
                        </select>
                      )}
                    />
                    {errorsCalc.organizationId && (
                      <p className="text-[10px] text-destructive font-medium">{errorsCalc.organizationId.message}</p>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="org-new"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                  >
                    <div className="space-y-1.5">
                      <label htmlFor="calc-new-org-name" className="text-xs font-bold text-foreground">
                        Prospect Org Name <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <input
                          id="calc-new-org-name"
                          type="text"
                          placeholder="e.g. Acme Institute"
                          {...registerCalc('organizationName')}
                          className="w-full h-10 pl-9 pr-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                        />
                      </div>
                      {errorsCalc.organizationName && (
                        <p className="text-[10px] text-destructive font-medium">{errorsCalc.organizationName.message}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="calc-new-org-email" className="text-xs font-bold text-foreground">
                        Contact Email <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <input
                          id="calc-new-org-email"
                          type="email"
                          placeholder="billing@acme.org"
                          {...registerCalc('organizationEmail')}
                          className="w-full h-10 pl-9 pr-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                        />
                      </div>
                      {errorsCalc.organizationEmail && (
                        <p className="text-[10px] text-destructive font-medium">{errorsCalc.organizationEmail.message}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="border-b border-border/40 pb-4 pt-4">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  2. Resource Scale Parameters
                </h2>
                <p className="text-xs text-muted-foreground mt-1">These drive dynamic AWS infrastructure computations.</p>
              </div>

              {/* Duration Presets + Custom Override */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Contest Duration
                  </label>
                  <span className="text-xs font-bold font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                    {watchedCalc.durationMode === 'custom' ? watchedCalc.durationCustom : watchedCalc.durationMode} Mins
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5 bg-secondary/20 p-1 rounded-lg border border-border/40">
                  {['30', '60', '120', '180', 'custom'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setValueCalc('durationMode', mode, { shouldValidate: true });
                        if (mode !== 'custom') {
                          setValueCalc('durationCustom', Number(mode), { shouldValidate: true });
                        }
                      }}
                      className={`py-1.5 text-xs font-semibold rounded-md transition-all ${
                        watchedCalc.durationMode === mode
                          ? 'bg-amber-500 text-black font-bold shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {mode === 'custom' ? 'Custom' : `${Number(mode) >= 60 ? `${Number(mode)/60} hr` : `${mode}m`}`}
                    </button>
                  ))}
                </div>

                {watchedCalc.durationMode === 'custom' && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-1.5 pt-1"
                  >
                    <label htmlFor="calc-duration-custom-input" className="text-[11px] font-bold text-muted-foreground">Specify Custom Minutes</label>
                    <input
                      id="calc-duration-custom-input"
                      type="number"
                      placeholder="e.g. 90"
                      {...registerCalc('durationCustom', { valueAsNumber: true })}
                      className="w-full h-9 px-3 text-xs rounded-lg border border-border/60 bg-secondary/10 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                    {errorsCalc.durationCustom && (
                      <p className="text-[10px] text-destructive font-medium">{errorsCalc.durationCustom.message}</p>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Questions Count */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <label htmlFor="calc-question-count" className="text-xs font-bold text-foreground flex items-center gap-1">
                    <QuestionIcon className="h-3.5 w-3.5 text-muted-foreground" /> Number of Questions
                  </label>
                  <span className="text-[10px] text-muted-foreground">Typical range: 20–100</span>
                </div>
                <input
                  id="calc-question-count"
                  type="number"
                  {...registerCalc('questionCount', { valueAsNumber: true })}
                  className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                />
                {errorsCalc.questionCount && (
                  <p className="text-[10px] text-destructive font-medium">{errorsCalc.questionCount.message}</p>
                )}
              </div>

              {/* Participant Count Slider and Preset buttons */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label htmlFor="calc-participant-count" className="text-xs font-bold text-foreground flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" /> Estimated Participants
                  </label>
                  <span className="text-xs font-bold font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                    {(Number(watchedCalc.participantCount) || 0).toLocaleString('en-IN')} Candidates
                  </span>
                </div>

                <input
                  id="calc-participant-count"
                  type="number"
                  {...registerCalc('participantCount', { valueAsNumber: true })}
                  className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                />

                {/* Quick Presets Buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {[100, 500, 1000, 5000, 10000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setValueCalc('participantCount', preset, { shouldValidate: true })}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-md bg-secondary hover:bg-secondary/80 border border-border/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                    >
                      {preset >= 1000 ? `${preset / 1000}k` : preset}
                    </button>
                  ))}
                </div>
                {errorsCalc.participantCount && (
                  <p className="text-[10px] text-destructive font-medium">{errorsCalc.participantCount.message}</p>
                )}
              </div>

              <div className="border-b border-border/40 pb-4 pt-4">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  3. Premium Add-On Options
                </h2>
                <p className="text-xs text-muted-foreground mt-1">Incorporate enterprise features with custom pricing structures.</p>
              </div>

              {/* Add-ons switches */}
              <div className="space-y-3 select-none">
                {/* Proctoring */}
                <div className="flex items-center justify-between p-3.5 bg-secondary/15 rounded-lg border border-border/40">
                  <div className="space-y-0.5 max-w-[80%]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">AI Human Proctoring Integration</span>
                      {currentConfig.addOns.proctoring.enabled && (
                        <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          +₹{currentConfig.addOns.proctoring.flatCost.toLocaleString('en-IN')} flat
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-normal">
                      Full dynamic camera checks, tab-locking browser compliance, audio tracking, and face analysis.
                    </p>
                  </div>
                  <Controller
                    name="proctoring"
                    control={controlCalc}
                    render={({ field }) => (
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-secondary border-border accent-amber-500 cursor-pointer"
                      />
                    )}
                  />
                </div>

                {/* Certificates */}
                <div className="flex items-center justify-between p-3.5 bg-secondary/15 rounded-lg border border-border/40">
                  <div className="space-y-0.5 max-w-[80%]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">Automated Certificate Branding</span>
                      {currentConfig.addOns.certificates.enabled && (
                        <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          +₹{currentConfig.addOns.certificates.perParticipantCost} / candidate
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-normal">
                      Generate and dispatch high-resolution verification credentials with customer logo branding directly.
                    </p>
                  </div>
                  <Controller
                    name="certificates"
                    control={controlCalc}
                    render={({ field }) => (
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-secondary border-border accent-amber-500 cursor-pointer"
                      />
                    )}
                  />
                </div>

                {/* Priority Support */}
                <div className="flex items-center justify-between p-3.5 bg-secondary/15 rounded-lg border border-border/40">
                  <div className="space-y-0.5 max-w-[80%]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">Priority SLA Operator Support</span>
                      {currentConfig.addOns.prioritySupport.enabled && (
                        <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          +₹{currentConfig.addOns.prioritySupport.flatCost.toLocaleString('en-IN')} flat
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-normal">
                      Dedicated live chat technician assigned to monitor stream health and support active user scale.
                    </p>
                  </div>
                  <Controller
                    name="prioritySupport"
                    control={controlCalc}
                    render={({ field }) => (
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-secondary border-border accent-amber-500 cursor-pointer"
                      />
                    )}
                  />
                </div>
              </div>

              {/* Optional Date-Time Picker */}
              <div className="space-y-1.5 pt-2">
                <label htmlFor="calc-start-time" className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Desired Event Schedule <span className="text-[10px] text-muted-foreground">(Optional)</span>
                </label>
                <input
                  id="calc-start-time"
                  type="datetime-local"
                  {...registerCalc('desiredStartTime')}
                  className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-muted-foreground"
                />
              </div>
            </form>

            {/* RIGHT COLUMN: STICKY BREAKDOWN CARD */}
            <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-4">
              <div className="bg-card border border-border shadow-2xl rounded-xl overflow-hidden">
                {/* Header header badge */}
                <div className="bg-amber-500/10 border-b border-amber-500/10 px-5 py-4 flex items-center justify-between select-none">
                  <h3 className="font-bold text-amber-500 text-xs uppercase tracking-widest flex items-center gap-1.5">
                    <Server className="h-4 w-4" /> Live Resource Estimate
                  </h3>
                  <div className="flex items-center gap-1 font-mono text-[10px] font-bold text-muted-foreground/80">
                    <span>Currency:</span>
                    <span className="text-foreground">{currentConfig.currency}</span>
                  </div>
                </div>

                {/* Line Item Breakdown */}
                {estimate ? (
                  <div className="p-5 space-y-4 font-sans">
                    <div className="space-y-3 border-b border-border/40 pb-4">
                      {/* Base booking fee */}
                      <div className="flex justify-between text-xs text-muted-foreground leading-none">
                        <span>Base booking reservation fee:</span>
                        <span className="font-semibold text-foreground">₹{estimate.baseFee.toLocaleString('en-IN')}</span>
                      </div>

                      {/* Compute Node overhead */}
                      <div className="flex justify-between text-xs text-muted-foreground leading-none items-start">
                        <div className="space-y-0.5">
                          <span>Compute Overhead:</span>
                          <span className="block text-[9px] text-muted-foreground font-medium leading-none">
                            ({estimate.instances} instance(s) @ {watchedCalc.durationMode === 'custom' ? watchedCalc.durationCustom : watchedCalc.durationMode}m run)
                          </span>
                        </div>
                        <span className="font-semibold text-foreground">₹{estimate.computeCost.toLocaleString('en-IN')}</span>
                      </div>

                      {/* Cache session server */}
                      <div className="flex justify-between text-xs text-muted-foreground leading-none">
                        <span>Cache & session infrastructure:</span>
                        <span className="font-semibold text-foreground">₹{estimate.cacheCost.toLocaleString('en-IN')}</span>
                      </div>

                      {/* Question data pipeline */}
                      <div className="flex justify-between text-xs text-muted-foreground leading-none">
                        <span>Question & content processing:</span>
                        <span className="font-semibold text-foreground">₹{estimate.questionCost.toLocaleString('en-IN')}</span>
                      </div>

                      {/* Addons summary */}
                      <div className="flex justify-between text-xs text-muted-foreground leading-none items-start">
                        <div className="space-y-0.5">
                          <span>Add-on options selection:</span>
                          <div className="flex flex-col gap-0.5 pt-1">
                            {watchedCalc.proctoring && (
                              <span className="text-[9px] text-amber-500 font-bold">• AI Proctoring flat active</span>
                            )}
                            {watchedCalc.certificates && (
                              <span className="text-[9px] text-amber-500 font-bold">• Certificate dispatch active</span>
                            )}
                            {watchedCalc.prioritySupport && (
                              <span className="text-[9px] text-amber-500 font-bold">• 24/7 SLA Priority active</span>
                            )}
                          </div>
                        </div>
                        <span className="font-semibold text-foreground">₹{estimate.addOnsCost.toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    {/* Subtotal & Total */}
                    <div className="space-y-2 pb-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Subtotal (estimated cost):</span>
                        <span>₹{estimate.subtotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between items-center bg-secondary/30 p-3 rounded-lg border border-border/40">
                        <span className="text-xs font-bold text-foreground">Total (incl. SLA margin):</span>
                        <span className="text-lg font-black text-amber-500 font-mono">
                          ₹{estimate.total.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={!isValidCalc || isCreating}
                        form="booking-calc-form"
                        className={`w-full h-10 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow transition-all ${
                          isValidCalc && !isCreating
                            ? 'bg-amber-500 hover:bg-amber-600 text-black shadow-sm font-bold active:scale-[0.98]'
                            : 'bg-secondary border border-border/60 text-muted-foreground/60 cursor-not-allowed'
                        }`}
                      >
                        {isCreating ? (
                          <span>Generating quote...</span>
                        ) : (
                          <>
                            <span>Convert to Booking Quote</span>
                            <ArrowRight className="h-4 w-4 animate-pulse" />
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyEstimate}
                        className="w-full h-10 text-xs font-semibold rounded-lg bg-secondary hover:bg-secondary/80 border border-border/50 text-foreground flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                        <span>{copied ? 'Copied proposal details' : 'Copy shareable estimate'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-10 text-center space-y-2 text-muted-foreground select-none">
                    <Calculator className="h-8 w-8 mx-auto animate-bounce text-muted-foreground/50" />
                    <p className="text-xs">Enter details to initiate live cost calculation.</p>
                  </div>
                )}
              </div>

              {/* Informative Help Alert */}
              <div className="p-4 bg-secondary/20 border border-border/50 rounded-xl flex items-start gap-2.5">
                <Info className="h-4.5 w-4.5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-[11px] font-bold text-foreground leading-none">Instant-Booking Mechanics</h4>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    This simulator allows operators to quote dynamic single-contest services for clients. Once generated, quotes are frozen to protect client proposals from live settings adjustments.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          /* PAGE 4: PRICING CONFIGURATION SETTINGS VIEW */
          <motion.div
            key="settings-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            {!isAuthorizedToConfig ? (
              /* Support Role Denied Access screen */
              <div className="bg-card border border-border/50 rounded-xl p-8 max-w-xl mx-auto text-center space-y-4 select-none">
                <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto text-destructive">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-foreground text-sm">Privileged Operator Session Required</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    You are currently authenticated as a <strong className="text-destructive uppercase font-mono">{admin?.role.replace('_', ' ')}</strong>. Under security compliance guidelines, only administrators holding SUPER ADMIN or BILLING ADMIN policies are authorized to alter base pricing multipliers.
                  </p>
                </div>
                <div className="p-3 bg-secondary/30 rounded-lg text-[10px] text-muted-foreground border border-border/40 max-w-md mx-auto leading-normal">
                  ⚠️ Attempted configurations are flagged in the global administrative audit trails. Contact security officers to request structural changes.
                </div>
              </div>
            ) : (
              /* Admin Config form and preview split panel */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Configuration form on left */}
                <form
                  onSubmit={handleSubmitSettings(handleSettingsSaveClick)}
                  className="lg:col-span-7 bg-card border border-border/50 rounded-xl p-6 space-y-5"
                >
                  <div className="border-b border-border/40 pb-4">
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                      ⚙️ Core Infrastructure Rate Cards
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">Specify absolute rates to dictate all upcoming on-demand quotes.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Base booking fee */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">Base booking reservation fee (₹)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        {...registerSettings('baseBookingFee', { valueAsNumber: true })}
                        className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                      />
                      {errorsSettings.baseBookingFee && (
                        <p className="text-[10px] text-destructive">{errorsSettings.baseBookingFee.message}</p>
                      )}
                    </div>

                    {/* Per-participant flat rate */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">Per-participant cost multiplier (₹)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        {...registerSettings('perParticipantCost', { valueAsNumber: true })}
                        className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                      />
                      {errorsSettings.perParticipantCost && (
                        <p className="text-[10px] text-destructive">{errorsSettings.perParticipantCost.message}</p>
                      )}
                    </div>

                    {/* Per-question pipeline */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">Per-question processing rate (₹)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        {...registerSettings('perQuestionCost', { valueAsNumber: true })}
                        className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                      />
                      {errorsSettings.perQuestionCost && (
                        <p className="text-[10px] text-destructive">{errorsSettings.perQuestionCost.message}</p>
                      )}
                    </div>

                    {/* Compute instances rates */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">Hourly compute node rate (₹)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        {...registerSettings('perInstanceHourCost', { valueAsNumber: true })}
                        className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                      />
                      {errorsSettings.perInstanceHourCost && (
                        <p className="text-[10px] text-destructive">{errorsSettings.perInstanceHourCost.message}</p>
                      )}
                    </div>

                    {/* Scale of compute */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">Max candidates per container</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        {...registerSettings('participantsPerInstance', { valueAsNumber: true })}
                        className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                      />
                      {errorsSettings.participantsPerInstance && (
                        <p className="text-[10px] text-destructive">{errorsSettings.participantsPerInstance.message}</p>
                      )}
                    </div>

                    {/* ElastiCache costs */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">ElastiCache daily rate (₹)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        {...registerSettings('elastiCachePerDayCost', { valueAsNumber: true })}
                        className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                      />
                      {errorsSettings.elastiCachePerDayCost && (
                        <p className="text-[10px] text-destructive">{errorsSettings.elastiCachePerDayCost.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="border-b border-border/40 pb-4 pt-3">
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                      ⚙️ Add-On & Margin Overrides
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">Configure premium integration rate limits and company margin targets.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Proctoring cost */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">Proctoring integration rate (₹)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        {...registerSettings('proctoringFlatCost', { valueAsNumber: true })}
                        className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                      />
                    </div>

                    {/* Certificate custom costs */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">Certificate per-unit cost (₹)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        {...registerSettings('certificatesPerParticipantCost', { valueAsNumber: true })}
                        className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                      />
                    </div>

                    {/* Support level cost */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">Priority SLA tech support flat (₹)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        {...registerSettings('prioritySupportFlatCost', { valueAsNumber: true })}
                        className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                      />
                    </div>

                    {/* Company Margin multiplier */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">Margin multiplier (e.g. 1.35 = 35% margin)</label>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        {...registerSettings('marginMultiplier', { valueAsNumber: true })}
                        className="w-full h-10 px-3.5 text-xs rounded-lg border border-border/60 bg-secondary/20 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono font-bold"
                      />
                      {errorsSettings.marginMultiplier && (
                        <p className="text-[10px] text-destructive">{errorsSettings.marginMultiplier.message}</p>
                      )}
                    </div>
                  </div>

                  {/* Save button */}
                  <div className="pt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={isUpdating}
                      className="px-5 py-2.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-black shadow active:scale-[0.98] transition-all cursor-pointer"
                    >
                      {isUpdating ? 'Saving config...' : 'Commit Settings Config'}
                    </button>
                  </div>
                </form>

                {/* Live Estimator Preview Card on Settings Page */}
                <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-4">
                  <div className="bg-card border border-border shadow-2xl rounded-xl overflow-hidden">
                    <div className="bg-secondary/40 border-b border-border/50 px-5 py-4 select-none">
                      <h3 className="font-bold text-foreground text-xs uppercase tracking-widest flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-amber-500" /> Settings Simulation Panel
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-1">Visualizes pricing shifts on a fixed test scenario as you edit.</p>
                    </div>

                    <div className="p-5 space-y-4">
                      {/* Fixed values for the scenario */}
                      <div className="p-3.5 bg-secondary/25 border border-border/40 rounded-lg space-y-2">
                        <h4 className="text-[10px] font-bold text-foreground leading-none">Fixed Test Scenario</h4>
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                          <div>• Candidates: <strong>1,000</strong></div>
                          <div>• Duration: <strong>2 Hours</strong></div>
                          <div>• Questions: <strong>50 Units</strong></div>
                          <div className="col-span-2 text-amber-500 font-medium">• Add-ons: <strong>Proctoring & Certificates</strong> active</div>
                        </div>
                      </div>

                      {previewEstimate ? (
                        <div className="space-y-3 font-mono text-[11px] border-t border-border/40 pt-3 text-muted-foreground leading-normal">
                          <div className="flex justify-between">
                            <span>Base Reservation Fee:</span>
                            <span className="text-foreground">₹{previewEstimate.baseFee}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Compute Overheads:</span>
                            <span className="text-foreground">₹{previewEstimate.computeCost}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>ElastiCache Session:</span>
                            <span className="text-foreground">₹{previewEstimate.cacheCost}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Question Processing:</span>
                            <span className="text-foreground">₹{previewEstimate.questionCost}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Enabled Add-ons:</span>
                            <span className="text-foreground">₹{previewEstimate.addOnsCost}</span>
                          </div>
                          <div className="border-t border-dashed border-border/50 pt-2 flex justify-between font-bold text-foreground">
                            <span>Subtotal Cost:</span>
                            <span>₹{previewEstimate.subtotal}</span>
                          </div>
                          <div className="flex justify-between font-bold text-foreground">
                            <span>Profit Margin Portion:</span>
                            <span>₹{previewEstimate.margin}</span>
                          </div>
                          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold rounded flex justify-between text-xs font-sans mt-2">
                            <span>Proposed Total:</span>
                            <span className="font-mono font-bold">₹{previewEstimate.total}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Adjust inputs to calculate mock scenario proposal.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* SECURE SAVE SETTINGS CONFIRMATION MODAL */}
      {showSaveConfirm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border/50 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/40">
              <h3 className="font-bold text-amber-500 text-sm flex items-center gap-1.5">
                <Settings className="h-4 w-4" /> Save Core Rate Card
              </h3>
            </div>

            <div className="space-y-2 select-none">
              <p className="text-xs text-muted-foreground leading-relaxed">
                You are about to commit structural modifications to the QuizBuzz automated booking engine.
              </p>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-lg text-[10px] leading-normal font-medium space-y-1">
                <p>⚠️ <strong>Quote Isolation Rule:</strong> This action impacts all FUTURE estimates only. All existing quotes, paid bookings, and running contests are frozen and fully isolated.</p>
                <p>📜 <strong>Audit Logging:</strong> This update will write a <code>pricing_config.updated</code> audit event tagged under operator <strong>{admin?.name}</strong>.</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowSaveConfirm(false);
                  setPendingSettings(null);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSettingsSave}
                className="px-4 py-2 text-xs font-bold rounded-md bg-amber-500 hover:bg-amber-600 text-black shadow-sm cursor-pointer"
              >
                Confirm & Update Engine
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
