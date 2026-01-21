export const ROLES = {
  USER: "user",
  PRO: "pro",
  ADMIN: "admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<Role, number> = {
  [ROLES.USER]: 0,
  [ROLES.PRO]: 1,
  [ROLES.ADMIN]: 2,
};
