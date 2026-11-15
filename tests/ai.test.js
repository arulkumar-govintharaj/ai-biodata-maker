import { test } from "node:test";
import assert from "node:assert/strict";
import { extractText, parseJsonObject, runAI, NoAIError } from "../src/ai.js";
import { onRequestPost as translate, needsConversion } from "../functions/api/translate.js";
import { onRequestPost as generate } from "../functions/api/generate.js";

const req = (path, body) =>
  new Request(`https://site.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://site.test" },
    body: JSON.stringify(body),
  });

const fakeAI = (reply, log = []) => ({
  async run(model, input) {
    log.push({ model, input });
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply(model, input) : reply;
  },
});

test("extractText handles Workers AI response shapes", () => {
  assert.equal(extractText({ response: "hi" }), "hi");
  assert.equal(extractText({ choices: [{ message: { content: "yo" } }] }), "yo");
  assert.equal(extractText({ response: "<think>hmm</think>answer" }), "answer");
  assert.equal(extractText({ response: { a: 1 } }), '{"a":1}');
  assert.equal(extractText(null), "");
});

test("parseJsonObject handles fences and chatter", () => {
  assert.deepEqual(parseJsonObject('Sure!\n```json\n{"a":"x"}\n```'), { a: "x" });
  assert.equal(parseJsonObject("no json"), null);
  assert.equal(parseJsonObject("[1,2]"), null);
});

test("runAI: no provider → NoAIError; falls back to second model", async () => {
  await assert.rejects(runAI({}, { system: "s", user: "u" }), NoAIError);
  const log = [];
  const ai = fakeAI((model) => {
    if (model.includes("gemma-4")) throw new Error("down");
    return { response: "ok" };
  }, log);
  assert.equal(await runAI({ AI: ai }, { system: "s", user: "u" }), "ok");
  assert.equal(log.length, 2);
});

test("needsConversion", () => {
  assert.equal(needsConversion("Eswari", "ta"), true);
  assert.equal(needsConversion("ஈஸ்வரி", "ta"), false);
  assert.equal(needsConversion("15 LPA", "ta"), false);
  assert.equal(needsConversion("B.E.", "ta"), false);
  assert.equal(needsConversion("ஈஸ்வரி", "en"), true);
  assert.equal(needsConversion("Chennai", "en"), false);
});

test("translate: sends only convertible fields, never phone/dob; returns converted values", async () => {
  const log = [];
  const ai = fakeAI(() => ({
    response: '```json\n{"fullName":"ஈஸ்வரி","fatherOccupation":"விவசாயி","evil":"x"}\n```',
  }), log);
  const res = await translate({
    request: req("/api/translate", {
      to: "ta",
      fields: { fullName: "Eswari", fatherOccupation: "Farmer", income: "15 LPA", phone: "9742736200", dob: "1995-06-15", motherName: "லட்சுமி" },
    }),
    env: { AI: ai },
  });
  const out = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(out.fields, { fullName: "ஈஸ்வரி", fatherOccupation: "விவசாயி" });
  const sent = log[0].input.messages[1].content;
  assert.doesNotMatch(sent, /9742736200|1995|LPA|லட்சுமி/);
});

test("translate: garbage AI output → 502; no AI → 503; all Tamil → nothing to do", async () => {
  let r = await translate({ request: req("/api/translate", { to: "ta", fields: { fullName: "Eswari" } }), env: { AI: fakeAI({ response: "sorry" }) } });
  assert.equal(r.status, 502);
  r = await translate({ request: req("/api/translate", { to: "ta", fields: { fullName: "Eswari" } }), env: {} });
  assert.equal(r.status, 503);
  r = await translate({ request: req("/api/translate", { to: "ta", fields: { fullName: "ஈஸ்வரி" } }), env: {} });
  assert.equal((await r.json()).converted, 0);
});

test("generate: uses AI when available, falls back when AI fails", async () => {
  const body = { lang: "ta", perspective: "family", details: { firstName: "Eswari", gender: "female", education: "MSc" } };
  let r = await generate({ request: req("/api/generate", body), env: { AI: fakeAI({ response: "எங்கள் மகள் ஈஸ்வரி…" }) } });
  let out = await r.json();
  assert.equal(out.ai, true);
  assert.match(out.about, /ஈஸ்வரி/);
  r = await generate({ request: req("/api/generate", body), env: { AI: fakeAI(new Error("quota")) } });
  out = await r.json();
  assert.equal(out.ai, false);
  assert.match(out.about, /எங்கள் மகள்/);
});

test("translate prompt keeps Tanglish as the same Tamil words", async () => {
  const log = [];
  await translate({
    request: req("/api/translate", { to: "ta", fields: { expectations: "Nalla varan vendum", fatherOccupation: "Vivasayam" } }),
    env: { AI: fakeAI({ response: '{"expectations":"நல்ல வரன் வேண்டும்","fatherOccupation":"விவசாயம்"}' }, log) },
  });
  const system = log[0].input.messages[0].content;
  assert.match(system, /Nalla varan vendum → நல்ல வரன் வேண்டும்/);
  assert.match(system, /Vivasayam → விவசாயம்/);
  assert.match(system, /Do NOT translate it/);
});
