import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { connectToDatabase, disconnectFromDatabase } from './config/db';

const PORT = process.env.PORT || 5001;

async function bootstrap() {
  try {
    // 1. Connect to MongoDB
    await connectToDatabase();

    // 2. Start HTTP server
    const app = createApp();
    const server = app.listen(PORT, () => {
      console.log(`[Server] SAVEit backend running at http://localhost:${PORT}`);
    });

    // 3. Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
      server.close(async () => {
        console.log('[Server] HTTP server closed.');
        await disconnectFromDatabase();
        process.exit(0);
      });

      // Force exit after 10s if graceful shutdown hangs
      setTimeout(() => {
        console.error('[Server] Forced exit after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (err) {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
  }
}

bootstrap();
