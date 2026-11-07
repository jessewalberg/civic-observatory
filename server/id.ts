import { z } from "zod";
export type Id<T extends string> = string & {
	readonly __entity: T;
};
export function entityId<T extends string>(entity: T): z.ZodType<Id<T>> {
	return z
		.string()
		.min(1)
		.max(128)
		.transform((value) => value as Id<T>)
		.meta({ entity });
}
