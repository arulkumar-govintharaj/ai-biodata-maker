# Kalyana Biodata – AI Marriage Biodata Maker

Single-page website where families create a **marriage biodata PDF in Tamil or English**.
AI writes the introduction paragraph, the customer pays **₹50 via Razorpay**, and the clean PDF downloads instantly.

- **Hosting:** Cloudflare Pages (static site) + Pages Functions (tiny backend), free tier
- **Payments:** Razorpay (UPI, cards, wallets)
- **AI:** Anthropic Claude (Haiku), under ₹1 per biodata
- **Privacy:** biodata details, photo and PDF stay in the customer's browser. Nothing is stored on a server.

## Features

- Tamil / English website UI, and Tamil / English biodata output
- 3 designs: Traditional, Floral, Modern
- Photo upload (resized in the browser), blessing line, Rasi / Star suggestions
- "Write with AI" introduction, in first person (self) or third person (parents)
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
  generate.js           POST /api/generate – AI introduction (fallback text if no key)
  order.js              POST /api/order    – creates Razorpay order (price fixed on server)
  verify.js             POST /api/verify   – verifies Razorpay signature
src/lib.js              Shared helpers (HMAC verify, JSON, validation)
tests/                  Unit tests (node --test)
scripts/vendor.sh       Refreshes public/vendor from node_modules
wrangler.toml           Cloudflare config (price, AI model)
```

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars   # add keys, or set ALLOW_FREE_DOWNLOAD=true to test without Razorpay
npm run dev                      # http://localhost:8788
npm test
```

Without `ANTHROPIC_API_KEY`, "Write with AI" adds a simple template paragraph instead.
Without Razorpay keys, the pay button stays disabled, unless `ALLOW_FREE_DOWNLOAD=true`. Use that only locally.

## Deploy to Cloudflare Pages (free)

1. Push this folder to a **private GitHub repo**.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `public`
3. **Settings → Variables and Secrets**. Add these as **Secrets** (encrypted):
   - `ANTHROPIC_API_KEY`: from console.anthropic.com
   - `RAZORPAY_KEY_ID`: starts with `rzp_test_` first, then `rzp_live_` later
   - `RAZORPAY_KEY_SECRET`
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
| AI introduction | < ₹1 per biodata |
| Razorpay | ≈ 2% + GST per payment (≈ ₹1.20 on ₹50) |
| Custom domain (optional) | ≈ ₹800–1,500 per year |

Check current pricing for each service, as it changes.

## Known limitations / next steps

- **The PDF is generated in the browser**, so a technically skilled user could bypass the paywall using browser dev tools. This is acceptable for a ₹50 product. To make it stronger, generate the clean PDF on the server after verification.
- **Protect the AI endpoint from abuse** before heavy promotion. Add Cloudflare Turnstile, or a Cloudflare rate-limiting rule on `/api/generate`, and set a monthly spend limit in the Anthropic console.
- Add a **Razorpay webhook** (`payment.captured`) if you want a server-side record of every sale.
- Ideas: more designs, more languages (Telugu, Kannada, Malayalam, Hindi), a WhatsApp share button, and a jathagam chart image.

## Legal note

The policy pages are a starting template, not legal advice. Review them, and GST registration needs, with a CA or lawyer before going live.
