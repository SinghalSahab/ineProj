# 🏷️ Product Price Tracker

> A production-grade, highly reliable product price tracker built specifically to scrape the mock e-commerce store at [https://demo.inelabteamdev.com](https://demo.inelabteamdev.com).
> Engineered with **scraping reliability as the primary evaluation criterion**, full defense-in-depth against anti-scraping traps, an observable headed runner, and a glassmorphic React TypeScript dashboard.

---

## 🌟 Highlights & Guarantees

- **🛡️ 100% Honest Data Guarantee**: If a scrape fails, encounters rate limiting, or detects a structural trap, **ZERO** rows are inserted into `price_history`. An honest, timestamped row is recorded in `scrape_logs`.
- **⚡ Anti-Scraping Bypass**: Solves client-side WebAssembly Proof-of-Work, passes canvas/WebGL device attestation, and humanizes mouse trajectory and dwell physics (`dwellMs >= 600`, `moves >= 8`).
- **🪤 Decoy & Trap Neutralization**: Bypasses hidden honeypot spans (`style="display:none"`), filters out strike-through typography, and prevents MRP/deal concatenation.
- **🔄 Fault-Tolerant Retries**: Implements exponential backoff with full jitter, classified error taxonomy (`rate_limit`, `timeout`, `structure_changed`), and recovery for flaky click handlers (`Xn()`).
- **👀 Observable Headed Runner**: Step-by-step human-readable CLI narration (`npm run scrape:headed`) with slow-motion execution and demo fault injection (`--simulate-slow`, `--simulate-fail`).
- **☁️ 100% Free-Tier Architecture**:
  - **Frontend**: Vercel (React + TypeScript + Vite + Recharts)
  - **Backend**: Render (Express + TypeScript + Playwright Chromium)
  - **Database**: Supabase (PostgreSQL with strict `CHECK (price > 0)` and timeseries indexes)
  - **Scheduler**: cron-job.org (HTTP POST trigger with `202 Accepted` pattern beating the 30s timeout)

---

## 🏗️ Architecture Overview

```
                        +------------------------------+
                        |         cron-job.org         |
                        | (POST /api/cron/scrape-all)  |
                        +--------------+---------------+
                                       |
                                       v
+-----------------------+     +------------------------+     +------------------------+
|    React Dashboard    |     |     Express Backend    |     |   INE Mock Store       |
|  (Vercel Free Tier)   | <-> |  (Render Free Tier)    | <-> | (demo.inelabteamdev)   |
|   Vite + TypeScript   |     |   Playwright Scraper   |     | Wasm PoW + Attestation |
+-----------------------+     +-----------+------------+     +------------------------+
                                          |
                                          v
                              +------------------------+
                              |   Supabase Postgres    |
                              |  tracked_products      |
                              |  price_history (>0)    |
                              |  scrape_logs           |
                              |  scrape_runs (lock)    |
                              +------------------------+
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Node.js >= 18.x
- npm >= 9.x

### 2. Clone and Install

```bash
git clone <repo-url>
cd ineProj

# Install backend dependencies
cd backend
npm install
npx playwright install chromium

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Environment Setup

**Backend (`backend/.env`):**
```env
PORT=4000
ALLOWED_ORIGIN=http://localhost:5173
STORE_BASE_URL=https://demo.inelabteamdev.com
CRON_SECRET=super-secret-cron-token-123

# Optional: Supabase PostgreSQL credentials.
# If omitted, backend automatically runs in graceful in-memory store mode!
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Scraper performance tunables
SCRAPE_TIMEOUT_MS=20000
SCRAPE_MAX_ATTEMPTS=4
SCRAPE_CONCURRENCY=2
```

**Frontend (`frontend/.env`):**
```env
VITE_API_BASE_URL=http://localhost:4000
```

### 4. Running the Application

In terminal 1 (Backend):
```bash
cd backend
npm run dev
```

In terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🕵️ Observable Headed Runner (CLI)

Watch the Playwright browser solve challenges, move the cursor, click the price unlock button, and extract prices in real time:

```bash
cd backend

# Scrape any product by ID or URL in headed mode
npm run scrape:headed -- --product 748

# Scrape with slow-motion (e.g., 500ms delay per action for presentations)
npm run scrape:headed -- --product 748 --slow-mo 500

# Demo Fault Injection: simulate slow network/spinner
npm run scrape:headed -- --product 748 --simulate-slow

# Demo Fault Injection: simulate store failure and watch retry loop recover
npm run scrape:headed -- --product 748 --simulate-fail

# Dry-run: scrape and output without writing to database
npm run scrape:headed -- --product 748 --dry-run
```

---

## 🧪 Testing & Reliability Benchmark

### Unit Tests (Parser, Traps, & Validation)
Runs 26 comprehensive Vitest unit tests verifying price sanitization (Indian lakhs, European commas, Unicode digits), decoy element stripping, negative price rejection, and error classification:
```bash
cd backend
npm test
```

### 30-Run Unattended Scraper Benchmark
Executes 30 consecutive unattended scrapes against the live mock store across diverse product categories, stress-testing concurrency, rate limits, and zero-wrong-data invariants:
```bash
cd backend
npm run test:reliability
```

---

## ⏰ Free-Tier Automated Scheduling (cron-job.org)

Render's free tier has a 15-minute idle sleep timer, and cron-job.org enforces a 30-second webhook timeout. Our architecture solves both cleanly:

### Step 1: Health Ping (Optional Keep-Alive)
- **URL**: `https://your-backend.onrender.com/api/health`
- **Schedule**: Every 10 or 14 minutes (prevents Render from spinning down)

### Step 2: Recurring Batch Scraper
- **URL**: `https://your-backend.onrender.com/api/cron/scrape-all`
- **HTTP Method**: `POST`
- **Request Headers**:
  - `Content-Type`: `application/json`
  - `X-CRON-SECRET`: `<your-CRON_SECRET>`
- **Schedule**: Every 2 hours (e.g., `0 */2 * * *`)
- **How it beats the 30s timeout**:
  - The endpoint acquires an overlap lock in `scrape_runs`.
  - Responds immediately with `202 Accepted` within **<50ms** (`{ status: "processing", runId: "..." }`).
  - Playwright scrapes all active tracked products in the background with polite concurrency (`p-limit: 2`).

---

## 🚢 Free-Tier Deployment Guide

### Database (Supabase)
1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** and run the migration files in order:
   - `db/migrations/001_initial_schema.sql` (Tables & `CHECK (price > 0)` constraint)
   - `db/migrations/002_indexes_and_constraints.sql` (Timeseries & cron performance indexes)
3. Copy **Project URL** and **Service Role Secret** to your backend environment variables.

### Backend (Render)
1. Create a free account at [render.com](https://render.com).
2. Click **New +** -> **Blueprint** and connect your GitHub repository (using `render.yaml`).
3. Alternatively, create a **Web Service**:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npx playwright install --with-deps chromium`
   - **Start Command**: `npm start`
   - **Plan**: Free
4. Add environment variables from `backend/.env.example`.

### Frontend (Vercel)
1. Create a free account at [vercel.com](https://vercel.com).
2. Click **Add New Project** and select your repository.
3. Configure settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Set Environment Variable:
   - `VITE_API_BASE_URL`: `https://your-backend.onrender.com`
5. Click **Deploy**. Vercel will automatically configure SPA rewrites via `frontend/vercel.json`.

---

## 📖 In-Depth Documentation

- [DESIGN_NOTE.md](file:///Users/prakhar/ineProj/DESIGN_NOTE.md): Detailed architectural trade-offs, Playwright vs fetch analysis, challenge reverse-engineering, and anti-scraping defenses.
- [AI_MISTAKES.md](file:///Users/prakhar/ineProj/docs/AI_MISTAKES.md): Transparent chronological record of actual AI errors, mistaken assumptions, and their fixes.
- [RECON.md](file:///Users/prakhar/ineProj/docs/RECON.md): Initial mock store reverse-engineering, network endpoints, and fingerprinting telemetry report.

---

## 📄 License
MIT License.
