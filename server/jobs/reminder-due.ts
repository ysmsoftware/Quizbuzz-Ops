/** Picks the reminder a date has reached, from a list in descending order of days left. */
export function reminderDue(stages: number[], daysLeft: number, lastSent: number | null): number | null {
  const reached = stages.filter((stage) => daysLeft <= stage);
  const stage = reached.length ? reached[reached.length - 1] : null;
  return stage !== null && (lastSent === null || stage < lastSent) ? stage : null;
}
