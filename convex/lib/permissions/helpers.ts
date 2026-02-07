import { ROLE_HIERARCHY, ROLES, type Role } from "./roles";

export function hasPermission(
	userRole: Role | undefined,
	requiredRole: Role,
): boolean {
	const userLevel = ROLE_HIERARCHY[userRole ?? ROLES.USER];
	const requiredLevel = ROLE_HIERARCHY[requiredRole];
	return userLevel >= requiredLevel;
}

export function isAdmin(role: Role | undefined): boolean {
	return role === ROLES.ADMIN;
}

export function isPro(role: Role | undefined): boolean {
	return role === ROLES.PRO || role === ROLES.ADMIN;
}

export function hasUnlimitedAccess(
	role: Role | undefined,
	tier?: string,
): boolean {
	return isPro(role) || tier === "pro";
}
