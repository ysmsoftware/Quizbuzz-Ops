/**
 * Read-only quiz mode for the ops contest list, from the main app's Contest.quizSettings JSON
 * (Quizbuzz-new backend/src/modules/contest/quiz-settings.ts). Missing or odd values fall back
 * to today's defaults: an exam, one attempt.
 */
export type QuizPreset = 'EXAM' | 'PRACTICE' | 'QUIZ' | 'CUSTOM';

export interface QuizMode {
  preset: QuizPreset;
  /** null = unlimited. */
  maxAttempts: number | null;
  sectionCount: number;
}

const PRESETS: QuizPreset[] = ['EXAM', 'PRACTICE', 'QUIZ', 'CUSTOM'];

export function quizModeOf(settings: unknown, sectionCount: number | null): QuizMode {
  const s = (settings && typeof settings === 'object' ? settings : {}) as { preset?: unknown; attempts?: { max?: unknown } };
  const preset = PRESETS.includes(s.preset as QuizPreset) ? (s.preset as QuizPreset) : 'EXAM';
  const max = s.attempts && typeof s.attempts === 'object' ? s.attempts.max : undefined;
  return {
    preset,
    maxAttempts: max === null ? null : typeof max === 'number' ? max : 1,
    sectionCount: sectionCount ?? 0,
  };
}
