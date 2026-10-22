/**
 * Core User Roles for Spider Math Educational Platform
 * Enforces Role-Based Access Control (RBAC) across 5 distinct portals.
 */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT'
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export const VALID_ROLES: readonly UserRole[] = Object.values(ROLES);
