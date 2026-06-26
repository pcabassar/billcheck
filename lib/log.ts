// Redacted server-side error logging (U12 hardening).
//
// PRIVACY RULE: bill amounts, document contents, message bodies, CPT/codes, names — NONE of these
// belong in logs or any third-party error tracker (MHMDA / consumer-health hygiene). User-supplied
// content tends to ride inside `error.message`, so we DO NOT log the message — only a stable scope
// tag, the error's class name, and a TRUNCATED stack (frames are code locations, not user data).
//
// Usage (route/tool catch blocks):
//   try { ... } catch (err) { logError('chat:onError', err); return genericResponse }

// How many characters of the stack to keep — enough to locate the failing frame, short enough that
// no large model/error payload can ride along in a wrapped stack string.
const MAX_STACK = 1000

/**
 * Log a redacted server-side error line. Never logs the error MESSAGE (it can contain a bill
 * amount, a document detail, or an echoed model error) — only `scope`, the error name, and a
 * truncated stack. Safe to call with anything (non-Error values log just their type).
 */
export function logError(scope: string, err: unknown): void {
  if (err instanceof Error) {
    const name = err.name || 'Error'
    const stack = typeof err.stack === 'string' ? err.stack.slice(0, MAX_STACK) : '(no stack)'
    // The stack already begins with "<name>: <message>" — strip that first line so the message
    // never appears, then keep the remaining frames (code locations only).
    const frames = stack.split('\n').slice(1).join('\n')
    console.error(`[${scope}] ${name} (message redacted)\n${frames}`)
  } else {
    console.error(`[${scope}] non-error thrown: ${typeof err} (value redacted)`)
  }
}
