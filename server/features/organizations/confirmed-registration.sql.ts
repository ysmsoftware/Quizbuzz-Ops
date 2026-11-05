/**
 * A registration only counts once it holds a seat: PENDING_PAYMENT rows are checkouts that were
 * abandoned, failed or are still open. Same rule as the main app's CONFIRMED_REGISTRATION
 * (backend/src/common/confirmed-registration.ts). Use it for the participant numbers ops shows and
 * for plan seat usage. Support still sees the unpaid rows: registrationCountsSql for the numbers,
 * the org's participant register for the rows themselves.
 */
export const confirmedRegistrationSql = (participantAlias = 'participants'): string =>
  `${participantAlias}.status <> 'PENDING_PAYMENT'`;

const FAILED_PAYMENT = `pay.status IN ('FAILED', 'CANCELLED')`;

/**
 * Subquery returning RegistrationCounts for the participants matching `scope` (alias p).
 * Failed = unconfirmed and the last attempt failed or was cancelled; pending = any other unconfirmed
 * row. Same split as the main app's registrations tab, so total = confirmed + pending + failed.
 */
export const registrationCountsSql = (scope: string): string => `(
  SELECT json_build_object(
    'total', COUNT(*)::int,
    'confirmed', COUNT(*) FILTER (WHERE ${confirmedRegistrationSql('p')})::int,
    'pending', COUNT(*) FILTER (WHERE p.status = 'PENDING_PAYMENT' AND (pay.status IS NULL OR NOT ${FAILED_PAYMENT}))::int,
    'failed', COUNT(*) FILTER (WHERE p.status = 'PENDING_PAYMENT' AND ${FAILED_PAYMENT})::int
  )
  FROM participants p
  LEFT JOIN payments pay ON pay."participantId" = p.id
  WHERE ${scope}
)`;
