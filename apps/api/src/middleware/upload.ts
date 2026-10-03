import { MAX_PHOTO_BYTES } from '@fedsa/contract';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { UploadRejectedError, ValidationError } from '../errors.js';

/** the text fields of a multipart form are short, so this mirrors the JSON body limit */
const MAX_FIELD_BYTES = 100 * 1024;

/**
 * the limits stop an oversized upload while it streams. the service checks
 * what each file actually is
 */
export function acceptPhotos(fieldNames: string[], max: number) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: max, fileSize: MAX_PHOTO_BYTES, fields: 20, fieldSize: MAX_FIELD_BYTES },
  }).fields(fieldNames.map((name) => ({ name, maxCount: max })));

  const tooMany = `Attach at most ${max} photos, as ${fieldNames[0]}`;
  const photoErrors: Record<string, string> = {
    LIMIT_FILE_SIZE: 'Each photo must be 5 MB or smaller',
    LIMIT_FILE_COUNT: tooMany,
    LIMIT_UNEXPECTED_FILE: tooMany,
  };

  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && photoErrors[err.code]) {
        next(new UploadRejectedError(photoErrors[err.code]));
        return;
      }
      if (err) {
        next(new ValidationError(undefined, 'The request could not be read'));
        return;
      }
      req.files = Object.values(req.files ?? {}).flat();
      next();
    });
  };
}
