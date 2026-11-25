// The only way to the log. The framework prints the errors it catches, and an
// error's message can quote what a visitor sent: a JSON parser's says "Unexpected
// token …" and then the body. So on a stage the console prints the class of such
// an error and nothing else; records (./observability.ts) use the real console.
import { env } from "./env";

const real = { info: console.info, error: console.error };

/** Writes a record: a line of allowlisted values. */
export function writeLine(line: string, severity: "INFO" | "ERROR") {
	if (severity === "ERROR") real.error.call(console, line);
	else real.info.call(console, line);
}

/** "SyntaxError", or "Error" for a name nobody expects. */
const className = (values: unknown[]) => {
	const error = values.find((value) => value instanceof Error);
	const name = error?.constructor.name ?? "";
	return /^[A-Za-z]{1,40}Error$/.test(name) ? name : "Error";
};

let quiet = false;
/** Called with every request, because bindings can be read only then. */
export function quietConsole() {
	if (quiet || env.APP_ENV === "local") return;
	quiet = true;
	const caught = (...values: unknown[]) =>
		writeLine(
			JSON.stringify({
				message: `caught ${className(values)}`,
				timestamp: new Date().toISOString(),
				severity: "ERROR",
				app: "civic-observatory-docket",
			}),
			"ERROR",
		);
	console.error = caught;
	console.warn = () => {};
	console.info = () => {};
	console.log = () => {};
	console.debug = () => {};
}
