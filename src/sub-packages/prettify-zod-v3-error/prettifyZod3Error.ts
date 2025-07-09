import { ZodError, type ZodIssue, ZodIssueCode } from 'zod';



/**
 * Formats a ZodError into a neat, human-readable summary of issues,
 * matching the format `path: message`.
 * 
 * Note that Zod v4 has prettifyError, which should replace this. 
 *
 * @param error The ZodError instance to format.
 * @returns An string of formatted errors
 */
export function prettifyZod3Error(error: ZodError): string {
    return prettifyZod3ErrorAsArray(error).join("\n");
}

/**
 * Formats a ZodError into a neat, human-readable summary of issues,
 * matching the format `path: message`.
 * 
 *
 * @param error The ZodError instance to format.
 * @returns An array of formatted error strings.
 */
export function prettifyZod3ErrorAsArray(error: ZodError): string[] {
    return prettifyZod3ErrorAsJson(error).map(e => {
        const {path, message} = e;

        // For root-level errors, the path is empty.
        if (path) {
            return `✖ ${message}\n  → at ${path}`;
        }
        return `✖ ${message}`;
    })
}


/**
 * Formats a ZodError into a neat, human-readable summary of issues,
 * formatted in JSON
 * 
 *
 * @param error The ZodError instance to format.
 * @returns An array of formatted error message and path
 */
export function prettifyZod3ErrorAsJson(error: ZodError): {message:string, path?: string}[] {
    return error.issues.map(issue => {
        const path = formatPath(issue.path);
        const message = getIssueMessage(issue);

        return {message, path};
    });
}



/**
 * Formats a Zod path array into a dot-notation string.
 * @example formatPath(['user', 'name']) // 'user.name'
 * @example formatPath(['items', 0, 'name']) // 'items[0].name'
 */
function formatPath(path: (string | number)[]): string {
    if (path.length === 0) {
        return '';
    }
    let result = String(path[0]);
    for (let i = 1; i < path.length; i++) {
        const segment = path[i];
        if (typeof segment === 'number') {
            result += `[${segment}]`;
        } else {
            result += `.${segment}`;
        }
    }
    return result;
}

/**
 * Creates a user-friendly message for a given Zod issue.
 */
function getIssueMessage(issue: ZodIssue): string {
    switch (issue.code) {
        case ZodIssueCode.invalid_type:
            return `Expected ${issue.expected}, received ${issue.received}`;
        case ZodIssueCode.unrecognized_keys:
            // This casting is safe based on the issue code
            const keys = (issue as { keys: string[] }).keys;
            return `Unrecognized key(s) in object: '${keys.join("', '")}'`;
        default:
            return issue.message;
    }
}
