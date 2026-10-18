/** Read-only picture of how an organization uses institution mode (from the main app's DB). */
export interface OrgInstitutionSummary {
  learners: {
    /** Every non-deleted contact. */
    contacts: number;
    activeLearners: number;
    alumni: number;
    /** Contacts allowed to log in to the learner portal. */
    portalEnabled: number;
    lastPortalLogin: string | null;
  };
  groups: {
    total: number;
    /** Deepest nesting level in use (1 = flat). */
    levels: number;
    /** Learners currently in at least one group. */
    learnersInGroups: number;
  };
  contests: {
    total: number;
    byTimingMode: { SCHEDULED: number; WINDOW: number };
    byAudience: { PUBLIC: number; PRIVATE_LINK: number; ASSIGNED: number };
    byQuestionSelection: { ALL: number; SETS: number; POOL: number };
    /** WINDOW contests that are LIVE right now. */
    liveWindow: number;
  };
  /** Participants of ASSIGNED contests, by status. */
  assigned: { total: number; byStatus: Record<string, number> };
  gradebook: {
    categories: number;
    terms: number;
    contestsIncluded: number;
    marksheets: { total: number; byStatus: Record<string, number> };
  };
}

export interface InstitutionPlatformStats {
  /** Organizations that effectively have each institution flag (grant active, global on). */
  orgsByFeature: Record<string, number>;
  activeLearners: number;
  portalEnabled: number;
  groups: number;
  windowContests: number;
  liveWindowContests: number;
}
