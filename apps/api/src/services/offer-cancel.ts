import type { CancelOfferRequest } from '@fedsa/contract';
import type { ClientSession } from 'mongoose';
import type { OfferRepository } from '../db/index.js';
import { InvalidStateError, NotFoundError } from '../errors.js';
import type { AuditService } from './audit-service.js';
import type { SessionUser } from './user-service.js';

const AUDIT_TARGET = 'offers';

export async function cancelOpenOffer(
  offers: OfferRepository,
  audit: AuditService,
  user: SessionUser,
  id: string,
  input: CancelOfferRequest,
  session?: ClientSession,
) {
  const cancelled = await offers.cancelIfOpen(id, session);
  if (cancelled) {
    if (user.role === 'coordinator') {
      await audit.record(
        user.id,
        'cancel_offer',
        { type: AUDIT_TARGET, id: cancelled._id },
        { note: input.reason || null, session },
      );
    }
    return cancelled;
  }

  const current = await offers.findById(id, session);
  if (!current) throw new NotFoundError();
  // a repeated cancel gets the same answer as the first and is not audited twice
  if (current.status === 'cancelled') return current;
  throw new InvalidStateError('Only an open offer can be cancelled');
}
