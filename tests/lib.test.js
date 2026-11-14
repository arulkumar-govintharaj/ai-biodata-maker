import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyRazorpaySignature, safeEqual, clip, priceInPaise } from "../src/lib.js";
import { fallbackAbout } from "../functions/api/generate.js";

const secret = "test_secret_123";
const sign = (o, p) => createHmac("sha256", secret).update(`${o}|${p}`).digest("hex");

test("accepts a genuine Razorpay signature", async () => {
  assert.equal(await verifyRazorpaySignature(secret, "order_A", "pay_B", sign("order_A", "pay_B")), true);
});

test("rejects tampered order, payment or signature", async () => {
  const good = sign("order_A", "pay_B");
  assert.equal(await verifyRazorpaySignature(secret, "order_X", "pay_B", good), false);
  assert.equal(await verifyRazorpaySignature(secret, "order_A", "pay_X", good), false);
  const flipped = (good[0] === "a" ? "b" : "a") + good.slice(1);
  assert.equal(await verifyRazorpaySignature(secret, "order_A", "pay_B", flipped), false);
  assert.equal(await verifyRazorpaySignature(secret, "order_A", "pay_B", ""), false);
  assert.equal(await verifyRazorpaySignature("wrong", "order_A", "pay_B", good), false);
});

test("safeEqual", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "ab"), false);
});

test("clip trims and limits", () => {
  assert.equal(clip("  a   b  ", 10), "a b");
  assert.equal(clip("x".repeat(50), 5), "xxxxx");
  assert.equal(clip(undefined, 5), "");
});

test("price defaults to ₹50 and ignores bad values", () => {
  assert.equal(priceInPaise({}), 5000);
  assert.equal(priceInPaise({ PRICE_PAISE: "9900" }), 9900);
  assert.equal(priceInPaise({ PRICE_PAISE: "abc" }), 5000);
  assert.equal(priceInPaise({ PRICE_PAISE: "10" }), 5000);
});

test("fallback about text in both languages", () => {
  const d = { firstName: "Priya", gender: "female", education: "B.E.", occupation: "Engineer", workLocation: "Chennai", notes: "" };
  assert.match(fallbackAbout(d, "en", "family"), /Our daughter Priya/);
  assert.match(fallbackAbout(d, "en", "self"), /Hello, I am Priya/);
  assert.match(fallbackAbout(d, "ta", "family"), /எங்கள் மகள் Priya/);
  assert.doesNotMatch(fallbackAbout({ ...d, firstName: "" }, "ta", "self"), / \./);
});
