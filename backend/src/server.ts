/**
 * server.ts
 * Express API server for Product Price Tracker backend.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRouter from './routes/health.js';
import storeRouter from './routes/store.js';
import trackedRouter from './routes/tracked.js';
import cronRouter from './routes/cron.js';
import { closeSharedBrowser } from './scraper/fetcher.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// Middleware
app.use(
  cors({
    origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CRON-SECRET']
  })
);
app.use(express.json());

// Routes
app.use('/api/health', healthRouter);
app.use('/api/store', storeRouter);
app.use('/api/tracked', trackedRouter);
app.use('/api/cron', cronRouter);

// Root informational endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'INE Product Price Tracker API',
    status: 'running',
    docs: {
      health: '/api/health',
      storeSearch: '/api/store/search?q=',
      tracked: '/api/tracked',
      cron: '/api/cron/scrape-all'
    }
  });
});

// Centralized error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[UNHANDLED SERVER ERROR]', err);
  res.status(err.status || 500).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred'
  });
});

const server = app.listen(PORT, () => {
  console.log(`[SERVER] Product Price Tracker backend listening on port ${PORT}`);
  console.log(`[SERVER] CORS allowed origin: ${ALLOWED_ORIGIN}`);
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\n[SERVER] Received ${signal}. Closing server and browser instances...`);
  server.close(async () => {
    try {
      await closeSharedBrowser();
      console.log('[SERVER] Cleanup complete. Exiting.');
      process.exit(0);
    } catch (e) {
      console.error('[SERVER] Cleanup error:', e);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
