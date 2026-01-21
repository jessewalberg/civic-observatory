export const RATE_LIMITS = {
  FREE_DAILY: 3,
  ANONYMOUS_DAILY: 2,
} as const;

export const INPUT_LIMITS = {
  MIN_TRANSCRIPT_LENGTH: 100,
  MAX_TRANSCRIPT_LENGTH: 50000,
} as const;
