# Running Log of AI Mistakes & Corrections

This log records real errors, mistaken initial assumptions, and edge cases encountered during development, along with how each was investigated and resolved.

---

### Mistake 1: Assuming Pricing Could Be Solved via Bare HTTP Fetch
- **Mistaken Assumption**: We initially tested whether we could solve the WebAssembly challenge in Node.js and fetch `/api/session` directly via HTTP `fetch` to keep the scraper lightweight without a browser.
- **What Actually Happened**: The server responded with `401 Unauthorized {"error":"unauthorized"}` because `/api/session` verifies client-side attestation (`att` object containing canvas fingerprint `ar()`, WebGL hardware renderer strings `or()`, frame rate profiling, and mouse movement physics).
- **The Fix**: Confirmed that a browser engine (Playwright) is genuinely required for both production and headed mode to execute the WebAssembly, canvas, WebGL, and mouse telemetry correctly.

---

### Mistake 2: Overlooking IP Rate Limiting on the Challenge API
- **Mistaken Assumption**: Assuming we could rapidly poll or reload challenge endpoints during recon and batch scraping without throttling.
- **What Actually Happened**: During the 20-reload recon test, request #13 immediately returned `HTTP 429 Too Many Requests`.
---

### Mistake 3: Negative Price Stripping in Parser Sanitization
- **Mistaken Assumption**: We ran `cleaned.replace(/[^\d.]/g, '')` to sanitize price characters.
- **What Actually Happened**: Stripping all non-digits inadvertently stripped leading minus signs, so negative test inputs like `-₹500` were transformed into positive `500` and passed validation.
- **The Fix**: Preserved negative sign detection (`const isNegative = rawString.includes('-')`) and immediately rejected non-positive numbers before stripping.

---

### Mistake 4: Missing ETIMEDOUT in Error Classifier
- **Mistaken Assumption**: Assuming `msg.includes('timeout') || msg.includes('timed out')` would catch Node.js socket timeout `ETIMEDOUT`.
- **What Actually Happened**: `etimedout` contains `timedout` (no space), so it slipped through to the default `http_error` branch.
- **The Fix**: Added `etimedout` and `timedout` to the timeout regex in `retry.ts`.

---

### Mistake 5: Trap Decoy Element `<span class="price-value" style="display:none">`
- **Mistaken Assumption**: We looked for `.price-value` as the selector for the current price.
- **What Actually Happened**: The mock store deliberately injects a hidden decoy `<span class="price-value" style="display:none">₹12,462</span>` to trick scrapers! When stripped because of `display:none`, our parser fell back to the whole container, concatenating MRP (`₹15,911`), deal price (`₹12,968`), selling price (`₹10,024`), discount (`37% off`), and stock into one giant number `159111296810024370000`.
---

### Mistake 6: TypeScript Type Assertion Inside Browser Evaluation String
- **Mistaken Assumption**: We included `(stockItem as HTMLElement).innerText` inside `DOM_CLEAN_PRICE_SCRIPT`.
- **What Actually Happened**: `DOM_CLEAN_PRICE_SCRIPT` is passed as a string to `page.evaluate()` which executes in the browser's native JavaScript engine. The browser threw `SyntaxError: Unexpected identifier 'as'`.
- **The Fix**: Removed TypeScript syntax inside browser string templates, using vanilla JavaScript property access `(f && f.innerText)`.

---

### Mistake 7: CLI Placeholder Name Triggering False Identity Mismatch
- **Mistaken Assumption**: In `headed.ts`, we defaulted `name: \`Product \${id}\`` when invoking the scraper.
- **What Actually Happened**: The strict validator compared `"Product 748"` with the real page title `"Meridian Gaming Monitor X"` and legitimately rejected it as a product identity mismatch (`structure_changed`).
- **The Fix**: In `headed.ts`, we first query the store's `/api/product/:id` metadata to get the authentic product name (or pass `undefined` if not known), allowing the validator to match against the real expected title.

---

### Mistake 8: Hardcoding Guessed Product Names in Concurrency Benchmark
- **Mistaken Assumption**: When setting up the 30-iteration unattended benchmark, we assumed ID `549` corresponded to "Aero Wireless Keyboard" and `812` to "Nexus Studio Headphones".
- **What Actually Happened**: When Playwright fetched the pages, ID 549 was actually "Larkspur Sous-Vide Wand Two" and ID 812 was "Summit Cloudbook XL". The strict validator caught the discrepancy immediately and aborted with `[structure_changed] Product identity mismatch`, refusing to write any rows to `price_history`.
- **The Fix**: Dynamically queried `/api/catalog` from the mock store in the test harness so that the product list and expected names are guaranteed to match the live catalog.



