import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import itemRoutes from './routes/itemRoutes';
import { isDatabaseConnected } from './config/db';

export function createApp(): Application {
  const app: Application = express();

  // Middleware
  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Health endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'saveit-server',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: isDatabaseConnected() ? 'connected' : 'disconnected',
    });
  });

  // API Routes
  app.use('/api/items', itemRoutes);

  // 404 handler for unknown routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: `Route not found: ${req.method} ${req.path}`,
    });
  });

  // Global error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('[App] Unhandled error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'An unexpected server error occurred.',
    });
  });

  return app;
}
