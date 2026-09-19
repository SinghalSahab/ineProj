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
- **The Fix**: Paced requests with concurrency limit (2–3 max) and added exponential backoff with jitter specifically handling 429 rate limit responses.
