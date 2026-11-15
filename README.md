# Kalyana Biodata – AI Marriage Biodata Maker

Single-page website where families create a **marriage biodata PDF in Tamil or English**.
AI writes the introduction paragraph, the customer pays **₹50 via Razorpay**, and the clean PDF downloads instantly.

- **Hosting:** Cloudflare Pages (static site) + Pages Functions (tiny backend), free tier
- **Payments:** Razorpay (UPI, cards, wallets)
- **AI:** Cloudflare Workers AI (Google Gemma 4), **free** daily allowance, no API key. Optionally switch to Anthropic Claude for better Tamil.
- **Privacy:** biodata details, photo and PDF stay in the customer's browser. Nothing is stored on a server.

## Features

- Tamil / English website UI, and Tamil / English biodata output
- 3 designs: Traditional, Floral, Modern
- Photo upload (resized in the browser), blessing line, Rasi / Star suggestions
- "Write with AI" introduction, in first person (self) or third person (parents)
- **"Convert to Tamil" / "Convert to English"** buttons at the end of the form: turn English or Tanglish answers into Tamil script (names transliterated, Tanglish written as the same Tamil words, English translated), or the reverse, with Undo. Phone and dates are never sent.
- Auto-fits all content onto one A4 page
- Watermarked preview → pay ₹50 → clean PDF
- After payment, the customer can re-download with small edits for 24 hours (same name only)
- Terms, Privacy, Refund and Contact pages, which Razorpay requires for KYC

## Project structure

```
public/                 Static site (deployed as-is)
  index.html            Builder page
  css/styles.css        Site styles + the 3 biodata designs
  js/app.js             Form, preview, AI call, payment, PDF
  js/i18n.js            Tamil/English text, form schema, Rasi/Star lists
  js/site-config.js     ✏️ Your brand + contact details (edit before going live)
  terms.html, privacy.html, refund.html, contact.html
  vendor/               html2pdf + Noto Tamil/Poppins fonts (self-hosted, no CDN)
  _headers              Security + caching headers
functions/api/          Cloudflare Pages Functions (backend)
  config.js             GET  /api/config   – price, whether payments/AI are on
  generate.js           POST /api/generate – AI introduction (fallback text if AI unavailable)
  translate.js          POST /api/translate – convert typed answers to Tamil/English
  order.js              POST /api/order    – creates Razorpay order (price fixed on server)
  verify.js             POST /api/verify   – verifies Razorpay signature
src/lib.js              Shared helpers (HMAC verify, JSON, validation)
src/ai.js               AI provider: Workers AI by default, Claude if ANTHROPIC_API_KEY is set
tests/                  Unit tests (node --test)
scripts/vendor.sh       Refreshes public/vendor from node_modules
wrangler.toml           Cloudflare config (price, AI model)
```

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars   # add keys if you have them
npm run dev                      # http://localhost:8788
npm test
```

Local dev note: the Workers AI binding (`[ai]` in `wrangler.toml`) always runs on Cloudflare, so `npm run dev` needs `npx wrangler login` first. Without AI, "Write with AI" adds a simple template paragraph and "Convert" is hidden.
**Without Razorpay keys, the PDF downloads free.** As soon as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are added (and the site redeployed), the button becomes "Pay ₹50 & Download PDF".

## Deploy to Cloudflare Pages (free)

1. Push this folder to a **private GitHub repo**.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `public`
3. **Settings → Variables and Secrets**. Add these as **Secrets** (encrypted):
   - `RAZORPAY_KEY_ID`: starts with `rzp_test_` first, then `rzp_live_` later
   - `RAZORPAY_KEY_SECRET`
   - *(optional)* `ANTHROPIC_API_KEY`: only if you want Claude instead of the free AI

   The free AI needs no key. `wrangler.toml` already connects it (`[ai] binding = "AI"`). If AI buttons don't work after deploying, check **Settings → Bindings** shows a Workers AI binding named `AI`, and add it there if missing.
4. Redeploy. The site is live at `https://<project>.pages.dev`. Every `git push` redeploys it automatically.

Or deploy from your machine: `npx wrangler login` then `npm run deploy`.

## Going live with Razorpay

1. Edit `public/js/site-config.js` with your real name/business, email, phone and address. These details appear on the policy pages.
2. Test the full flow with **test keys** (`rzp_test_…`). Razorpay test UPI/card details are in their docs.
3. Complete Razorpay KYC (PAN, bank account, Aadhaar, website URL). Some reviewers prefer a custom domain over `*.pages.dev`. Attach one in Cloudflare Pages → Custom domains if they ask.
4. In Razorpay Dashboard → Settings → **Payment capture: Automatic**.
5. Swap in the **live keys** as secrets and redeploy.

To change the price, set `PRICE_PAISE` in `wrangler.toml`, or as a variable in the dashboard. For example, `5000` = ₹50.

## Costs (approx.)

| Item | Cost |
|---|---|
| Cloudflare Pages + Functions | Free (Functions free tier ≈ 1 lakh requests/day) |
| AI (Workers AI, free tier) | 10,000 neurons/day free ≈ a few hundred biodatas/day (writing + converting). Above that, requests fail and the site falls back gracefully, or upgrade to Workers Paid ($5/month) |
| AI (Claude, optional) | < ₹1 per biodata |
| Razorpay | ≈ 2% + GST per payment (≈ ₹1.20 on ₹50) |
| Custom domain (optional) | ≈ ₹800–1,500 per year |

Check current pricing for each service, as it changes.

## Known limitations / next steps

- **The PDF is generated in the browser**, so a technically skilled user could bypass the paywall using browser dev tools. This is acceptable for a ₹50 product. To make it stronger, generate the clean PDF on the server after verification.
- **Protect the AI endpoints from abuse** before heavy promotion. Add Cloudflare Turnstile, or a rate-limiting rule on `/api/generate` and `/api/translate`, so bots can't use up the free daily AI allowance.
- **Check Tamil quality.** Open-source models can mis-spell rare names. Customers can edit every field, but if quality complaints come in, add `ANTHROPIC_API_KEY` to switch to Claude.
- Add a **Razorpay webhook** (`payment.captured`) if you want a server-side record of every sale.
- Ideas: more designs, more languages (Telugu, Kannada, Malayalam, Hindi), a WhatsApp share button, and a jathagam chart image.

## Legal note

The policy pages are a starting template, not legal advice. Review them, and GST registration needs, with a CA or lawyer before going live.
