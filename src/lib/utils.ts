import { type ClassValue, clsx } from "clsx";
import {
	format,
	formatDistanceToNow,
	isThisYear,
	isToday,
	isYesterday,
} from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Format a timestamp as a readable date
 * @example formatDate(1705363200000) → "January 15, 2025"
 */
export function formatDate(timestamp: number): string {
	const date = new Date(timestamp);
	if (isThisYear(date)) {
		return format(date, "MMMM d");
	}
	return format(date, "MMMM d, yyyy");
}

/**
 * Format a timestamp as a relative date
 * @example formatRelativeDate(Date.now() - 3600000) → "1 hour ago"
 */
export function formatRelativeDate(timestamp: number): string {
	const date = new Date(timestamp);

	if (isToday(date)) {
		return formatDistanceToNow(date, { addSuffix: true });
	}

	if (isYesterday(date)) {
		return "yesterday";
	}

	return formatDistanceToNow(date, { addSuffix: true });
}
