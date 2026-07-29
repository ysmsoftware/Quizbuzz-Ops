'use client';

import { Organization, SubscriptionPlan, Contest, BillingRecord, AuditLog, Participant, OrganizationSubscription, PlanChangeEvent, Payment, AuditLogEntry, PricingConfig, ContestBooking, InfraStatus, ScalingConfig, FeatureFlag } from '@/lib/types';

// Constants for initial seeding
const INITIAL_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_free',
    name: 'Starter',
    slug: 'starter',
    description: 'Perfect for testing and personal trivia games.',
    currency: 'INR',
    allowsMonthly: true,
    allowsAnnual: false,
    monthlyPrice: 0,
    annualPrice: null,
    isActive: true,
    limits: {
      maxContestsPerCycle: 3,
      maxParticipantsPerContest: 50,
      maxQuestionsPerContest: 10,
      maxOrgMembers: 1,
    },
    features: {
      proctoring: false,
      customCertificateBranding: false,
      prioritySupport: false,
      analyticsExport: false,
      customDomain: false,
    },
    createdAt: '2025-11-15T00:00:00Z',
    updatedAt: '2025-11-15T00:00:00Z',
    priceINR: 0,
  },
  {
    id: 'plan_starter',
    name: 'Growth',
    slug: 'growth',
    description: 'Designed for small tutoring centers and rising brands.',
    currency: 'INR',
    allowsMonthly: true,
    allowsAnnual: false,
    monthlyPrice: 2999,
    annualPrice: null,
    isActive: true,
    limits: {
      maxContestsPerCycle: 15,
      maxParticipantsPerContest: 500,
      maxQuestionsPerContest: 30,
      maxOrgMembers: 5,
    },
    features: {
      proctoring: false,
      customCertificateBranding: true,
      prioritySupport: false,
      analyticsExport: true,
      customDomain: false,
    },
    createdAt: '2025-11-15T00:00:00Z',
    updatedAt: '2025-11-15T00:00:00Z',
    priceINR: 2999,
  },
  {
    id: 'plan_pro',
    name: 'Scale',
    slug: 'scale',
    description: 'For high-volume professional testing centers.',
    currency: 'INR',
    allowsMonthly: true,
    allowsAnnual: false,
    monthlyPrice: 9999,
    annualPrice: null,
    isActive: true,
    limits: {
      maxContestsPerCycle: 50,
      maxParticipantsPerContest: 2500,
      maxQuestionsPerContest: 100,
      maxOrgMembers: 20,
    },
    features: {
      proctoring: true,
      customCertificateBranding: true,
      prioritySupport: true,
      analyticsExport: true,
      customDomain: true,
    },
    createdAt: '2025-11-15T00:00:00Z',
    updatedAt: '2025-11-15T00:00:00Z',
    priceINR: 9999,
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    slug: 'enterprise',
    description: 'Unlimited scale and features with dedicated hosting support.',
    currency: 'INR',
    allowsMonthly: true,
    allowsAnnual: false,
    monthlyPrice: 49999,
    annualPrice: null,
    isActive: true,
    limits: {
      maxContestsPerCycle: null,
      maxParticipantsPerContest: null,
      maxQuestionsPerContest: null,
      maxOrgMembers: null,
    },
    features: {
      proctoring: true,
      customCertificateBranding: true,
      prioritySupport: true,
      analyticsExport: true,
      customDomain: true,
    },
    createdAt: '2025-11-15T00:00:00Z',
    updatedAt: '2025-11-15T00:00:00Z',
    priceINR: 49999,
  }
];

const INITIAL_ORGANIZATIONS: Organization[] = [
  {
    id: 'org_1',
    name: 'TechTutors Academy',
    slug: 'techtutors',
    status: 'ACTIVE',
    planId: 'plan_pro',
    createdAt: '2025-11-15T10:30:00Z',
    updatedAt: '2026-06-25T12:00:00Z',
    membersCount: 4,
    memberCount: 4,
    contactPerson: {
      name: 'Rahul Sharma',
      email: 'rahul.sharma@techtutors.in',
      phone: '+91 98765 43210',
    },
    ownerName: 'Rahul Sharma',
    ownerEmail: 'rahul.sharma@techtutors.in',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=TechTutors&backgroundColor=0d9488',
    website: 'https://techtutors.in',
    notes: [
      {
        id: 'note_1_1',
        authorName: 'Admin Support',
        body: 'Rahul requested an invoice copy for his Pro renewal. Sent over email.',
        createdAt: '2026-06-16T10:00:00Z',
        tags: ['Billing', 'Invoice']
      },
      {
        id: 'note_1_2',
        authorName: 'System Auditor',
        body: 'Migrated from basic starter plan to Pro plan automatically after successful transaction.',
        createdAt: '2025-12-15T18:30:00Z',
        tags: ['System', 'Migration']
      }
    ]
  },
  {
    id: 'org_2',
    name: 'Newton Coding Bootcamp',
    slug: 'newton-labs',
    status: 'ACTIVE',
    planId: 'plan_enterprise',
    createdAt: '2025-12-01T08:15:00Z',
    updatedAt: '2026-06-30T10:00:00Z',
    membersCount: 6,
    memberCount: 6,
    contactPerson: {
      name: 'Sneha Gupta',
      email: 'sneha.gupta@newtoncoding.co.in',
      phone: '+91 87654 32109',
    },
    ownerName: 'Sneha Gupta',
    ownerEmail: 'sneha.gupta@newtoncoding.co.in',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Newton&backgroundColor=4f46e5',
    website: 'https://newtoncoding.co.in',
    notes: [
      {
        id: 'note_2_1',
        authorName: 'Support Executive',
        body: 'Met with Sneha online. They are planning to host a massive 5000+ national level quiz next month. Verified that their Enterprise limits support up to 15000 participants.',
        createdAt: '2026-06-20T14:20:00Z',
        tags: ['Sales', 'Scale-Check']
      }
    ]
  },
  {
    id: 'org_3',
    name: 'Brainiac Trivia Hub',
    slug: 'brainiac',
    status: 'ACTIVE',
    planId: 'plan_starter',
    createdAt: '2026-01-10T14:45:00Z',
    updatedAt: '2026-06-10T15:00:00Z',
    membersCount: 2,
    memberCount: 2,
    contactPerson: {
      name: 'Amit Patel',
      email: 'amit.patel@brainiactrivia.com',
      phone: '+91 76543 21098',
    },
    ownerName: 'Amit Patel',
    ownerEmail: 'amit.patel@brainiactrivia.com',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Brainiac&backgroundColor=0ea5e9',
    website: 'https://brainiactrivia.com',
    notes: [
      {
        id: 'note_3_1',
        authorName: 'Billing Desk',
        body: 'Starter subscription payment received successfully. No disputes.',
        createdAt: '2026-06-10T15:00:00Z',
        tags: ['Billing']
      }
    ]
  },
  {
    id: 'org_4',
    name: 'Zenith Corporate Training',
    slug: 'zenith-corp',
    status: 'ACTIVE',
    planId: 'plan_pro',
    createdAt: '2026-02-18T11:20:00Z',
    updatedAt: '2026-06-18T11:20:00Z',
    membersCount: 5,
    memberCount: 5,
    contactPerson: {
      name: 'Kavita Krishnan',
      email: 'kavita.k@zenithtraining.in',
      phone: '+91 95432 10987',
    },
    ownerName: 'Kavita Krishnan',
    ownerEmail: 'kavita.k@zenithtraining.in',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Zenith&backgroundColor=f59e0b',
    website: 'https://zenithtraining.in',
    notes: []
  },
  {
    id: 'org_5',
    name: 'Gurukul EdTech',
    slug: 'gurukul-edu',
    status: 'ACTIVE',
    planId: 'plan_free',
    createdAt: '2026-03-05T09:00:00Z',
    updatedAt: '2026-03-05T09:00:00Z',
    membersCount: 1,
    memberCount: 1,
    contactPerson: {
      name: 'Rajesh Kumar',
      email: 'rajesh@gurukuledu.org',
      phone: '+91 98123 45678',
    },
    ownerName: 'Rajesh Kumar',
    ownerEmail: 'rajesh@gurukuledu.org',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Gurukul&backgroundColor=10b981',
    website: 'https://gurukuledu.org',
    notes: [
      {
        id: 'note_5_1',
        authorName: 'Support Bot',
        body: 'Welcomed Rajesh to free tier plan. Automatically sent boarding checklist.',
        createdAt: '2026-03-05T09:05:00Z',
        tags: ['Onboarding']
      }
    ]
  },
  {
    id: 'org_6',
    name: 'Alpha Coding Leagues',
    slug: 'alpha-leagues',
    status: 'SUSPENDED',
    planId: 'plan_starter',
    createdAt: '2025-10-20T16:00:00Z',
    updatedAt: '2026-05-12T14:30:00Z',
    membersCount: 3,
    memberCount: 3,
    contactPerson: {
      name: 'Divya Iyer',
      email: 'divya@alphaleagues.in',
      phone: '+91 88990 11223',
    },
    ownerName: 'Divya Iyer',
    ownerEmail: 'divya@alphaleagues.in',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Alpha&backgroundColor=ef4444',
    website: 'https://alphaleagues.in',
    suspendReason: 'Repeated copyright violations on premium coding questions.',
    suspendedAt: '2026-05-12T14:30:00Z',
    notes: [
      {
        id: 'note_6_1',
        authorName: 'Legal Desk',
        body: 'Received DMCA takedown request from Indian Coding Society regarding their Graph algorithms quiz. Issued permanent suspension warning.',
        createdAt: '2026-05-10T11:00:00Z',
        tags: ['Legal', 'Infringement']
      },
      {
        id: 'note_6_2',
        authorName: 'Super Admin',
        body: 'Suspended the organization after no compliance response was received within 48 hours.',
        createdAt: '2026-05-12T14:30:00Z',
        tags: ['Compliance', 'Lockdown']
      }
    ]
  },
  {
    id: 'org_7',
    name: 'Apex HR Solutions',
    slug: 'apex-hr',
    status: 'ACTIVE',
    planId: 'plan_starter',
    createdAt: '2026-04-12T13:10:00Z',
    updatedAt: '2026-06-12T13:10:00Z',
    membersCount: 3,
    memberCount: 3,
    contactPerson: {
      name: 'Vikram Singh',
      email: 'vikram.singh@apexhr.co.in',
      phone: '+91 94567 89012',
    },
    ownerName: 'Vikram Singh',
    ownerEmail: 'vikram.singh@apexhr.co.in',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=ApexHR&backgroundColor=8b5cf6',
    website: 'https://apexhr.co.in',
    notes: []
  },
  {
    id: 'org_8',
    name: 'Kochi Quiz Club',
    slug: 'kochi-qc',
    status: 'ACTIVE',
    planId: 'plan_free',
    createdAt: '2026-04-28T17:40:00Z',
    updatedAt: '2026-04-28T17:40:00Z',
    membersCount: 2,
    memberCount: 2,
    contactPerson: {
      name: 'Meera Nair',
      email: 'meera.nair@kochicrafts.org',
      phone: '+91 70123 45678',
    },
    ownerName: 'Meera Nair',
    ownerEmail: 'meera.nair@kochicrafts.org',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=KochiQC&backgroundColor=ec4899',
    website: 'https://kochicrafts.org',
    notes: []
  },
  {
    id: 'org_9',
    name: 'Incredible India Contests',
    slug: 'incredible-india',
    status: 'ACTIVE',
    planId: 'plan_enterprise',
    createdAt: '2025-11-01T06:30:00Z',
    updatedAt: '2026-06-01T06:30:00Z',
    membersCount: 5,
    memberCount: 5,
    contactPerson: {
      name: 'Suresh Joshi',
      email: 'suresh.joshi@incredibleindia.gov.in',
      phone: '+91 91234 56789',
    },
    ownerName: 'Suresh Joshi',
    ownerEmail: 'suresh.joshi@incredibleindia.gov.in',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=IncIndia&backgroundColor=f97316',
    website: 'https://incredibleindia.gov.in',
    notes: [
      {
        id: 'note_9_1',
        authorName: 'Support Executive',
        body: 'Custom branding domain "contests.incredibleindia.gov.in" successfully configured and mapped to our ingress server.',
        createdAt: '2026-02-15T15:00:00Z',
        tags: ['Domain', 'Enterprise']
      }
    ]
  },
  {
    id: 'org_10',
    name: 'Vibrant Schools Trust',
    slug: 'vibrant-schools',
    status: 'ACTIVE',
    planId: 'plan_pro',
    createdAt: '2026-05-10T10:00:00Z',
    updatedAt: '2026-06-10T10:00:00Z',
    membersCount: 4,
    memberCount: 4,
    contactPerson: {
      name: 'Ananya Rao',
      email: 'ananya@vibrantschools.edu.in',
      phone: '+91 89012 34567',
    },
    ownerName: 'Ananya Rao',
    ownerEmail: 'ananya@vibrantschools.edu.in',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Vibrant&backgroundColor=14b8a6',
    website: 'https://vibrantschools.edu.in',
    notes: []
  },
  {
    id: 'org_11',
    name: 'CodeKombat Sandbox',
    slug: 'codekombat',
    status: 'ACTIVE',
    planId: 'plan_pro',
    createdAt: '2026-02-01T15:15:00Z',
    updatedAt: '2026-06-01T15:15:00Z',
    membersCount: 3,
    memberCount: 3,
    contactPerson: {
      name: 'Rohan Das',
      email: 'rohan.das@codekombat.io',
      phone: '+91 99887 76655',
    },
    ownerName: 'Rohan Das',
    ownerEmail: 'rohan.das@codekombat.io',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=CodeKombat&backgroundColor=6366f1',
    website: 'https://codekombat.io',
    notes: []
  },
  {
    id: 'org_12',
    name: 'Delhi Pub Trivia',
    slug: 'delhi-pub-trivia',
    status: 'SUSPENDED',
    planId: 'plan_free',
    createdAt: '2026-03-25T19:30:00Z',
    updatedAt: '2026-06-01T11:00:00Z',
    membersCount: 2,
    memberCount: 2,
    contactPerson: {
      name: 'Aditya Verma',
      email: 'aditya.verma@delhipubtrivia.in',
      phone: '+91 77665 54433',
    },
    ownerName: 'Aditya Verma',
    ownerEmail: 'aditya.verma@delhipubtrivia.in',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=DelhiPT&backgroundColor=78716c',
    website: 'https://delhipubtrivia.in',
    suspendReason: 'Billing issue: Failure to verify company identity and repeated card declines.',
    suspendedAt: '2026-06-01T11:00:00Z',
    notes: [
      {
        id: 'note_12_1',
        authorName: 'Super Admin',
        body: 'Flagged for multiple spam listings for commercial bars without permission. Suspended until ID proof is furnished.',
        createdAt: '2026-06-01T11:00:00Z',
        tags: ['Abuse', 'Suspended']
      }
    ]
  },
  {
    id: 'org_13',
    name: 'Mind-Bending Hackers',
    slug: 'mb-hackers',
    status: 'ACTIVE',
    planId: 'plan_starter',
    createdAt: '2026-05-22T08:45:00Z',
    updatedAt: '2026-06-22T08:45:00Z',
    membersCount: 3,
    memberCount: 3,
    contactPerson: {
      name: 'Neha Deshmukh',
      email: 'neha.d@mbhackers.org',
      phone: '+91 81234 56789',
    },
    ownerName: 'Neha Deshmukh',
    ownerEmail: 'neha.d@mbhackers.org',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=MBHackers&backgroundColor=a855f7',
    website: 'https://mbhackers.org',
    notes: []
  },
];

const INITIAL_CONTESTS: Contest[] = [
  // org_1
  { id: 'c_1', organizationId: 'org_1', orgId: 'org_1', title: 'React 19 Hooks Championship', status: 'COMPLETED', startTime: '2025-11-25T14:00:00Z', scheduledAt: '2025-11-25T14:00:00Z', duration: 120, registrationFee: 199, currency: 'INR', participantCount: 1250, revenueCollected: 248750, createdAt: '2025-11-20T10:00:00Z' },
  { id: 'c_2', organizationId: 'org_1', orgId: 'org_1', title: 'Vite vs Webpack Speed Quiz', status: 'COMPLETED', startTime: '2025-12-15T15:00:00Z', scheduledAt: '2025-12-15T15:00:00Z', duration: 60, registrationFee: 0, currency: 'INR', participantCount: 840, revenueCollected: 0, createdAt: '2025-12-10T11:00:00Z' },
  { id: 'c_3', organizationId: 'org_1', orgId: 'org_1', title: 'Tailwind CSS v4 Advanced Trivia', status: 'LIVE', startTime: '2026-07-01T22:00:00Z', scheduledAt: '2026-07-01T22:00:00Z', duration: 90, registrationFee: 99, currency: 'INR', participantCount: 412, revenueCollected: 40788, createdAt: '2026-06-28T09:00:00Z' },
  { id: 'c_4', organizationId: 'org_1', orgId: 'org_1', title: 'TypeScript 5.8 Strict Mode Battle', status: 'RESULTS_OUT', startTime: '2026-06-25T16:00:00Z', scheduledAt: '2026-06-25T16:00:00Z', duration: 150, registrationFee: 299, currency: 'INR', participantCount: 1530, revenueCollected: 457470, createdAt: '2026-06-15T14:00:00Z' },
  { id: 'c_5', organizationId: 'org_1', orgId: 'org_1', title: 'Next.js 16 App Router Quiz', status: 'DRAFT', startTime: '2026-07-10T14:00:00Z', scheduledAt: '2026-07-10T14:00:00Z', duration: 60, registrationFee: 149, currency: 'INR', participantCount: 0, revenueCollected: 0, createdAt: '2026-06-30T10:00:00Z' },

  // org_2
  { id: 'c_6', organizationId: 'org_2', orgId: 'org_2', title: 'National Coding League: Qualifier 1', status: 'COMPLETED', startTime: '2025-12-12T10:00:00Z', scheduledAt: '2025-12-12T10:00:00Z', duration: 180, registrationFee: 499, currency: 'INR', participantCount: 2890, revenueCollected: 1442110, createdAt: '2025-12-05T09:00:00Z' },
  { id: 'c_7', organizationId: 'org_2', orgId: 'org_2', title: 'National Coding League: Qualifier 2', status: 'COMPLETED', startTime: '2026-01-12T10:00:00Z', scheduledAt: '2026-01-12T10:00:00Z', duration: 180, registrationFee: 499, currency: 'INR', participantCount: 3120, revenueCollected: 1556880, createdAt: '2026-01-05T09:00:00Z' },
  { id: 'c_8', organizationId: 'org_2', orgId: 'org_2', title: 'National Coding League: Grand Finale', status: 'EVALUATION', startTime: '2026-06-30T10:00:00Z', scheduledAt: '2026-06-30T10:00:00Z', duration: 240, registrationFee: 0, currency: 'INR', participantCount: 500, revenueCollected: 0, createdAt: '2026-02-05T09:00:00Z' },
  { id: 'c_9', organizationId: 'org_2', orgId: 'org_2', title: 'Dynamic Programming Master Cup', status: 'PUBLISHED', startTime: '2026-07-05T15:00:00Z', scheduledAt: '2026-07-05T15:00:00Z', duration: 120, registrationFee: 399, currency: 'INR', participantCount: 840, revenueCollected: 335160, createdAt: '2026-06-20T12:00:00Z' },

  // org_3
  { id: 'c_10', organizationId: 'org_3', orgId: 'org_3', title: 'General Trivia Super Night', status: 'COMPLETED', startTime: '2026-01-20T20:00:00Z', scheduledAt: '2026-01-20T20:00:00Z', duration: 90, registrationFee: 50, currency: 'INR', participantCount: 220, revenueCollected: 11000, createdAt: '2026-01-15T14:00:00Z' },
  { id: 'c_11', organizationId: 'org_3', orgId: 'org_3', title: 'Bollywood Movie Buff Quiz', status: 'CANCELLED', startTime: '2026-02-14T19:00:00Z', scheduledAt: '2026-02-14T19:00:00Z', duration: 60, registrationFee: 99, currency: 'INR', participantCount: 15, revenueCollected: 1485, createdAt: '2026-02-10T13:00:00Z' },
  { id: 'c_12', organizationId: 'org_3', orgId: 'org_3', title: 'IPL Cricket Fever Contest', status: 'PUBLISHED', startTime: '2026-07-03T18:00:00Z', scheduledAt: '2026-07-03T18:00:00Z', duration: 60, registrationFee: 150, currency: 'INR', participantCount: 450, revenueCollected: 67500, createdAt: '2026-06-25T11:00:00Z' },

  // org_4
  { id: 'c_13', organizationId: 'org_4', orgId: 'org_4', title: 'Q1 Corporate Ethics & Compliance', status: 'COMPLETED', startTime: '2026-02-28T09:00:00Z', scheduledAt: '2026-02-28T09:00:00Z', duration: 45, registrationFee: 0, currency: 'INR', participantCount: 185, revenueCollected: 0, createdAt: '2026-02-20T08:00:00Z' },
  { id: 'c_14', organizationId: 'org_4', orgId: 'org_4', title: 'Zenith Leadership Academy Exam', status: 'COMPLETED', startTime: '2026-03-20T09:00:00Z', scheduledAt: '2026-03-20T09:00:00Z', duration: 60, registrationFee: 0, currency: 'INR', participantCount: 95, revenueCollected: 0, createdAt: '2026-03-10T08:00:00Z' },
  { id: 'c_15', organizationId: 'org_4', orgId: 'org_4', title: 'Diversity & Inclusion Assessment', status: 'PUBLISHED', startTime: '2026-07-06T09:00:00Z', scheduledAt: '2026-07-06T09:00:00Z', duration: 45, registrationFee: 0, currency: 'INR', participantCount: 320, revenueCollected: 0, createdAt: '2026-06-15T08:00:00Z' },

  // org_5
  { id: 'c_16', organizationId: 'org_5', orgId: 'org_5', title: 'Class 10 CBSE Math Challenge', status: 'COMPLETED', startTime: '2026-03-15T10:00:00Z', scheduledAt: '2026-03-15T10:00:00Z', duration: 90, registrationFee: 0, currency: 'INR', participantCount: 85, revenueCollected: 0, createdAt: '2026-03-10T09:00:00Z' },
  { id: 'c_17', organizationId: 'org_5', orgId: 'org_5', title: 'CBSE Science Quiz: Light & Sound', status: 'DRAFT', startTime: '2026-07-15T10:00:00Z', scheduledAt: '2026-07-15T10:00:00Z', duration: 65, registrationFee: 0, currency: 'INR', participantCount: 0, revenueCollected: 0, createdAt: '2026-06-25T09:00:00Z' },

  // org_6
  { id: 'c_18', organizationId: 'org_6', orgId: 'org_6', title: 'Data Structures Grand Battle', status: 'COMPLETED', startTime: '2025-11-05T15:00:00Z', scheduledAt: '2025-11-05T15:00:00Z', duration: 120, registrationFee: 100, currency: 'INR', participantCount: 412, revenueCollected: 41200, createdAt: '2025-10-25T15:00:00Z' },
  { id: 'c_19', organizationId: 'org_6', orgId: 'org_6', title: 'Graph Algorithms Masterclass Quiz', status: 'COMPLETED', startTime: '2025-11-20T15:00:00Z', scheduledAt: '2025-11-20T15:00:00Z', duration: 120, registrationFee: 150, currency: 'INR', participantCount: 190, revenueCollected: 28500, createdAt: '2025-11-15T15:00:00Z' },

  // org_7
  { id: 'c_20', organizationId: 'org_7', orgId: 'org_7', title: 'Soft Skills Evaluation Quiz', status: 'COMPLETED', startTime: '2026-04-20T11:00:00Z', scheduledAt: '2026-04-20T11:00:00Z', duration: 40, registrationFee: 0, currency: 'INR', participantCount: 110, revenueCollected: 0, createdAt: '2026-04-15T10:00:00Z' },
  { id: 'c_21', organizationId: 'org_7', orgId: 'org_7', title: 'Sales Pitch Mastery Quiz', status: 'PUBLISHED', startTime: '2026-07-02T14:00:00Z', scheduledAt: '2026-07-02T14:00:00Z', duration: 60, registrationFee: 499, currency: 'INR', participantCount: 65, revenueCollected: 32435, createdAt: '2026-06-20T09:00:00Z' },

  // org_8
  { id: 'c_22', organizationId: 'org_8', orgId: 'org_8', title: 'Kerala History & Geography Trivia', status: 'COMPLETED', startTime: '2026-05-05T18:00:00Z', scheduledAt: '2026-05-05T18:00:00Z', duration: 60, registrationFee: 0, currency: 'INR', participantCount: 95, revenueCollected: 0, createdAt: '2026-05-01T15:00:00Z' },
  { id: 'c_23', organizationId: 'org_8', orgId: 'org_8', title: 'Monsoon Malayalam Literary Quiz', status: 'PUBLISHED', startTime: '2026-07-04T19:00:00Z', scheduledAt: '2026-07-04T19:00:00Z', duration: 45, registrationFee: 49, currency: 'INR', participantCount: 75, revenueCollected: 3675, createdAt: '2026-06-24T16:00:00Z' },

  // org_9
  { id: 'c_24', organizationId: 'org_9', orgId: 'org_9', title: 'Dekho Apna Desh National Quiz', status: 'COMPLETED', startTime: '2025-11-12T11:00:00Z', scheduledAt: '2025-11-12T11:00:00Z', duration: 90, registrationFee: 0, currency: 'INR', participantCount: 2850, revenueCollected: 0, createdAt: '2025-11-05T10:00:00Z' },
  { id: 'c_25', organizationId: 'org_9', orgId: 'org_9', title: 'Indian Freedom Struggle Memorial Quiz', status: 'COMPLETED', startTime: '2025-12-20T11:00:00Z', scheduledAt: '2025-12-20T11:00:00Z', duration: 120, registrationFee: 0, currency: 'INR', participantCount: 3120, revenueCollected: 0, createdAt: '2025-12-15T10:00:00Z' },
  { id: 'c_26', organizationId: 'org_9', orgId: 'org_9', title: 'Unity in Diversity National Trivia', status: 'PUBLISHED', startTime: '2026-07-15T11:00:00Z', scheduledAt: '2026-07-15T11:00:00Z', duration: 60, registrationFee: 20, currency: 'INR', participantCount: 1500, revenueCollected: 30000, createdAt: '2026-06-20T10:00:00Z' },

  // org_10
  { id: 'c_27', organizationId: 'org_10', orgId: 'org_10', title: 'Vibrant Science Olympiad Quiz 1', status: 'COMPLETED', startTime: '2026-05-20T10:00:00Z', scheduledAt: '2026-05-20T10:00:00Z', duration: 120, registrationFee: 250, currency: 'INR', participantCount: 520, revenueCollected: 130000, createdAt: '2026-05-12T09:00:00Z' },
  { id: 'c_28', organizationId: 'org_10', orgId: 'org_10', title: 'Vibrant Science Olympiad Quiz 2', status: 'PUBLISHED', startTime: '2026-07-08T10:00:00Z', scheduledAt: '2026-07-08T10:00:00Z', duration: 120, registrationFee: 250, currency: 'INR', participantCount: 650, revenueCollected: 162500, createdAt: '2026-06-18T09:00:00Z' },

  // org_11
  { id: 'c_29', organizationId: 'org_11', orgId: 'org_11', title: 'Weekly Kombat: Dynamic Layouts', status: 'COMPLETED', startTime: '2026-02-15T16:00:00Z', scheduledAt: '2026-02-15T16:00:00Z', duration: 180, registrationFee: 100, currency: 'INR', participantCount: 350, revenueCollected: 35000, createdAt: '2026-02-10T14:00:00Z' },
  { id: 'c_30', organizationId: 'org_11', orgId: 'org_11', title: 'Weekly Kombat: State Machines', status: 'PUBLISHED', startTime: '2026-07-04T16:00:00Z', scheduledAt: '2026-07-04T16:00:00Z', duration: 180, registrationFee: 100, currency: 'INR', participantCount: 280, revenueCollected: 28000, createdAt: '2026-06-25T14:00:00Z' },

  // org_12
  { id: 'c_31', organizationId: 'org_12', orgId: 'org_12', title: 'Hauz Khas Weekend Trivia Pub Crawl', status: 'COMPLETED', startTime: '2026-04-04T21:00:00Z', scheduledAt: '2026-04-04T21:00:00Z', duration: 90, registrationFee: 0, currency: 'INR', participantCount: 120, revenueCollected: 0, createdAt: '2026-03-28T19:00:00Z' },

  // org_13
  { id: 'c_32', organizationId: 'org_13', orgId: 'org_13', title: 'NodeJS Core & Event Loop Quiz', status: 'PUBLISHED', startTime: '2026-07-02T11:00:00Z', scheduledAt: '2026-07-02T11:00:00Z', duration: 60, registrationFee: 99, currency: 'INR', participantCount: 145, revenueCollected: 14355, createdAt: '2026-06-10T09:00:00Z' },
];

const INITIAL_BILLING_RECORDS: BillingRecord[] = [
  { id: 'b_1', orgId: 'org_1', planId: 'plan_pro', amountINR: 4999, status: 'PAID', paymentDate: '2026-06-15T11:00:00Z', transactionId: 'TXN_QB_1002341' },
  { id: 'b_2', orgId: 'org_1', planId: 'plan_pro', amountINR: 4999, status: 'PAID', paymentDate: '2026-05-15T11:00:00Z', transactionId: 'TXN_QB_1001290' },
  { id: 'b_3', orgId: 'org_2', planId: 'plan_enterprise', amountINR: 14999, status: 'PAID', paymentDate: '2026-06-01T09:00:00Z', transactionId: 'TXN_QB_2003841' },
  { id: 'b_4', orgId: 'org_2', planId: 'plan_enterprise', amountINR: 14999, status: 'PAID', paymentDate: '2026-05-01T09:00:00Z', transactionId: 'TXN_QB_2001712' },
  { id: 'b_5', orgId: 'org_3', planId: 'plan_starter', amountINR: 1999, status: 'PAID', paymentDate: '2026-06-10T14:45:00Z', transactionId: 'TXN_QB_3002319' },
  { id: 'b_6', orgId: 'org_4', planId: 'plan_pro', amountINR: 4999, status: 'PAID', paymentDate: '2026-06-18T11:20:00Z', transactionId: 'TXN_QB_4002391' },
  { id: 'b_7', orgId: 'org_6', planId: 'plan_starter', amountINR: 1999, status: 'FAILED', paymentDate: '2026-05-10T16:00:00Z', transactionId: 'TXN_QB_FAILED_601' },
  { id: 'b_8', orgId: 'org_7', planId: 'plan_starter', amountINR: 1999, status: 'PAID', paymentDate: '2026-06-12T13:10:00Z', transactionId: 'TXN_QB_7001928' },
  { id: 'b_9', orgId: 'org_9', planId: 'plan_enterprise', amountINR: 14999, status: 'PAID', paymentDate: '2026-06-01T06:30:00Z', transactionId: 'TXN_QB_9002841' },
  { id: 'b_10', orgId: 'org_10', planId: 'plan_pro', amountINR: 4999, status: 'PAID', paymentDate: '2026-06-10T10:00:00Z', transactionId: 'TXN_QB_1000928' },
  { id: 'b_11', orgId: 'org_11', planId: 'plan_pro', amountINR: 4999, status: 'PAID', paymentDate: '2026-06-01T15:15:00Z', transactionId: 'TXN_QB_1100234' },
  { id: 'b_12', orgId: 'org_12', planId: 'plan_free', amountINR: 0, status: 'PAID', paymentDate: '2026-03-25T19:30:00Z', transactionId: 'TXN_QB_FREE' },
  { id: 'b_13', orgId: 'org_13', planId: 'plan_starter', amountINR: 1999, status: 'PENDING', paymentDate: '2026-06-22T08:45:00Z', transactionId: 'TXN_QB_PEND_1301' },
];

const generateHistoricalAuditLogs = (): AuditLogEntry[] => {
  const logs: AuditLogEntry[] = [];
  const startDay = new Date('2026-04-01T00:00:00Z').getTime();
  const endDay = new Date('2026-07-01T22:00:00Z').getTime();
  const timeStep = (endDay - startDay) / 50;

  const actions = [
    { action: 'org.suspended', targetType: 'organization', targetId: 'org_6', targetLabel: 'Alpha Coding Leagues', metadata: { reason: 'Copyright infringement on test materials.', previousStatus: 'ACTIVE' } },
    { action: 'org.activated', targetType: 'organization', targetId: 'org_12', targetLabel: 'Delhi Pub Trivia', metadata: { previousStatus: 'SUSPENDED', activatedBy: 'Vikram Grover' } },
    { action: 'org.edited', targetType: 'organization', targetId: 'org_1', targetLabel: 'TechTutors Academy', metadata: { changes: { website: 'https://new-techtutors.in', name: 'TechTutors Academy' } } },
    { action: 'org.note_added', targetType: 'organization', targetId: 'org_3', targetLabel: 'General Trivia', metadata: { noteId: 'note_123', tags: ['Billing'] } },
    { action: 'plan.created', targetType: 'plan', targetId: 'plan_starter', targetLabel: 'Growth (Starter)', metadata: { price: 2999, billingCycle: 'monthly' } },
    { action: 'plan.updated', targetType: 'plan', targetId: 'plan_pro', targetLabel: 'Scale (Pro)', metadata: { previousPrice: 9500, newPrice: 9999 } },
    { action: 'org.plan_changed', targetType: 'organization', targetId: 'org_2', targetLabel: 'Newton Coding Bootcamp', metadata: { oldPlan: 'plan_pro', newPlan: 'plan_enterprise', trigger: 'Manual Upgrade' } },
    { action: 'override.added', targetType: 'organization', targetId: 'org_1', targetLabel: 'TechTutors Academy', metadata: { field: 'maxContestsPerCycle', value: 100, reason: 'Special contest event' } },
    { action: 'override.removed', targetType: 'organization', targetId: 'org_5', targetLabel: 'Elite CBSE Prep School', metadata: { field: 'maxOrgMembers', previousValue: 3 } },
    { action: 'payment.refunded', targetType: 'payment', targetId: 'pay_102', targetLabel: 'TXN_QB_3002319', metadata: { amount: 1999, currency: 'INR', reason: 'Double billing error resolved.' } },
    { action: 'org.impersonated', targetType: 'organization', targetId: 'org_4', targetLabel: 'Zenith Leadership Academy', metadata: { sessionDurationSeconds: 1200, targetAdmin: 'Sneha Gupta' } },
    { action: 'org.impersonation_ended', targetType: 'organization', targetId: 'org_4', targetLabel: 'Zenith Leadership Academy', metadata: { summary: 'Completed checking contest submission errors' } },
  ];

  const admins = [
    { name: 'Vikram Grover', role: 'SUPER_ADMIN' as const },
    { name: 'Karan Mehra', role: 'SUPPORT' as const },
    { name: 'Pooja Hegde', role: 'BILLING_ADMIN' as const },
  ];

  for (let i = 0; i < 50; i++) {
    const timestamp = new Date(startDay + i * timeStep + Math.random() * timeStep).toISOString();
    const actionObj = actions[i % actions.length];
    let admin = admins[Math.floor(Math.random() * admins.length)];
    if (admin.role === 'BILLING_ADMIN' && (actionObj.action.includes('impersonated') || actionObj.action.includes('suspended'))) {
      admin = admins[0];
    }
    if (admin.role === 'SUPPORT' && actionObj.action.includes('plan.')) {
      admin = admins[2];
    }

    logs.push({
      id: `log_hist_${i}`,
      actorAdminName: admin.name,
      actorAdminRole: admin.role,
      action: actionObj.action,
      targetType: actionObj.targetType as any,
      targetId: actionObj.targetId,
      targetLabel: actionObj.targetLabel,
      metadata: {
        ...actionObj.metadata,
        ipAddress: `192.168.1.${10 + (i % 88)}`,
        systemNote: `Demo historical entry #${i}`
      },
      createdAt: timestamp,
    });
  }

  return logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

const generateHistoricalPayments = (): Payment[] => {
  const payments: Payment[] = [];
  const startDay = new Date('2026-04-01T00:00:00Z').getTime();
  const endDay = new Date('2026-07-01T22:00:00Z').getTime();
  const timeStep = (endDay - startDay) / 30;

  const orgs = [
    { id: 'org_1', name: 'TechTutors Academy' },
    { id: 'org_2', name: 'Newton Coding Bootcamp' },
    { id: 'org_3', name: 'General Trivia' },
    { id: 'org_4', name: 'Zenith Leadership' },
    { id: 'org_5', name: 'Elite CBSE Prep School' },
    { id: 'org_7', name: 'Sales Pitch Academy' },
    { id: 'org_9', name: 'Vibrant Science Hub' },
    { id: 'org_10', name: 'CBSE Evaluations' },
  ];

  const contestTitles = [
    'National Coding League', 'Web Dev Championship', 'IPL Cricket Trivia', 'General Trivia Super Night',
    'CBSE Math Challenge', 'Sales Pitch Mastery', 'Unity in Diversity National Trivia', 'Science Olympiad Quiz'
  ];

  const participants = [
    'Aarav Sharma', 'Vivaan Gupta', 'Aditya Patel', 'Vihaan Kumar', 'Arjun Singh',
    'Sai Nair', 'Reyansh Iyer', 'Aanya Joshi', 'Diya Deshmukh', 'Pari Choudhury',
    'Ananya Reddy', 'Kiara Rao', 'Ira Verma', 'Avani Das', 'Vikram Sen'
  ];

  const statuses: ('PAID' | 'REFUNDED' | 'FAILED' | 'PENDING')[] = [
    'PAID', 'PAID', 'PAID', 'PAID', 'PAID', 'PAID', 'PAID',
    'REFUNDED', 'FAILED', 'PENDING'
  ];

  for (let i = 0; i < 30; i++) {
    const org = orgs[i % orgs.length];
    const contestTitle = contestTitles[i % contestTitles.length];
    const participantName = participants[i % participants.length];
    const amount = [99, 149, 199, 250, 399, 499][i % 6];
    const status = statuses[i % statuses.length];
    const provider = status === 'PAID' || status === 'REFUNDED' ? (i % 3 === 0 ? 'MANUAL' : 'RAZORPAY') : (i % 5 === 0 ? 'FREE' : 'RAZORPAY');
    const createdAt = new Date(startDay + i * timeStep + Math.random() * timeStep).toISOString();
    const paidAt = status === 'PAID' || status === 'REFUNDED' ? new Date(new Date(createdAt).getTime() + 120000).toISOString() : null;
    const refundedAt = status === 'REFUNDED' ? new Date(new Date(createdAt).getTime() + 86400000).toISOString() : null;
    const refundReason = status === 'REFUNDED' ? 'Double registration or participant cancellation' : null;

    payments.push({
      id: `pay_${100 + i}`,
      organizationId: org.id,
      organizationName: org.name,
      contestId: `c_${(i % 10) + 1}`,
      contestTitle,
      participantName,
      amount,
      currency: 'INR',
      status: status as any,
      provider: provider as any,
      paidAt,
      refundedAt,
      refundReason,
      createdAt,
    });
  }

  return payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

const INITIAL_AUDIT_LOGS: AuditLogEntry[] = generateHistoricalAuditLogs();
const INITIAL_PAYMENTS: Payment[] = generateHistoricalPayments();

// Helper to generate participants
const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Aanya', 'Diya', 'Pari', 'Ananya', 'Kiara', 'Ira', 'Avani', 'Vikram', 'Pooja', 'Abhishek', 'Megha', 'Kunal', 'Shreya'];
const LAST_NAMES = ['Sharma', 'Gupta', 'Patel', 'Kumar', 'Singh', 'Nair', 'Iyer', 'Joshi', 'Deshmukh', 'Choudhury', 'Reddy', 'Rao', 'Verma', 'Das', 'Sen', 'Bose', 'Menon', 'Pillai', 'Saxena', 'Trivedi'];
const PHONE_PREFIXES = ['+91 98765', '+91 87654', '+91 76543', '+91 99887', '+91 94567', '+91 70123', '+91 81234'];

const INITIAL_PARTICIPANTS: Participant[] = [];

// Seed 60 participants distributed across key contests (c_1, c_3, c_4, c_6, c_8, c_9, c_12)
const ACTIVE_CONTEST_IDS = ['c_1', 'c_3', 'c_4', 'c_6', 'c_8', 'c_9', 'c_12', 'c_20', 'c_21', 'c_27', 'c_32'];

let participantIdCounter = 1;
for (const contestId of ACTIVE_CONTEST_IDS) {
  const contest = INITIAL_CONTESTS.find(c => c.id === contestId);
  if (!contest) continue;
  
  // Seed 5 participants per contest
  for (let i = 0; i < 6; i++) {
    const fName = FIRST_NAMES[(participantIdCounter * 3) % FIRST_NAMES.length];
    const lName = LAST_NAMES[(participantIdCounter * 7) % LAST_NAMES.length];
    const email = `${fName.toLowerCase()}.${lName.toLowerCase()}@example.com`;
    const phone = `${PHONE_PREFIXES[participantIdCounter % PHONE_PREFIXES.length]} ${String(10000 + (participantIdCounter * 123) % 90000)}`;
    
    // determine payment status & amount
    let pStatus: Participant['paymentStatus'] = 'PAID';
    if (contest.registrationFee === 0) {
      pStatus = 'PAID'; // Free is always PAID/0
    } else {
      const pIdx = participantIdCounter % 10;
      if (pIdx === 8) pStatus = 'PENDING';
      else if (pIdx === 9) pStatus = 'FAILED';
      else if (pIdx === 0) pStatus = 'REFUNDED';
    }
    
    // participant quiz status
    let status: Participant['status'] = 'SUBMITTED';
    if (contest.status === 'LIVE') {
      status = 'IN_QUIZ';
    } else if (contest.status === 'PUBLISHED' || contest.status === 'REGISTRATION_CLOSED') {
      status = 'REGISTERED';
    } else if (contest.status === 'COMPLETED' || contest.status === 'RESULTS_OUT') {
      status = participantIdCounter % 8 === 0 ? 'ABSENT' : participantIdCounter % 12 === 0 ? 'DISQUALIFIED' : 'SUBMITTED';
    }
    
    INITIAL_PARTICIPANTS.push({
      id: `p_${participantIdCounter}`,
      organizationId: contest.organizationId,
      contestId: contest.id,
      firstName: fName,
      lastName: lName,
      email,
      phone,
      status,
      paymentStatus: pStatus,
      paymentAmount: pStatus === 'PAID' ? contest.registrationFee : 0,
      registeredAt: new Date(new Date(contest.createdAt).getTime() + (i * 4 * 3600 * 1000)).toISOString()
    });
    
    participantIdCounter++;
  }
}

const INITIAL_SUBSCRIPTIONS: OrganizationSubscription[] = [
  {
    id: 'sub_org_1',
    organizationId: 'org_1',
    planId: 'plan_pro',
    status: 'active',
    currentPeriodStart: '2026-06-15T00:00:00Z',
    currentPeriodEnd: '2026-07-15T00:00:00Z',
    overrides: [
      {
        id: 'ov_org_1_1',
        field: 'maxContestsPerCycle',
        value: 100,
        reason: 'Requested temporary increase for National Code Championship.',
        expiresAt: '2026-08-15T00:00:00Z',
        createdAt: '2026-06-16T12:00:00Z',
        createdByAdminName: 'Super Admin'
      }
    ]
  },
  { id: 'sub_org_2', organizationId: 'org_2', planId: 'plan_enterprise', status: 'active', currentPeriodStart: '2026-06-01T00:00:00Z', currentPeriodEnd: '2026-07-01T00:00:00Z', overrides: [] },
  {
    id: 'sub_org_3',
    organizationId: 'org_3',
    planId: 'plan_starter',
    status: 'active',
    currentPeriodStart: '2026-06-10T00:00:00Z',
    currentPeriodEnd: '2026-07-10T00:00:00Z',
    overrides: [
      {
        id: 'ov_org_3_1',
        field: 'maxParticipantsPerContest',
        value: 1500,
        reason: 'Hosting a massive IPL cricket fever trivia next week with expected high traffic.',
        expiresAt: '2026-07-10T00:00:00Z',
        createdAt: '2026-06-15T14:00:00Z',
        createdByAdminName: 'Billing Admin'
      }
    ]
  },
  { id: 'sub_org_4', organizationId: 'org_4', planId: 'plan_pro', status: 'active', currentPeriodStart: '2026-06-18T00:00:00Z', currentPeriodEnd: '2026-07-18T00:00:00Z', overrides: [] },
  {
    id: 'sub_org_5',
    organizationId: 'org_5',
    planId: 'plan_free',
    status: 'active',
    currentPeriodStart: '2026-06-05T00:00:00Z',
    currentPeriodEnd: '2026-07-05T00:00:00Z',
    overrides: [
      {
        id: 'ov_org_5_1',
        field: 'maxOrgMembers',
        value: 3,
        reason: 'Extra co-teachers needed for CBSE curriculum evaluations.',
        expiresAt: null,
        createdAt: '2026-06-05T09:10:00Z',
        createdByAdminName: 'Support Agent'
      }
    ]
  },
  { id: 'sub_org_6', organizationId: 'org_6', planId: 'plan_starter', status: 'past_due', currentPeriodStart: '2026-05-20T00:00:00Z', currentPeriodEnd: '2026-06-20T00:00:00Z', overrides: [] },
  { id: 'sub_org_7', organizationId: 'org_7', planId: 'plan_starter', status: 'active', currentPeriodStart: '2026-06-12T00:00:00Z', currentPeriodEnd: '2026-07-12T00:00:00Z', overrides: [] },
  { id: 'sub_org_8', organizationId: 'org_8', planId: 'plan_free', status: 'active', currentPeriodStart: '2026-06-28T00:00:00Z', currentPeriodEnd: '2026-07-28T00:00:00Z', overrides: [] },
  { id: 'sub_org_9', organizationId: 'org_9', planId: 'plan_enterprise', status: 'active', currentPeriodStart: '2026-06-01T00:00:00Z', currentPeriodEnd: '2026-07-01T00:00:00Z', overrides: [] },
  { id: 'sub_org_10', organizationId: 'org_10', planId: 'plan_pro', status: 'active', currentPeriodStart: '2026-06-10T00:00:00Z', currentPeriodEnd: '2026-07-10T00:00:00Z', overrides: [] },
  { id: 'sub_org_11', organizationId: 'org_11', planId: 'plan_pro', status: 'active', currentPeriodStart: '2026-06-01T00:00:00Z', currentPeriodEnd: '2026-07-01T00:00:00Z', overrides: [] },
  { id: 'sub_org_12', organizationId: 'org_12', planId: 'plan_free', status: 'cancelled', currentPeriodStart: '2026-05-25T00:00:00Z', currentPeriodEnd: '2026-06-25T00:00:00Z', overrides: [] },
  { id: 'sub_org_13', organizationId: 'org_13', planId: 'plan_starter', status: 'active', currentPeriodStart: '2026-06-22T00:00:00Z', currentPeriodEnd: '2026-07-22T00:00:00Z', overrides: [] },
];

const INITIAL_PLAN_CHANGE_HISTORY: PlanChangeEvent[] = [
  { id: 'pch_1', organizationId: 'org_1', fromPlanId: 'plan_starter', toPlanId: 'plan_pro', date: '2025-12-15T18:30:00Z', adminName: 'System Migration' },
  { id: 'pch_2', organizationId: 'org_1', fromPlanId: 'plan_free', toPlanId: 'plan_starter', date: '2025-11-15T10:30:00Z', adminName: 'Rahul Sharma (Checkout)' },
  { id: 'pch_3', organizationId: 'org_2', fromPlanId: 'plan_pro', toPlanId: 'plan_enterprise', date: '2026-01-15T10:00:00Z', adminName: 'Super Admin (Sales Force)' },
  { id: 'pch_4', organizationId: 'org_3', fromPlanId: 'plan_free', toPlanId: 'plan_starter', date: '2026-01-10T15:00:00Z', adminName: 'Amit Patel (Self Serve)' },
];

export const INITIAL_PRICING_CONFIG: PricingConfig = {
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
  updatedAt: '2026-06-15T12:00:00Z',
  updatedByAdminName: 'Rajesh Sharma',
};

export const INITIAL_CONTEST_BOOKINGS: ContestBooking[] = [
  {
    id: 'booking_1',
    status: 'quoted',
    organizationId: 'org_1',
    contestName: 'All India Coding Challenge 2026',
    durationMinutes: 120,
    questionCount: 40,
    participantCount: 2500,
    addOnsSelected: { proctoring: true, certificates: false, prioritySupport: true },
    pricingBreakdown: { baseFee: 5000, computeCost: 270, cacheCost: 150, questionCost: 400, addOnsCost: 5500, subtotal: 11320, margin: 3962, total: 15282 },
    desiredStartTime: '2026-07-15T10:00:00Z',
    quotedAt: '2026-06-20T11:00:00Z',
    paidAt: null, provisionedAt: null, cancelledAt: null,
    createdByAdminName: 'Rajesh Sharma',
  },
  {
    id: 'booking_2',
    status: 'paid',
    organizationId: null,
    organizationName: 'EduTech Academy Inc.',
    organizationEmail: 'billing@edutechacademy.com',
    contestName: 'Junior Science Quiz 2026',
    durationMinutes: 60, questionCount: 50, participantCount: 800,
    addOnsSelected: { proctoring: false, certificates: true, prioritySupport: false },
    pricingBreakdown: { baseFee: 5000, computeCost: 45, cacheCost: 150, questionCost: 500, addOnsCost: 1200, subtotal: 6895, margin: 2413.25, total: 9308.25 },
    desiredStartTime: '2026-07-18T14:00:00Z',
    quotedAt: '2026-06-21T09:30:00Z',
    paidAt: '2026-06-22T10:15:00Z', provisionedAt: null, cancelledAt: null,
    createdByAdminName: 'Amit Patel',
    paymentMethod: 'Razorpay', paymentReference: 'pay_JSQ2026_XYZ',
  },
  {
    id: 'booking_3',
    status: 'provisioned',
    organizationId: 'org_2',
    contestName: 'Corporate Tech Trivia Night',
    durationMinutes: 45, questionCount: 30, participantCount: 500,
    addOnsSelected: { proctoring: false, certificates: false, prioritySupport: false },
    pricingBreakdown: { baseFee: 5000, computeCost: 45, cacheCost: 150, questionCost: 300, addOnsCost: 0, subtotal: 5495, margin: 1923.25, total: 7418.25 },
    desiredStartTime: '2026-07-05T19:30:00Z',
    quotedAt: '2026-06-22T14:00:00Z',
    paidAt: '2026-06-22T14:45:00Z', provisionedAt: '2026-06-23T08:00:00Z', cancelledAt: null,
    createdByAdminName: 'Rajesh Sharma',
    paymentMethod: 'Bank Transfer', paymentReference: 'TXN-BANK-192837',
  },
  {
    id: 'booking_4',
    status: 'completed',
    organizationId: 'org_3',
    contestName: 'IIT JEE Prep Grand Mock',
    durationMinutes: 180, questionCount: 90, participantCount: 12000,
    addOnsSelected: { proctoring: true, certificates: true, prioritySupport: true },
    pricingBreakdown: { baseFee: 5000, computeCost: 1620, cacheCost: 150, questionCost: 900, addOnsCost: 23500, subtotal: 31170, margin: 10909.5, total: 42079.5 },
    desiredStartTime: '2026-06-25T09:00:00Z',
    quotedAt: '2026-06-10T16:00:00Z',
    paidAt: '2026-06-11T11:00:00Z', provisionedAt: '2026-06-24T15:00:00Z', cancelledAt: null,
    createdByAdminName: 'Neha Deshmukh',
    paymentMethod: 'Manual Ledger', paymentReference: 'M-JEE-2026-01',
  },
  {
    id: 'booking_5',
    status: 'cancelled',
    organizationId: null,
    organizationName: 'Global Hackathon Group',
    organizationEmail: 'contact@globalhack.org',
    contestName: 'Summer Hack Trivia 2026',
    durationMinutes: 60, questionCount: 25, participantCount: 300,
    addOnsSelected: { proctoring: false, certificates: false, prioritySupport: true },
    pricingBreakdown: { baseFee: 5000, computeCost: 45, cacheCost: 150, questionCost: 250, addOnsCost: 2000, subtotal: 7445, margin: 2605.75, total: 10050.75 },
    desiredStartTime: '2026-07-20T17:00:00Z',
    quotedAt: '2026-06-12T10:00:00Z',
    paidAt: null, provisionedAt: null, cancelledAt: '2026-06-15T09:12:00Z',
    createdByAdminName: 'Amit Patel',
    cancellationReason: 'Customer budget constraints - decided to defer event to Winter',
  },
  {
    id: 'booking_6',
    status: 'quoted',
    organizationId: null,
    organizationName: 'DPS New Delhi School',
    organizationEmail: 'exams@dpsnd.edu.in',
    contestName: 'Annual Inter-School GK Clash',
    durationMinutes: 90, questionCount: 60, participantCount: 1500,
    addOnsSelected: { proctoring: true, certificates: true, prioritySupport: false },
    pricingBreakdown: { baseFee: 5000, computeCost: 180, cacheCost: 150, questionCost: 600, addOnsCost: 5750, subtotal: 11680, margin: 4088, total: 15768 },
    desiredStartTime: '2026-08-05T10:30:00Z',
    quotedAt: '2026-06-28T15:20:00Z',
    paidAt: null, provisionedAt: null, cancelledAt: null,
    createdByAdminName: 'Neha Deshmukh',
  },
  {
    id: 'booking_7',
    status: 'provisioned',
    organizationId: 'org_1',
    contestName: 'Quick Practice Series - Round 1',
    durationMinutes: 30, questionCount: 15, participantCount: 150,
    addOnsSelected: { proctoring: false, certificates: false, prioritySupport: false },
    pricingBreakdown: { baseFee: 5000, computeCost: 45, cacheCost: 150, questionCost: 150, addOnsCost: 0, subtotal: 5345, margin: 1870.75, total: 7215.75 },
    desiredStartTime: '2026-07-03T11:00:00Z',
    quotedAt: '2026-06-29T10:00:00Z',
    paidAt: '2026-06-29T10:10:00Z', provisionedAt: '2026-06-30T16:00:00Z', cancelledAt: null,
    createdByAdminName: 'Rajesh Sharma',
    paymentMethod: 'Credit Card (Stripe)', paymentReference: 'ch_quick_practice_round1',
  },
];

export const INITIAL_INFRA_STATUS: InfraStatus = {
  mode: 'idle',
  modeChangedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
  activeAsgInstanceCount: 2,
  minAsgInstanceCount: 2,
  maxAsgInstanceCount: 10,
  elastiCacheStatus: 'not_provisioned',
  currentLiveContestIds: [],
  estimatedMonthToDateCostUsd: 142.50,
  estimatedMonthToDateCostBreakdown: { permanentInfra: 120.00, ephemeralInfra: 22.50 },
};

export const INITIAL_SCALING_CONFIG: ScalingConfig = {
  instanceCount: 2,
  maxWsConnectionsPerInstance: 1000,
  redisClusterSize: 1,
  queueConcurrency: 20,
  workerInstances: 4,
  wsHeartbeatIntervalMs: 15000,
  quizSessionTtlSeconds: 7200,
  rateLimitWindowSeconds: 600,
  rateLimitMax: 100,
  otpRateLimit: 5,
};

export const INITIAL_FEATURE_FLAGS: FeatureFlag[] = [
  {
    id: 'flag_maintenance',
    key: 'maintenance_mode',
    label: 'Maintenance Mode',
    description: 'Activates maintenance window platform-wide. All live operations are suspended.',
    isEnabled: false,
    scope: 'global',
    updatedAt: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
    updatedByAdminName: 'System Auto-Config'
  },
  {
    id: 'flag_pause_reg',
    key: 'new_registrations_paused',
    label: 'Pause Registrations',
    description: 'Temporarily pause registration for new contest participants across the platform.',
    isEnabled: false,
    scope: 'global',
    updatedAt: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
    updatedByAdminName: 'System Auto-Config'
  },
  {
    id: 'flag_proctoring',
    key: 'proctoring_enabled_platform_wide',
    label: 'Platform-wide AI Proctoring',
    description: 'Enables AI proctoring services across all qualified organization contests.',
    isEnabled: true,
    scope: 'global',
    updatedAt: new Date(Date.now() - 10 * 86400 * 1000).toISOString(),
    updatedByAdminName: 'System Auto-Config'
  },
  {
    id: 'flag_cert_auto',
    key: 'certificate_auto_delivery',
    label: 'Certificate Auto-delivery',
    description: 'Automatically deliver signed PDF certificates to participants completing a contest.',
    isEnabled: true,
    scope: 'global',
    updatedAt: new Date(Date.now() - 8 * 86400 * 1000).toISOString(),
    updatedByAdminName: 'System Auto-Config'
  },
  {
    id: 'flag_analytics',
    key: 'enhanced_analytics_pipeline',
    label: 'Enhanced Analytics Pipeline',
    description: 'Streams raw candidate responses to the high-concurrency analytical engine.',
    isEnabled: true,
    scope: 'global',
    updatedAt: new Date(Date.now() - 15 * 86400 * 1000).toISOString(),
    updatedByAdminName: 'System Auto-Config'
  },
  {
    id: 'flag_razorpay',
    key: 'razorpay_gateway_active',
    label: 'Razorpay Payment Gateway',
    description: 'Accept live candidate registration payments via Razorpay merchant portal.',
    isEnabled: true,
    scope: 'global',
    updatedAt: new Date(Date.now() - 12 * 86400 * 1000).toISOString(),
    updatedByAdminName: 'System Auto-Config'
  },
];

export interface MockDatabase {
  plans: SubscriptionPlan[];
  organizations: Organization[];
  contests: Contest[];
  billing: BillingRecord[];
  auditLogs: AuditLogEntry[];
  payments: Payment[];
  participants: Participant[];
  subscriptions: OrganizationSubscription[];
  planChangeHistory: PlanChangeEvent[];
  pricingConfig: PricingConfig;
  contestBookings: ContestBooking[];
  infraStatus: InfraStatus;
  scalingConfig: ScalingConfig;
  featureFlags: FeatureFlag[];
}

const LOCAL_STORAGE_KEY = 'quizbuzz_super_admin_mock_db';

export function getDatabase(): MockDatabase {
  // SSR guard: return seed data on server side
  if (typeof window === 'undefined') {
    return {
      plans: INITIAL_PLANS,
      organizations: INITIAL_ORGANIZATIONS,
      contests: INITIAL_CONTESTS,
      billing: INITIAL_BILLING_RECORDS,
      auditLogs: INITIAL_AUDIT_LOGS,
      payments: INITIAL_PAYMENTS,
      participants: INITIAL_PARTICIPANTS,
      subscriptions: INITIAL_SUBSCRIPTIONS,
      planChangeHistory: INITIAL_PLAN_CHANGE_HISTORY,
      pricingConfig: INITIAL_PRICING_CONFIG,
      contestBookings: INITIAL_CONTEST_BOOKINGS,
      infraStatus: INITIAL_INFRA_STATUS,
      scalingConfig: INITIAL_SCALING_CONFIG,
      featureFlags: INITIAL_FEATURE_FLAGS,
    };
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Ensure all fields are initialized
      if (parsed.plans && parsed.organizations && parsed.contests && parsed.billing && parsed.auditLogs) {
        let mutated = false;

        if (!parsed.participants) { parsed.participants = INITIAL_PARTICIPANTS; mutated = true; }
        if (!parsed.subscriptions) { parsed.subscriptions = INITIAL_SUBSCRIPTIONS; mutated = true; }
        if (!parsed.planChangeHistory) { parsed.planChangeHistory = INITIAL_PLAN_CHANGE_HISTORY; mutated = true; }
        if (!parsed.pricingConfig) { parsed.pricingConfig = INITIAL_PRICING_CONFIG; mutated = true; }
        if (!parsed.contestBookings || parsed.contestBookings.length === 0) { parsed.contestBookings = INITIAL_CONTEST_BOOKINGS; mutated = true; }
        if (!parsed.infraStatus) { parsed.infraStatus = INITIAL_INFRA_STATUS; mutated = true; }
        if (!parsed.scalingConfig) { parsed.scalingConfig = INITIAL_SCALING_CONFIG; mutated = true; }
        if (!parsed.featureFlags || parsed.featureFlags.length === 0) { parsed.featureFlags = INITIAL_FEATURE_FLAGS; mutated = true; }
        if (!parsed.payments || parsed.payments.length === 0) { parsed.payments = INITIAL_PAYMENTS; mutated = true; }
        if (!parsed.auditLogs || parsed.auditLogs.length === 0 || !parsed.auditLogs[0].actorAdminName) { parsed.auditLogs = INITIAL_AUDIT_LOGS; mutated = true; }
        if (parsed.plans.length === 0 || !parsed.plans[0].limits) { parsed.plans = INITIAL_PLANS; mutated = true; }
        
        parsed.organizations = parsed.organizations.map((org: any) => {
          if (!org.notes) { org.notes = []; mutated = true; }
          if (!org.logoUrl) { org.logoUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(org.name)}`; mutated = true; }
          if (!org.website) { org.website = `https://${org.slug}.com`; mutated = true; }
          if (!org.ownerEmail) { org.ownerEmail = org.contactPerson?.email || ''; mutated = true; }
          if (!org.ownerName) { org.ownerName = org.contactPerson?.name || ''; mutated = true; }
          if (org.memberCount === undefined) { org.memberCount = org.membersCount || 1; mutated = true; }
          if (!org.updatedAt) { org.updatedAt = org.createdAt; mutated = true; }
          return org;
        });

        parsed.contests = parsed.contests.map((c: any) => {
          if (!c.organizationId) { c.organizationId = c.orgId; mutated = true; }
          if (!c.orgId) { c.orgId = c.organizationId; mutated = true; }
          if (!c.startTime) { c.startTime = c.scheduledAt || c.createdAt; mutated = true; }
          if (!c.scheduledAt) { c.scheduledAt = c.startTime; mutated = true; }
          if (c.duration === undefined) { c.duration = 60; mutated = true; }
          if (c.registrationFee === undefined) { c.registrationFee = 0; mutated = true; }
          if (c.currency === undefined) { c.currency = 'INR'; mutated = true; }
          if (c.revenueCollected === undefined) { c.revenueCollected = 0; mutated = true; }
          return c;
        });

        if (mutated) {
          saveDatabase(parsed);
        }
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse stored mock DB, fallback to seed', e);
    }
  }
  
  // Seed database and persist
  const db: MockDatabase = {
    plans: INITIAL_PLANS,
    organizations: INITIAL_ORGANIZATIONS,
    contests: INITIAL_CONTESTS,
    billing: INITIAL_BILLING_RECORDS,
    auditLogs: INITIAL_AUDIT_LOGS,
    payments: INITIAL_PAYMENTS,
    participants: INITIAL_PARTICIPANTS,
    subscriptions: INITIAL_SUBSCRIPTIONS,
    planChangeHistory: INITIAL_PLAN_CHANGE_HISTORY,
    pricingConfig: INITIAL_PRICING_CONFIG,
    contestBookings: INITIAL_CONTEST_BOOKINGS,
    infraStatus: INITIAL_INFRA_STATUS,
    scalingConfig: INITIAL_SCALING_CONFIG,
    featureFlags: INITIAL_FEATURE_FLAGS,
  };
  saveDatabase(db);
  return db;
}

export function saveDatabase(db: MockDatabase): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
}

export function resetDatabaseToSeed(): MockDatabase {
  const db: MockDatabase = {
    plans: INITIAL_PLANS,
    organizations: INITIAL_ORGANIZATIONS,
    contests: INITIAL_CONTESTS,
    billing: INITIAL_BILLING_RECORDS,
    auditLogs: INITIAL_AUDIT_LOGS,
    payments: INITIAL_PAYMENTS,
    participants: INITIAL_PARTICIPANTS,
    subscriptions: INITIAL_SUBSCRIPTIONS,
    planChangeHistory: INITIAL_PLAN_CHANGE_HISTORY,
    pricingConfig: INITIAL_PRICING_CONFIG,
    contestBookings: INITIAL_CONTEST_BOOKINGS,
    infraStatus: INITIAL_INFRA_STATUS,
    scalingConfig: INITIAL_SCALING_CONFIG,
    featureFlags: INITIAL_FEATURE_FLAGS,
  };
  if (typeof window !== 'undefined') {
    saveDatabase(db);
  }
  return db;
}
