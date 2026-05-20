// Returns a user-safe description for a thrown error.
//
// In production, Next.js scrubs server-action error messages and replaces them
// with a generic "An error occurred in the Server Components render..." note
// that exposes implementation details (server components, error digest, etc).
// We never want users to see that text — it's confusing AND leaky.
//
// Always log the raw error to the console so devs can still debug.
//
// For known-safe user errors (validation, demo-mode, business rules), pass
// `friendlyFallback` so the toast shows the right thing in prod where the real
// message has been scrubbed.

const NEXT_SCRUB_HINT = "An error occurred in the Server Components";

export function friendlyErrorMessage(
  err: unknown,
  friendlyFallback = "Something went wrong. Please try again.",
): string {
  if (typeof window !== "undefined") {
    console.error(err);
  }

  if (process.env.NODE_ENV !== "production" && err instanceof Error) {
    return err.message;
  }

  // Prod: if Next has scrubbed the message, show the friendly fallback.
  // If a non-scrubbed message came through (validation errors thrown from
  // client-side checks), preserve it.
  if (err instanceof Error) {
    const msg = err.message.trim();
    if (!msg) return friendlyFallback;
    if (msg.startsWith(NEXT_SCRUB_HINT)) return friendlyFallback;
    if (msg.includes("Server Components render")) return friendlyFallback;
    return msg;
  }

  return friendlyFallback;
}
