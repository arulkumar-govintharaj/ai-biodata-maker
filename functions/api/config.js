import { json, paymentsConfigured, priceInPaise } from "../../src/lib.js";
import { aiAvailable } from "../../src/ai.js";

// GET /api/config – public settings the browser needs. Never returns secrets.
export async function onRequestGet({ env }) {
  const payments = paymentsConfigured(env);
  return json({
    ok: true,
    priceRupees: priceInPaise(env) / 100,
    paymentsEnabled: payments,
    // Until Razorpay keys are added, the PDF downloads free. Adding the keys switches to "Pay & Download".
    freeMode: !payments,
    aiEnabled: aiAvailable(env),
  });
}
