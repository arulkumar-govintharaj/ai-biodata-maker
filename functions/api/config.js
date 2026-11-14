import { json, paymentsConfigured, priceInPaise } from "../../src/lib.js";

// GET /api/config – public settings the browser needs. Never returns secrets.
export async function onRequestGet({ env }) {
  const payments = paymentsConfigured(env);
  return json({
    ok: true,
    priceRupees: priceInPaise(env) / 100,
    paymentsEnabled: payments,
    // Free downloads only when payments are NOT set up and the owner explicitly allows it (local testing).
    freeMode: !payments && env.ALLOW_FREE_DOWNLOAD === "true",
    aiEnabled: Boolean(env.ANTHROPIC_API_KEY),
  });
}
