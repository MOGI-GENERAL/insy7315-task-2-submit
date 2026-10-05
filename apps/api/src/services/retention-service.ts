import type { Logger } from 'pino';
import type { HandoverRepository } from '../db/index.js';
import type { PhotoStore } from '../photos/photo-store.js';

export const RETENTION_INTERVAL_MS = 60 * 60 * 1000;
const BATCH = 100;

export interface RetentionSummary {
  photosDeleted: number;
  failed: number;
}

export class RetentionService {
  private readonly handovers: HandoverRepository;
  private readonly photos: PhotoStore;

  constructor(handovers: HandoverRepository, photos: PhotoStore) {
    this.handovers = handovers;
    this.photos = photos;
  }

  /**
   * the record stays and only the photo goes. the image is deleted before the
   * url is cleared, so a failure leaves the url in place for the next run
   */
  async sweep(now = new Date()): Promise<RetentionSummary> {
    const due = await this.handovers.photosPastRetention(now, BATCH);
    const summary = { photosDeleted: 0, failed: 0 };
    for (const { _id, donorPhotoUrl } of due) {
      try {
        await this.photos.delete(donorPhotoUrl);
        await this.handovers.clearPhoto(_id, donorPhotoUrl);
        summary.photosDeleted += 1;
      } catch {
        summary.failed += 1;
      }
    }
    return summary;
  }
}

/** hourly, because the free plan sleeps and a fixed hour could pass unseen */
export function startRetentionSweep(
  retention: Pick<RetentionService, 'sweep'>,
  logger: Logger,
  intervalMs = RETENTION_INTERVAL_MS,
) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      logger.info(await retention.sweep(), 'retention sweep');
    } catch (err) {
      logger.error({ err }, 'retention sweep failed');
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  return { run, stop: () => clearInterval(timer) };
}
