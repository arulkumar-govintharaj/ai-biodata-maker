import {
  HttpError,
  checkOrigin,
  errorJson,
  hmacSha256Hex,
  json,
  paymentsConfigured,
  readJson,
  verifyRazorpaySignature,
} from "../../src/lib.js";

// POST /api/verify – checks the Razorpay payment signature with the secret key.
// Only a genuine payment for one of OUR orders produces a valid signature.
export async function onRequestPost({ request, env }) {
  try {
    checkOrigin(request);
    if (!paymentsConfigured(env)) return errorJson("Payments are not configured yet.", 503);

    const body = await readJson(request, 2_000);
    const orderId = String(body.razorpay_order_id || "");
    const paymentId = String(body.razorpay_payment_id || "");
    const signature = String(body.razorpay_signature || "");

    const valid = await verifyRazorpaySignature(env.RAZORPAY_KEY_SECRET, orderId, paymentId, signature);
    if (!valid) return errorJson("Payment could not be verified.", 400);

    // Unlock token valid for 24h; lets the customer re-download after small edits.
    const expires = Date.now() + 24 * 60 * 60 * 1000;
    const tokenSig = await hmacSha256Hex(env.RAZORPAY_KEY_SECRET, `unlock|${paymentId}|${expires}`);
    return json({ ok: true, paymentId, unlockToken: `${paymentId}.${expires}.${tokenSig}` });
  } catch (err) {
    if (err instanceof HttpError) return errorJson(err.message, err.status);
    console.error(err);
    return errorJson("Server error", 500);
  }
}
