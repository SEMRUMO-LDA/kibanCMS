/**
 * Request ID Middleware
 *
 * Assigns a unique ID to every request for tracing.
 * Available as req.requestId and in response header X-Request-ID.
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export interface RequestWithId extends Request {
  requestId: string;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();

  (req as RequestWithId).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  next();
}
