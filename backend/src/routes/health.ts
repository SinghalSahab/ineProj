/**
 * routes/health.ts
 * Health check & keep-alive endpoint for cron-job.org and frontend cold-start wake-up.
 */

import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'price-tracker-backend',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

export default router;
