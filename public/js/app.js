/* Kalyana Biodata – browser app.
 * All personal details stay in the browser. Only a few non-identifying fields
 * are sent to /api/generate when the customer clicks "Write with AI".
 */
(() => {
  "use strict";

  const SHEET_W = 794; // A4 at 96 dpi
  const SHEET_H = 1120; // a few px under A4 height so the PDF never spills to page 2
  const STORE_KEY = "kb_form_v1";
  const UNLOCK_KEY = "kb_unlock_v1";
  const AI_LIMIT = 10; // AI calls (write + convert) per browser session
  // Text answers that "Convert" may change. Phone, dates and dropdowns are never sent.
  const CONVERT_KEYS = [
    "invocation", "fullName", "pob", "height", "motherTongue", "religion", "community",
    "rasi", "nakshatram", "lagnam", "gothram", "dosham",
    "education", "occupation", "company", "income", "workLocation",
    "fatherName", "fatherOccupation", "motherName", "motherOccupation", "siblings", "nativePlace",
    "about", "expectations", "contactPerson", "address",
  ];

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const form = $("#form");
  const sheet = $("#sheet");
  const statusEl = $("#status");
  const payBtn = $("#payBtn");

  const state = {
    uiLang: "en",
    photo: "",
    config: { priceRupees: 50, paymentsEnabled: false, freeMode: false, aiEnabled: false },
    aiCount: 0,
    busy: false,
    undo: null,
  };

  // ---------- storage (sessionStorage only: safe on shared/browsing-centre computers) ----------
  const store = {
    get(k) {
      try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch { return null; }
    },
    set(k, v) {
      try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ }
    },
    del(k) {
      try { sessionStorage.removeItem(k); } catch { /* ignore */ }
    },
  };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const t = (key) => (UI_TEXT[state.uiLang][key] ?? UI_TEXT.en[key] ?? key).replace("{price}", state.config.priceRupees);

  // ---------- build form sections from SCHEMA ----------
  function buildSections() {
    const wrap = $("#sections");
    wrap.innerHTML = "";
    for (const sec of SCHEMA) {
      const fs = document.createElement("fieldset");
      fs.className = "card";
      fs.dataset.sec = sec.id;
      fs.innerHTML = `<legend data-i18n="sec_${sec.id}"></legend>`;
      const grid = document.createElement("div");
      grid.className = "grid2";
      if (sec.id === "about") {
        grid.className = "stack";
        grid.innerHTML = `
          <label><span data-i18n="notes"></span>
            <textarea name="notes" rows="2" maxlength="500" data-i18n-ph="notesPh"></textarea></label>
          <button type="button" id="aiBtn" class="ai-btn" data-i18n="aiBtn"></button>
          <label><span data-i18n="about"></span>
            <textarea name="about" rows="5" maxlength="1200"></textarea></label>`;
      }
      for (const f of sec.fields) {
        const label = document.createElement("label");
        if (f.type === "textarea") label.className = "span2";
        label.innerHTML = `<span data-field-label="${f.k}"></span>${fieldInput(f)}`;
        grid.appendChild(label);
      }
      fs.appendChild(grid);
      wrap.appendChild(fs);
    }
  }

  function fieldInput(f) {
    const req = f.required ? " required" : "";
    const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : "";
    if (f.type === "select") {
      const opts = f.options.map((o) => `<option value="${o}" data-opt="${o}"></option>`).join("");
      return `<select name="${f.k}"><option value=""></option>${opts}</select>`;
    }
    if (f.type === "textarea") return `<textarea name="${f.k}" rows="2" maxlength="400"${ph}></textarea>`;
    const type = f.type || "text";
    const list = f.list ? ` list="dl-${f.list}"` : "";
    return `<input name="${f.k}" type="${type}" maxlength="120"${list}${ph}${req} />`;
  }

  function buildDatalists() {
    $$("datalist").forEach((d) => d.remove());
    const lang = form.outLang.value;
    for (const [id, src] of [["rasi", RASI], ["stars", STARS]]) {
      const dl = document.createElement("datalist");
      dl.id = `dl-${id}`;
      dl.innerHTML = src[lang].map((v) => `<option value="${esc(v)}"></option>`).join("");
      document.body.appendChild(dl);
    }
  }

  // ---------- UI language ----------
  function applyUiLang(lang) {
    state.uiLang = lang;
    document.documentElement.lang = lang;
    document.body.classList.toggle("ui-ta", lang === "ta");
    $$("[data-ui-lang]").forEach((b) => b.classList.toggle("active", b.dataset.uiLang === lang));
    $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $$("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
    const idx = lang === "ta" ? 1 : 0;
    for (const sec of SCHEMA)
      for (const f of sec.fields) {
        const el = $(`[data-field-label="${f.k}"]`);
        if (el) el.textContent = f.l[idx] + (f.required ? " *" : "");
      }
    $$("[data-opt]").forEach((o) => (o.textContent = OUT_TEXT[lang][o.dataset.opt]));
    $("#brandName").textContent = lang === "ta" ? SITE.brandTa : SITE.brand;
    updatePayButton();
    updateConvertButton();
    store.set("kb_ui_lang", lang);
  }

  // ---------- read form ----------
  function readForm() {
    const d = Object.fromEntries(new FormData(form).entries());
    for (const k of Object.keys(d)) if (typeof d[k] === "string") d[k] = d[k].trim();
    delete d.photo;
    return d;
  }

  function ageFrom(dob) {
    if (!dob) return "";
    const b = new Date(dob);
    if (isNaN(b)) return "";
    const n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
    return a > 0 && a < 100 ? a : "";
  }
  const fmtDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("-") : v);
  function fmtTime(v) {
    const m = /^(\d{2}):(\d{2})/.exec(v || "");
    if (!m) return v;
    let h = +m[1];
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m[2]} ${ap}`;
  }

  // ---------- render biodata ----------
  function render() {
    const d = readForm();
    const lang = d.outLang || "ta";
    const O = OUT_TEXT[lang];
    const idx = lang === "ta" ? 1 : 0;
    const val = (f) => {
      let v = d[f.k];
      if (!v) return "";
      if (f.type === "select") return O[v] || v;
      if (f.k === "dob") {
        const a = ageFrom(v);
        return fmtDate(v) + (a ? ` (${O.age.replace("{n}", a)})` : "");
      }
      if (f.k === "tob") return fmtTime(v);
      return v;
    };
    const table = (sec) => {
      const rows = sec.fields
        .filter((f) => f.k !== "fullName" && val(f))
        .map((f) => `<tr><th>${esc(f.l[idx])}</th><td>${esc(val(f))}</td></tr>`)
        .join("");
      return rows ? `<section class="blk"><h2>${esc(O[sec.id])}</h2><table>${rows}</table></section>` : "";
    };
    const byId = Object.fromEntries(SCHEMA.map((s) => [s.id, s]));
    const tagline = [d.occupation, d.workLocation].filter(Boolean).join(" · ");
    const para = (title, text) =>
      text ? `<section class="blk wide"><h2>${esc(title)}</h2><p>${esc(text).replace(/\n/g, "<br>")}</p></section>` : "";

    sheet.className = `sheet tpl-${d.template || "traditional"} out-${lang}`;
    sheet.innerHTML = `
      <div class="deco deco-tl"></div><div class="deco deco-tr"></div>
      <div class="deco deco-bl"></div><div class="deco deco-br"></div>
      <div class="frame">
        ${d.invocation ? `<div class="invocation">${esc(d.invocation)}</div>` : ""}
        <div class="title">${esc(O.title)}</div>
        <div class="body">
          <div class="head">
            ${state.photo ? `<img class="photo" src="${state.photo}" alt="" />` : ""}
            <div class="name">${esc(d.fullName || (lang === "ta" ? "பெயர்" : "Name"))}</div>
            ${tagline ? `<div class="tagline">${esc(tagline)}</div>` : ""}
          </div>
          <div class="sections">
            ${para(O.about, d.about)}
            ${table(byId.personal)}
            ${table(byId.horoscope)}
            ${table(byId.career)}
            ${table(byId.family)}
            ${para(O.expectations, d.expectations)}
          </div>
          <div class="contact">${table(byId.contact)}</div>
        </div>
      </div>
      <div class="watermark" aria-hidden="true">${Array(40).fill(`<span>PREVIEW · ${esc(SITE.brand)}</span>`).join("")}</div>`;
    fitToPage(sheet);
    scalePreview();
    store.set(STORE_KEY, { ...d, photo: state.photo });
    updatePayButton();
  }

  /** Shrinks the font size until everything fits on one A4 page. */
  function fitToPage(el) {
    const boxes = [$(".frame", el), ...$$(".sections, .contact", el)];
    const overflowing = () => boxes.some((b) => b.scrollHeight > b.clientHeight + 1);
    let fs = 15;
    el.style.setProperty("--fs", fs + "px");
    while (overflowing() && fs > 10) {
      fs -= 0.5;
      el.style.setProperty("--fs", fs + "px");
    }
  }

  function scalePreview() {
    const wrap = $("#previewWrap");
    const scale = Math.min(1, wrap.clientWidth / SHEET_W);
    sheet.style.transform = `scale(${scale})`;
    wrap.style.height = SHEET_H * scale + "px";
  }

  // ---------- photo ----------
  function loadPhoto(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // Downscale to keep the PDF small; the photo never leaves the device.
      const max = 600;
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      state.photo = c.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(url);
      showThumb();
      render();
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }
  function showThumb() {
    const th = $("#photoThumb");
    th.hidden = !state.photo;
    $("#removePhoto").hidden = !state.photo;
    if (state.photo) th.src = state.photo;
  }

  // ---------- AI ----------
  async function writeWithAI() {
    if (state.aiCount >= AI_LIMIT) return setStatus(t("aiLimit"), "warn");
    const d = readForm();
    const btn = $("#aiBtn");
    btn.disabled = true;
    btn.textContent = t("aiWorking");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lang: d.outLang,
          perspective: d.perspective,
          // Only these fields are sent – no phone, address, photo, parents' names or horoscope.
          details: {
            firstName: (d.fullName || "").split(/\s+/)[0],
            gender: d.gender,
            age: String(ageFrom(d.dob) || ""),
            education: d.education,
            occupation: d.occupation,
            workLocation: d.workLocation,
            nativePlace: d.nativePlace,
            familyType: d.familyType,
            siblings: d.siblings,
            notes: d.notes,
          },
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || "AI error");
      state.aiCount++;
      store.set("kb_ai_count", state.aiCount);
      form.about.value = out.about;
      setStatus(out.ai ? t("aiDone") : t("aiFallback"), "ok");
      render();
    } catch (e) {
      setStatus(e.message, "err");
    } finally {
      btn.disabled = false;
      btn.textContent = t("aiBtn");
    }
  }

  // ---------- convert typed answers to the biodata language ----------
  function updateConvertButton() {
    const box = $("#convertBox");
    if (!box) return;
    box.hidden = !state.config.aiEnabled;
    $("#convertBtn").textContent = t(form.outLang.value === "ta" ? "convertTa" : "convertEn");
    $("#undoConvert").hidden = !state.undo;
  }

  async function convertAnswers() {
    if (state.aiCount >= AI_LIMIT) return setStatus(t("aiLimit"), "warn");
    const d = readForm();
    const fields = {};
    for (const k of CONVERT_KEYS) if (d[k]) fields[k] = d[k];
    if (!Object.keys(fields).length) return setStatus(t("convertEmpty"), "warn");

    const btn = $("#convertBtn");
    btn.disabled = true;
    btn.textContent = t("converting");
    setStatus(t("converting"));
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: d.outLang, fields }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || "Conversion failed");
      state.aiCount++;
      store.set("kb_ai_count", state.aiCount);
      const changed = Object.entries(out.fields || {}).filter(([k, v]) => form.elements[k] && form.elements[k].value !== v);
      if (!changed.length) {
        setStatus(t("convertNone"), "ok");
        return;
      }
      state.undo = {};
      for (const [k, v] of changed) {
        state.undo[k] = form.elements[k].value;
        form.elements[k].value = v;
      }
      setStatus(t("convertDone").replace("{n}", changed.length), "ok");
      render();
    } catch (e) {
      setStatus(e.message, "err");
    } finally {
      btn.disabled = false;
      updateConvertButton();
    }
  }

  function undoConvert() {
    if (!state.undo) return;
    for (const [k, v] of Object.entries(state.undo)) if (form.elements[k]) form.elements[k].value = v;
    state.undo = null;
    setStatus(t("undone"), "ok");
    render();
    updateConvertButton();
  }

  // ---------- payment & PDF ----------
  const nameKey = () => (form.fullName.value || "").trim().toLowerCase().replace(/\s+/g, " ");

  function currentUnlock() {
    const u = store.get(UNLOCK_KEY);
    if (!u || !u.token || u.name !== nameKey()) return null;
    const exp = Number(String(u.token).split(".")[1]);
    return exp > Date.now() ? u : null;
  }

  function updatePayButton() {
    if (!payBtn) return;
    const { freeMode, paymentsEnabled } = state.config;
    if (currentUnlock()) {
      payBtn.textContent = t("downloadBtn");
      payBtn.disabled = state.busy;
      $(".pay-box").classList.add("paid");
    } else if (freeMode) {
      payBtn.textContent = t("freeBtn");
      payBtn.disabled = state.busy;
      $(".pay-box").classList.remove("paid");
    } else {
      payBtn.textContent = t("payBtn");
      payBtn.disabled = state.busy || !paymentsEnabled;
      $(".pay-box").classList.remove("paid");
    }
  }

  function setStatus(msg, kind = "") {
    statusEl.textContent = msg || "";
    statusEl.className = `status ${kind}`;
  }

  async function onPayClick() {
    if (state.busy) return;
    if (!nameKey()) {
      setStatus(t("needName"), "warn");
      form.fullName.focus();
      return;
    }
    if (currentUnlock() || state.config.freeMode) return downloadPdf();
    if (!state.config.paymentsEnabled) return setStatus(t("payOff"), "warn");

    state.busy = true;
    updatePayButton();
    setStatus(t("paying"));
    try {
      const res = await fetch("/api/order", { method: "POST" });
      const order = await res.json().catch(() => ({}));
      if (!res.ok || !order.ok) throw new Error(order.error || "Order failed");
      await loadRazorpay();
      const d = readForm();
      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: SITE.brand,
        description: state.uiLang === "ta" ? "திருமண பயோடேட்டா PDF" : "Marriage biodata PDF",
        prefill: d.phone ? { contact: d.phone.replace(/[^\d+]/g, "") } : {},
        theme: { color: "#8b1e3f" },
        handler: (resp) => onPaid(resp),
        modal: {
          ondismiss: () => {
            state.busy = false;
            updatePayButton();
            setStatus(t("payFailed"), "warn");
          },
        },
      });
      rzp.on("payment.failed", () => setStatus(t("payFailed"), "err"));
      rzp.open();
    } catch (e) {
      state.busy = false;
      updatePayButton();
      setStatus(e.message, "err");
    }
  }

  async function onPaid(resp) {
    setStatus(t("verifying"));
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(resp),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || "Verification failed");
      store.set(UNLOCK_KEY, { token: out.unlockToken, name: nameKey(), paymentId: out.paymentId });
      state.busy = false;
      updatePayButton();
      await downloadPdf();
      setStatus(t("paidNote") + ` (ID: ${out.paymentId})`, "ok");
    } catch (e) {
      state.busy = false;
      updatePayButton();
      setStatus(`${e.message}. Payment ID: ${resp.razorpay_payment_id || "-"} – please contact support.`, "err");
    }
  }

  function loadRazorpay() {
    if (window.Razorpay) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load payment window. Check your internet."));
      document.head.appendChild(s);
    });
  }

  async function downloadPdf() {
    state.busy = true;
    updatePayButton();
    setStatus(t("making"));
    try {
      await document.fonts.ready;
      const clone = sheet.cloneNode(true);
      clone.querySelector(".watermark")?.remove();
      clone.style.transform = "none";
      const name = (form.fullName.value || "biodata").trim().replace(/[^\p{L}\p{M}\p{N}]+/gu, "_");
      await window
        .html2pdf()
        .set({
          margin: 0,
          filename: `${name}_biodata.pdf`,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", width: SHEET_W, height: SHEET_H, windowWidth: SHEET_W },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all"] },
        })
        .from(clone)
        .save();
      setStatus(currentUnlock() ? t("paidNote") : "", "ok");
    } catch (e) {
      console.error(e);
      setStatus("PDF error: " + e.message, "err");
    } finally {
      state.busy = false;
      updatePayButton();
    }
  }

  // ---------- restore & init ----------
  function restore() {
    const saved = store.get(STORE_KEY);
    if (!saved) return;
    for (const [k, v] of Object.entries(saved)) {
      if (k === "photo") continue;
      const el = form.elements[k];
      if (!el) continue;
      if (el instanceof RadioNodeList) {
        for (const r of el) r.checked = r.value === v;
      } else el.value = v;
    }
    state.photo = saved.photo || "";
    showThumb();
  }

  async function loadConfig() {
    try {
      const res = await fetch("/api/config");
      if (res.ok) Object.assign(state.config, await res.json());
    } catch { /* offline / static preview: keep defaults */ }
  }

  let timer;
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  };

  async function init() {
    buildSections();
    restore();
    state.aiCount = store.get("kb_ai_count") || 0;
    buildDatalists();
    applyUiLang(store.get("kb_ui_lang") || "en");
    $("#year").textContent = new Date().getFullYear();
    $$(".site-owner").forEach((el) => (el.textContent = SITE.brand));

    form.addEventListener("input", (e) => {
      if (e.target.name === "outLang") {
        buildDatalists();
        updateConvertButton();
      }
      debounced();
    });
    form.addEventListener("change", debounced);
    form.addEventListener("submit", (e) => e.preventDefault());
    $$("[data-ui-lang]").forEach((b) => b.addEventListener("click", () => applyUiLang(b.dataset.uiLang)));
    $("#photoInput").addEventListener("change", (e) => loadPhoto(e.target.files[0]));
    $("#removePhoto").addEventListener("click", () => {
      state.photo = "";
      $("#photoInput").value = "";
      showThumb();
      render();
    });
    $("#aiBtn").addEventListener("click", writeWithAI);
    $("#convertBtn").addEventListener("click", convertAnswers);
    $("#undoConvert").addEventListener("click", undoConvert);
    $("#clearBtn").addEventListener("click", () => {
      if (!confirm(t("clearConfirm"))) return;
      form.reset();
      state.photo = "";
      store.del(STORE_KEY);
      showThumb();
      render();
    });
    payBtn.addEventListener("click", onPayClick);
    window.addEventListener("resize", scalePreview);

    render();
    // Re-measure once web fonts are ready, so the one-page fit is accurate.
    document.fonts?.ready.then(render);
    await loadConfig();
    applyUiLang(state.uiLang);
  }

  init();
})();
