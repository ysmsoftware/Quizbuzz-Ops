/**
 * Organization types (main app's OrgProfileType). The rules are a copy of
 * Quizbuzz-new/backend/src/common/org-profile-type.ts PROFILE_POLICY — keep the two in step.
 * Ops uses them to show what the main app does; ops' own checks (isFeatureEnabled) ignore types.
 */
export const ORG_PROFILE_TYPES = [
  { value: 'INDIVIDUAL', label: 'Individual organizer' },
  { value: 'COACHING', label: 'Coaching centre' },
  { value: 'EDUCATIONAL', label: 'School or college' },
  { value: 'COMPANY_HIRING', label: 'Company (hiring)' },
  { value: 'COMPANY_INTERNAL', label: 'Company (employee assessments)' },
] as const;

export type OrgProfileType = (typeof ORG_PROFILE_TYPES)[number]['value'];
export const ORG_PROFILE_TYPE_VALUES = ORG_PROFILE_TYPES.map((t) => t.value) as unknown as [OrgProfileType, ...OrgProfileType[]];

const INSTITUTION_PRESET = ['institution_mode', 'participant_portal', 'gradebook', 'window_contests', 'question_pools'];
const COMPANY_PRESET = ['participant_portal', 'window_contests', 'question_pools'];
// Employees are organised in teams, so groups too (decision D5).
const EMPLOYEE_PRESET = [...COMPANY_PRESET, 'institution_mode'];
const COMPANY_DENIED = ['razorpay_gateway_active', 'ambassador_program_enabled'];

/** OPT_IN flags the type turns on when the org has no override. */
export const TYPE_FLAG_PRESET: Record<OrgProfileType, readonly string[]> = {
  INDIVIDUAL: [],
  COACHING: INSTITUTION_PRESET,
  EDUCATIONAL: INSTITUTION_PRESET,
  COMPANY_HIRING: COMPANY_PRESET,
  COMPANY_INTERNAL: EMPLOYEE_PRESET,
};

/** Flags the type always turns off in the main app, whatever the override says. */
export const TYPE_DENIED_FLAGS: Record<OrgProfileType, readonly string[]> = {
  INDIVIDUAL: [],
  COACHING: [],
  EDUCATIONAL: [],
  COMPANY_HIRING: COMPANY_DENIED,
  COMPANY_INTERNAL: COMPANY_DENIED,
};

/** Label for a stored type; null = never set, which acts as Individual. */
export const orgTypeLabel = (type: OrgProfileType | null | undefined) =>
  type ? ORG_PROFILE_TYPES.find((t) => t.value === type)?.label ?? type : 'Not set';
