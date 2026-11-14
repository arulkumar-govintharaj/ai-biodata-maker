// Shared helpers for Cloudflare Pages Functions.
// Kept outside /functions so it is not exposed as a route.

export const DEFAULT_PRICE_PAISE = 5000; // ₹50
export const DEFAULT_AI_MODEL = "claude-haiku-5-5";

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

export function errorJson(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

/** Reads a JSON body, refusing anything larger than maxBytes. */
export async function readJson(request, maxBytes = 20_000) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > maxBytes) throw new HttpError(413, "Request too large");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Only allow same-origin browser calls to our API (basic CSRF / hotlink guard). */
export function checkOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return; // non-browser clients (curl) – still subject to other limits
  const self = new URL(request.url).origin;
  if (origin !== self) throw new HttpError(403, "Forbidden origin");
}

export function priceInPaise(env) {
  const p = Number(env.PRICE_PAISE || DEFAULT_PRICE_PAISE);
  return Number.isInteger(p) && p >= 100 ? p : DEFAULT_PRICE_PAISE;
}

export function paymentsConfigured(env) {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

const enc = new TextEncoder();

export async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two hex/ASCII strings. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Razorpay checkout signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export async function verifyRazorpaySignature(secret, orderId, paymentId, signature) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = await hmacSha256Hex(secret, `${orderId}|${paymentId}`);
  return safeEqual(expected, String(signature).toLowerCase());
}

export function clip(value, max) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}
