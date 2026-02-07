/**
 * Helper types and utilities for optimistic UI updates.
 *
 * Convex handles optimistic updates through its real-time sync system.
 * This file provides patterns for implementing client-side optimistic UI
 * that works in conjunction with Convex's automatic data synchronization.
 */

/**
 * Create an optimistic state manager for a specific action.
 * Use this when you want to show immediate feedback before mutation completes.
 *
 * @example
 * const [optimisticValue, setOptimistic, clear] = useOptimisticState<number>(null)
 *
 * const handleAction = async () => {
 *   setOptimistic(0) // Immediately show 0
 *   try {
 *     await mutation()
 *   } catch {
 *     clear() // Revert on error
 *   }
 * }
 */
export function createOptimisticHandler<T>(initialValue: T | null = null) {
	let value = initialValue;

	return {
		get: () => value,
		set: (newValue: T) => {
			value = newValue;
		},
		clear: () => {
			value = null;
		},
		isOptimistic: () => value !== null,
	};
}

/**
 * Type for optimistic update configuration
 */
export interface OptimisticUpdateConfig<TData, TOptimistic> {
	/** The real data from the server */
	data: TData | undefined;
	/** The optimistic value to use while mutation is in flight */
	optimisticValue: TOptimistic | null;
	/** Whether to prefer the optimistic value over real data */
	preferOptimistic: boolean;
}

/**
 * Get the display value, preferring optimistic data when available
 */
export function getOptimisticValue<T>(
	realValue: T,
	optimisticValue: T | null,
): T {
	return optimisticValue ?? realValue;
}
