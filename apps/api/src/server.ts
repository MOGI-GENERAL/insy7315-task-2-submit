import mongoose from 'mongoose';
import { createApp } from './app.js';
import {
  bootstrapDb,
  HealthRepository,
  OrganisationRepository,
  SessionRepository,
  UserRepository,
} from './db/index.js';
import { createLogger } from './logger.js';
import { createSessionStore } from './middleware/session.js';
import { HealthService } from './services/health-service.js';
import { UserService } from './services/user-service.js';

const logger = createLogger();

async function start() {
  const mongodbUri = process.env.MONGODB_URI;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!mongodbUri || !sessionSecret) {
    logger.fatal(
      'MONGODB_URI and SESSION_SECRET must be set. Copy apps/api/.env.example to apps/api/.env and fill it in',
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
    users: new UserService(
      new UserRepository(),
      new OrganisationRepository(),
      new SessionRepository(),
    ),
  };
  const session = {
    secret: sessionSecret,
    store: createSessionStore(),
    // secure unless explicitly running locally, so a missing variable in a deployment fails safe
    secureCookie: process.env.NODE_ENV !== 'development',
  };
  const port = Number(process.env.PORT || 3000);

  createApp({ logger, services, session }).listen(port, () => {
    logger.info(`api listening on ${port}`);
  });
}

void start();
