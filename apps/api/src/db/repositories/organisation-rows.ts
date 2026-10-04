import type { PipelineStage } from 'mongoose';
import { OrganisationModel } from '../models/organisation.js';

export interface KgRow {
  key: string;
  label: string;
  kg: number;
}

/** follows a `$group` on an organisation ID that sums `kg`, and names each row after its organisation */
export const ORGANISATION_ROWS: PipelineStage[] = [
  {
    $lookup: {
      from: OrganisationModel.collection.collectionName,
      localField: '_id',
      foreignField: '_id',
      pipeline: [{ $project: { name: 1 } }],
      as: 'organisation',
    },
  },
  {
    $project: {
      _id: 0,
      key: { $toString: '$_id' },
      label: { $ifNull: [{ $first: '$organisation.name' }, ''] },
      kg: 1,
    },
  },
  { $sort: { kg: -1, label: 1, key: 1 } },
];
