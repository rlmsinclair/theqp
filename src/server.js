console.log('Starting THE QP server...');

const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./database');
const { cleanupAbandonedReservations } = require('./prime');
const { initDatabase } = require('./init-db-simple');

console.log('Modules loaded successfully');

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, starting graceful shutdown`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Close database connections
  try {
    await db.pool.end();
    logger.info('Database connections closed');
  } catch (err) {
    logger.error('Error closing database connections:', err);
  }
  
  // Exit
  process.exit(0);
};

// Start server
const PORT = process.env.PORT || config.app.port;
const HOST = '0.0.0.0'; // Railway requires 0.0.0.0

console.log(`Attempting to start server on ${HOST}:${PORT}`);

const server = app.listen(PORT, HOST, async () => {
  console.log(`Server started successfully on port ${PORT}`);
  logger.info(`THE QP server started`, {
    env: config.app.env,
    host: HOST,
    port: PORT,
    url: config.app.domain
  });
  
  // Check database connection
  console.log('Checking database connection...');
  try {
    const dbHealthy = await db.checkConnection();
    if (!dbHealthy) {
      console.error('Database connection failed, shutting down');
      logger.error('Database connection failed, shutting down');
      process.exit(1);
    }
    console.log('Database connection successful');
    
    // Initialize database if needed
    try {
      await initDatabase();
    } catch (initErr) {
      console.error('Failed to initialize database:', initErr.message);
      throw initErr;
    }
    
  } catch (err) {
    console.error('Database connection error:', err.message);
    logger.error('Database connection error:', err);
    process.exit(1);
  }
  
  // Start cleanup job for abandoned reservations
  setInterval(async () => {
    try {
      const cleaned = await cleanupAbandonedReservations();
      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} abandoned reservations`);
      }
    } catch (err) {
      logger.error('Cleanup job failed:', err);
    }
  }, 300000); // Run every 5 minutes
});

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection:', { reason, promise });
  process.exit(1);
});

module.exports = server;