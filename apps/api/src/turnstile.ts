import type { ApiContext } from "./routes/route-contract";

export type TurnstileErrorResponse = (context: ApiContext, status: 403 | 422 | 503, code: string, message: string) => Response;
export type TurnstileGuard = (context: ApiContext) => Promise<Response | undefined>;

// Unauthenticated write endpoints are protected by Cloudflare Turnstile (#468). The guard is
// fail-closed: a missing secret, an unreachable verifier, or a rejected token all refuse the
// request before any D1 write.
export const createTurnstileGuard = (errorResponse: TurnstileErrorResponse): TurnstileGuard => async (c) => {
  const secret = c.env.TURNSTILE_SECRET_KEY;
  if (!secret) return errorResponse(c, 503, "TURNSTILE_UNAVAILABLE", "Human verification is not configured");
  const token = c.req.header("cf-turnstile-response");
  if (!token) return errorResponse(c, 422, "TURNSTILE_TOKEN_REQUIRED", "Complete the human verification challenge");
  let outcome: { success?: boolean };
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return errorResponse(c, 503, "TURNSTILE_UNAVAILABLE", "Human verification cannot be completed");
    outcome = await response.json() as { success?: boolean };
  } catch {
    return errorResponse(c, 503, "TURNSTILE_UNAVAILABLE", "Human verification cannot be completed");
  }
  return outcome.success ? undefined : errorResponse(c, 403, "TURNSTILE_VERIFICATION_FAILED", "Human verification did not pass");
};
