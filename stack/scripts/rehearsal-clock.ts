// check:load's: a machine whose clock is wrong by REHEARSAL_SKEW seconds. Preloaded
// before one of the operator's scripts; nothing else loads it.
const skew = Number(process.env.REHEARSAL_SKEW) * 1_000;
if (!Number.isFinite(skew)) throw new Error("REHEARSAL_SKEW is not a number.");
const Right = Date;
globalThis.Date = class extends Right {
	constructor(...from: unknown[]) {
		if (from.length === 0) super(Right.now() + skew);
		else super(...(from as [number]));
	}
	static override now() {
		return Right.now() + skew;
	}
} as DateConstructor;

export {};
