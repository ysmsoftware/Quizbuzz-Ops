/**
 * The institution-mode feature flags, in roll-out order (portal first: institution mode and
 * gradebook need it). Single source for chips, filters and adoption counts, on both sides.
 */
export const INSTITUTION_FLAGS = [
  { key: 'window_contests', label: 'Window contests', short: 'Windows' },
  { key: 'question_pools', label: 'Question sets & pools', short: 'Pools' },
  { key: 'participant_portal', label: 'Participant portal', short: 'Portal' },
  { key: 'institution_mode', label: 'Institution mode (groups)', short: 'Groups' },
  { key: 'gradebook', label: 'Gradebook', short: 'Gradebook' },
] as const;

export type InstitutionFlagKey = (typeof INSTITUTION_FLAGS)[number]['key'];
export const INSTITUTION_FLAG_KEYS = INSTITUTION_FLAGS.map((f) => f.key) as unknown as [InstitutionFlagKey, ...InstitutionFlagKey[]];

export const institutionFlagShort = (key: string): string => INSTITUTION_FLAGS.find((f) => f.key === key)?.short ?? key;
