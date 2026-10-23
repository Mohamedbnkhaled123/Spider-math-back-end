import { createServer } from 'http';
import { app } from './app';
import { env } from './config/env.config';
import { connectToDatabase, disconnectFromDatabase } from './config/db.config';

const server = createServer(app);

/**
 * Boots the HTTP server and establishes Atlas connection pool.
 */
async function bootstrap(): Promise<void> {
  try {
    console.log(`[Spider Math Backend] Initializing in ${env.NODE_ENV.toUpperCase()} mode...`);

    // Connect to MongoDB Atlas (M0 512MB Optimized Pool)
    await connectToDatabase();

    // Only start server listening if not running in a Vercel serverless environment
    if (process.env.VERCEL !== '1') {
      server.listen(env.PORT, () => {
        console.log(`[Server] HTTP API Gateway listening on: http://localhost:${env.PORT}`);
        console.log(`[Security] 512-bit JWT & 256-bit AES-256-GCM cipher loaded.`);
        console.log(`[Health] Live probe available at: http://localhost:${env.PORT}/api/v1/health`);
      });
    }
  } catch (error) {
    console.error('[Server Bootstrap Failure]:', error);
    process.exit(1);
  }
}

/**
 * Graceful Process Termination Handlers
 */
async function handleShutdown(signal: string): Promise<void> {
  console.log(`\n[Process] Received ${signal}. Initiating graceful shutdown...`);

  server.close(async () => {
    console.log('[Server] HTTP server closed.');
    try {
      await disconnectFromDatabase();
      console.log('[Process] Clean shutdown completed. Exiting.');
      process.exit(0);
    } catch (err) {
      console.error('[Process] Error during database disconnect:', err);
      process.exit(1);
    }
  });

  // Force close after 10 seconds if lingering connections remain
  setTimeout(() => {
    console.error('[Process] Forcefully shutting down after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[Unhandled Rejection]:', reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('[Uncaught Exception]:', error);
  process.exit(1);
});

// Execute bootstrap
bootstrap();

// Export app instance for Vercel Serverless Function runtime
export default app;
