import { z } from 'zod';
import { isoDateTime, isoDay, objectId } from './common.js';
import { TaxCertificate, ValuationRate } from './entities.js';
import { FoodCategory } from './enums.js';

export const ValuationRateListResponse = z.object({ items: z.array(ValuationRate) });
export type ValuationRateListResponse = z.infer<typeof ValuationRateListResponse>;

export const UpdateValuationRatesRequest = z.object({
  items: z
    .array(z.object({ category: FoodCategory, ratePerKg: z.number().nonnegative().max(10000) }))
    .min(1)
    .refine(
      (items) => new Set(items.map((i) => i.category)).size === items.length,
      'Each category once',
    ),
});
export type UpdateValuationRatesRequest = z.infer<typeof UpdateValuationRatesRequest>;

export const IssueCertificateRequest = z
  .object({ donorOrganisationId: objectId, periodStart: isoDay, periodEnd: isoDay })
  .refine((b) => b.periodStart <= b.periodEnd, {
    path: ['periodEnd'],
    message: 'Must not be before the start date',
  });
export type IssueCertificateRequest = z.infer<typeof IssueCertificateRequest>;

export const CertificateResponse = z.object({ certificate: TaxCertificate });
export type CertificateResponse = z.infer<typeof CertificateResponse>;

export const ListCertificatesQuery = z.object({ donorOrganisationId: objectId.optional() });
export type ListCertificatesQuery = z.infer<typeof ListCertificatesQuery>;

export const CertificateListResponse = z.object({ items: z.array(TaxCertificate) });
export type CertificateListResponse = z.infer<typeof CertificateListResponse>;

/** everything the PDF prints. never sent over HTTP */
export const TaxCertificateView = TaxCertificate.extend({
  donor: z.object({
    name: z.string(),
    addressLine: z.string(),
    suburb: z.string(),
    taxReferenceNumber: z.string().nullable(),
  }),
  handovers: z.array(
    z.object({
      id: objectId,
      confirmedAt: isoDateTime,
      category: FoodCategory,
      quantityKg: z.number(),
    }),
  ),
  placeholderRates: z.boolean(),
});
export type TaxCertificateView = z.infer<typeof TaxCertificateView>;
