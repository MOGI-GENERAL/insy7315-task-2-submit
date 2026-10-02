import mongoose from 'mongoose';
import { createApp } from './app.js';
import { bootstrapDb, HealthRepository } from './db/index.js';
import { createLogger } from './logger.js';
import { HealthService } from './services/health-service.js';

const logger = createLogger();

async function start() {
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) {
    logger.fatal(
      'MONGODB_URI is not set. Copy apps/api/.env.example to apps/api/.env and fill it in',
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(mongodbUri);
    const result = await bootstrapDb();
    logger.info(result, 'database ready');
  } catch (err) {
    logger.fatal({ err }, 'could not connect to MongoDB or prepare the database');
    process.exit(1);
  }

  const services = {
    // Render sets RENDER_GIT_COMMIT on every deploy
    health: new HealthService(new HealthRepository(), process.env.RENDER_GIT_COMMIT || 'dev'),
  };
  const port = Number(process.env.PORT || 3000);

  createApp({ logger, services }).listen(port, () => {
    logger.info(`api listening on ${port}`);
  });
}

void start();
