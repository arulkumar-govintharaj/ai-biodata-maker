import {
  HttpError,
  checkOrigin,
  errorJson,
  json,
  paymentsConfigured,
  priceInPaise,
} from "../../src/lib.js";

// POST /api/order – creates a Razorpay order. The amount is fixed on the server,
// so a customer cannot change the price from the browser.
export async function onRequestPost({ request, env }) {
  try {
    checkOrigin(request);
    if (!paymentsConfigured(env)) return errorJson("Payments are not configured yet.", 503);

    const amount = priceInPaise(env);
    const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt: `bd_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        notes: { product: "marriage-biodata-pdf" },
      }),
    });

    if (!res.ok) {
      console.error("Razorpay order failed", res.status, await res.text());
      return errorJson("Could not start payment. Please try again.", 502);
    }
    const order = await res.json();
    return json({
      ok: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: env.RAZORPAY_KEY_ID, // public key id – safe to share
    });
  } catch (err) {
    if (err instanceof HttpError) return errorJson(err.message, err.status);
    console.error(err);
    return errorJson("Server error", 500);
  }
}
