#!/usr/bin/env bash
# Copies third-party browser assets from node_modules into public/vendor
# so the live site never depends on an external CDN.
set -euo pipefail
cd "$(dirname "$0")/.."
cp node_modules/html2pdf.js/dist/html2pdf.bundle.min.js public/vendor/
for f in noto-sans-tamil-{tamil,latin}-{400,700}-normal.woff2; do cp "node_modules/@fontsource/noto-sans-tamil/files/$f" public/vendor/fonts/; done
for f in noto-serif-tamil-{tamil,latin}-{400,700}-normal.woff2; do cp "node_modules/@fontsource/noto-serif-tamil/files/$f" public/vendor/fonts/; done
for f in poppins-latin-{400,600}-normal.woff2; do cp "node_modules/@fontsource/poppins/files/$f" public/vendor/fonts/; done
echo "Vendored assets updated."
