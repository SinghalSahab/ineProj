# INE Store Reconnaissance Report (`https://demo.inelabteamdev.com/`)

## 1. Raw HTML vs Rendered DOM
- **Raw HTML (`curl -s https://demo.inelabteamdev.com/`)**:
  - Contains a minimal, empty single-page application shell:
    ```html
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>INE Store</title>
        <script type="module" crossorigin src="/assets/index-B9UiQq4X.js"></script>
        <link rel="stylesheet" crossorigin href="/assets/index-DrctpSuy.css">
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>
    ```
  - **Verdict**: Zero product data, catalogue listings, prices, or stock information exist in the server-delivered HTML. Everything is rendered client-side by React.

---

## 2. Network Tab & API Architecture
Reverse engineering of the frontend bundle (`index-B9UiQq4X.js`) and live network traces reveals four categories of endpoints:

### Catalog & Metadata Endpoints (Unprotected)
1. `GET /api/catalog?page=1&pageSize=20`
   - **Response**: `{"page":1,"pageSize":20,"pages":50,"total":1000,"items":[{ id, slug, name, brand, category, sku, description }]}`
   - **Critical Note**: Returns product info, but **NO price** and **NO stock**.
2. `GET /api/product/:id`
   - **Response**: Full specs, reviews, category, description.
   - **Critical Note**: Also contains **NO price** and **NO stock**.
3. `GET /api/layout`
   - Returns navigation categories and header metadata.

### The Pricing & Stock Subsystem (Anti-Scraping Protected)
Pricing and stock are not part of the standard catalog API. They are guarded by an intentional multi-step challenge and attestation pipeline:
1. `GET /api/challenge`
   - Returns:
     ```json
     {
       "salt": "ab29b7e46b050720482ba9911fcbf614",
       "ts": 1789852262235,
       "difficulty": 3,
       "csig": "70a98cab...",
       "wasm": "AGFzbQEAAAABBgFgAX8BfwMCAQAHBQEBZgAAC..."
     }
     ```
   - Rate limit: ~12 requests/minute. Exceeding triggers HTTP 429.
2. Proof of Work & Browser Attestation:
   - Client executes WebAssembly module from `wasm` to compute `wasmOut`.
   - Client performs proof-of-work finding `nonce` where `SHA256(salt + ":" + nonce)` starts with `difficulty` zeros.
   - Client derives key using shared secret `ine-mock-store-shared-k3y`.
   - Client collects browser environment and interaction attestation `att`:
     - `canvas`: `ar()` creates a 2D canvas, draws a gradient, text `INE store ✓ price ₹ 42.9`, and computes a 64-bit FNV-style hash.
     - `gl`: `or()` extracts WebGL vendor, renderer, and version strings.
     - `frames`: `sr(8)` measures `requestAnimationFrame` deltas over 8 frames.
     - `hc`: hardware concurrency.
     - `scr`: `[screen.width, screen.height, devicePixelRatio]`.
     - `ix`: mouse interaction telemetry object:
       - `moves`: array of `[x, y, timestamp]`. Must have at least 8 distinct moves spaced by ≥40ms.
       - `dwellMs`: must be ≥600ms hover duration over the price area.
       - `trusted`: boolean indicating `e.nativeEvent.isTrusted === true`.
3. `POST /api/session`
   - Body: `{ salt, ts, difficulty, csig, wasm, nonce, derived, wasmOut, att, productId }`
   - Returns: `{ "token": "<bearer_token>" }`
   - Returns `401 Unauthorized` if attestation or PoW is invalid.
4. `GET /api/products/:id/price` with `Authorization: Bearer <token>`
   - Returns encrypted payload: `{"e": "..."}`
   - Decrypted client-side via XOR with `SHA256("ine-mock-store-shared-k3y" + token)`:
     ```json
     {
       "shown": 32999,
       "mrp": 39999,
       "sale": 32999,
       "badgePct": 17,
       "stock": 14,
       "currency": "INR",
       "at": 1789852262235,
       "rating": 4.8,
       "ratingCount": 151,
       "seller": "CloudRetail Hub",
       "deliveryDays": 2,
       "pending": false
     }
     ```

---

## 3. Frontend Obstacles & Pricing Traps
1. **Interactive Hover Gate**:
   - Initial state: `.price-block.price-idle` displays `"Price hidden - Hover over the price area to load the current price."`
   - The "Reveal price" button is disabled until the user hovers over the element with at least 8 moves and 600ms dwell time.
2. **Flaky Click Handler (`Xn`)**:
   - The click handler on the "Reveal price" button introduces intentional flakiness:
     - 35% probability branch: 50% chance of completely dropping the click, or 900ms delay.
     - A reliable scraper must verify whether the state transitioned to loading; if still idle after a timeout, it must re-click.
3. **Decoy DOM Elements**:
   - The DOM renders deceptive hidden spans with bogus price numbers:
     ```html
     <span class="amount" data-price="true" aria-hidden="true" style="display:none">₹45,999</span>
     ```
   - Parsers looking for `data-price="true"` or `.amount` without checking visibility will extract fake prices!
4. **Deliberate Formatting Variations (`Ir`)**:
   - `trailing`: `₹32,999/- (incl. of all taxes)`
   - `euro`: `32.999,00` (period for thousands, comma for decimals)
   - `spaced`: `32 999` (space separator)
   - `unicode`: `３２９９９` (fullwidth UTF-8 numbers `U+FF10` to `U+FF19`)
   - `nbsp`: `\u00a0` and zero-width spaces `\u200b` injected between characters.
   - `lakh`: `Rs. 1,32,999.00` (South Asian number grouping).
5. **Stock Badges**:
   - Format: `<span class="stock-badge in-stock">In stock · 14 left</span>` or `Only 3 left` or `Out of stock`.

---

## 4. Latency, Status Codes, and Variance Test
Across 20 consecutive requests:
- `/api/product/748`: Status 200, min 34ms, max 207ms, avg 44ms. Very fast, stable JSON metadata.
- `/api/challenge`:
  - Requests 1–12: Status 200, latency ~35ms.
  - Requests 13–20: **Status 429 Too Many Requests**.
  - **Key takeaway**: The store strictly enforces an IP rate limiter on challenge issuance. Concurrency must be capped (max 2–3) and retries must incorporate exponential backoff with jitter.

---

## 5. Decision: Scraping Strategy
**Decision: Headless Browser (Playwright) is GENUINELY REQUIRED.**

### Justification:
1. **Absence of Server-Rendered Price**: Neither raw HTML nor standard JSON APIs provide price or stock.
2. **Strict Browser Attestation**: `/api/session` validates WebGL vendor strings, canvas rendering hashes, `requestAnimationFrame` timing, and authentic mouse movement telemetry.
3. **Dual Headed / Headless Requirement**: Playwright provides unified browser automation that runs headless in production and headed for user demonstration (`npm run scrape:headed`), using 100% shared parsing, validation, and logging logic.
4. **Resource Optimization for Render Free Tier**:
   - Single browser instance reused across product batches.
   - Lightweight Chromium launch args (`--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`).
   - Concurrency limit of 2–3 to remain comfortably within Render's 512MB RAM ceiling.
