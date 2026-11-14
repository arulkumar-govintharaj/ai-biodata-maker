// Fills owner/contact placeholders on policy pages from site-config.js
document.querySelectorAll("[data-site]").forEach((el) => {
  el.textContent = window.SITE[el.dataset.site] || "";
});
