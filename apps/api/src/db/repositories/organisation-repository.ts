import type { OrganisationStatus, OrganisationType } from '@fedsa/contract';
import type { ClientSession, Types } from 'mongoose';
import { OrganisationModel, type OrganisationDoc } from '../models/organisation.js';

export interface OrganisationFilter {
  type?: OrganisationType;
  status?: OrganisationStatus;
  /** matched against the name and suburb, ignoring case */
  q?: string;
}

/** the search text is matched literally, so a `.` or `*` in it is not a pattern */
function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class OrganisationRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return OrganisationModel.findById(id, null, { session }).exec();
  }

  create(data: Partial<OrganisationDoc>, session?: ClientSession) {
    return new OrganisationModel(data).save({ session });
  }

  list(filter: OrganisationFilter) {
    const query: Record<string, unknown> = {};
    if (filter.type) query.type = filter.type;
    if (filter.status) query.status = filter.status;
    if (filter.q) {
      const pattern = new RegExp(escapeRegex(filter.q), 'i');
      query.$or = [{ name: pattern }, { suburb: pattern }];
    }
    return OrganisationModel.find(query).sort({ name: 1, _id: 1 }).exec();
  }

  updateProfile(id: Types.ObjectId | string, changes: Partial<OrganisationDoc>) {
    return OrganisationModel.findByIdAndUpdate(
      id,
      { $set: changes },
      { returnDocument: 'after', runValidators: true },
    ).exec();
  }

  /** null if the status changed since it was read */
  updateStatus(
    id: Types.ObjectId | string,
    from: OrganisationStatus,
    changes: Partial<OrganisationDoc>,
    session?: ClientSession,
  ) {
    return OrganisationModel.findOneAndUpdate(
      { _id: id, status: from },
      { $set: changes },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  updateCapacityNotes(id: Types.ObjectId | string, capacityNotes: string, session?: ClientSession) {
    return OrganisationModel.findByIdAndUpdate(
      id,
      { $set: { capacityNotes } },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }
}
