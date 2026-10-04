import type { ValuationLine } from '@fedsa/contract';
import type { ClientSession, Types } from 'mongoose';
import { TaxCertificateModel } from '../models/tax-certificate.js';

export interface NewTaxCertificate {
  donorOrganisationId: Types.ObjectId;
  periodStart: Date;
  periodEnd: Date;
  handoverRecordIds: Types.ObjectId[];
  totalQuantityKg: number;
  valuationByCategory: ValuationLine[];
  totalValue: number;
  certificateNumber: string;
  issuedAt: Date;
  donor: { name: string; addressLine: string; suburb: string; taxReferenceNumber: string | null };
  placeholderRates: boolean;
}

export class TaxCertificateRepository {
  create(data: NewTaxCertificate, session: ClientSession) {
    return new TaxCertificateModel(data).save({ session });
  }

  findById(id: Types.ObjectId | string) {
    return TaxCertificateModel.findById(id).exec();
  }

  /** newest first */
  list(filter: { donorOrganisationId?: Types.ObjectId }) {
    return TaxCertificateModel.find(filter).sort({ issuedAt: -1, _id: -1 }).exec();
  }

  /** every handover already on one of the donor's certificates */
  certifiedHandoverIds(donorOrganisationId: Types.ObjectId, session: ClientSession) {
    return TaxCertificateModel.distinct('handoverRecordIds', { donorOrganisationId })
      .session(session)
      .exec() as Promise<Types.ObjectId[]>;
  }
}
