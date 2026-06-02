import { type ZodError, core, prettifyError } from 'zod';

/**
 * Renders a ZodError as a single human-readable, multi-line summary.
 * Why: surface validation failures in logs/UI without exposing raw Zod internals.
 *
 * Thin wrapper over Zod 4's native `prettifyError` (issues sorted by path, each shown
 * as `✖ {message}` + `→ at {path}`).
 *
 * @example
 * prettifyZodError(result.error);
 * // ✖ Invalid input: expected string, received number
 * //   → at user.name
 */
export function prettifyZodError(error: ZodError): string {
    return prettifyError(error);
}

/**
 * Renders a ZodError as one formatted string per issue.
 * Why: callers presenting issues individually (list rows, bullet points) need them un-joined.
 *
 * @example
 * prettifyZodErrorAsArray(result.error);
 * // ['✖ Invalid input: expected string, received number\n  → at user.name']
 */
export function prettifyZodErrorAsArray(error: ZodError): string[] {
    return prettifyZodErrorAsJson(error).map(({ message, path }) =>
        path ? `✖ ${message}\n  → at ${path}` : `✖ ${message}`,
    );
}

/**
 * Reduces a ZodError to a structured `{message, path}` array.
 * Why: machine-readable summary (e.g. attached to an Error `cause`) where each issue's
 * dotted/bracketed path pinpoints the offending field.
 *
 * @returns One entry per issue; `path` is the dot/bracket path via Zod's `toDotPath` (omitted for root issues).
 * @example
 * prettifyZodErrorAsJson(result.error);
 * // [{ message: 'Invalid input: expected string, received number', path: 'user.name' }]
 */
export function prettifyZodErrorAsJson(error: ZodError): { message: string, path?: string }[] {
    return error.issues.map(issue => ({
        message: issue.message,
        path: issue.path.length ? core.toDotPath(issue.path) : undefined,
    }));
}
