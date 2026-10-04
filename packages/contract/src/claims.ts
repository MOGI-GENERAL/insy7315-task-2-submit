import { z } from 'zod';
import { longText } from './common.js';
import { Claim, Offer } from './entities.js';
import { ClaimStatus } from './enums.js';

export const ListClaimsQuery = z.object({ status: ClaimStatus.optional() });
export type ListClaimsQuery = z.infer<typeof ListClaimsQuery>;

export const ClaimListItem = Claim.extend({ offer: Offer });
export type ClaimListItem = z.infer<typeof ClaimListItem>;

export const ClaimListResponse = z.object({ items: z.array(ClaimListItem) });
export type ClaimListResponse = z.infer<typeof ClaimListResponse>;

export const ReleaseClaimRequest = z.object({ reason: longText.optional() });
export type ReleaseClaimRequest = z.infer<typeof ReleaseClaimRequest>;

export const OverrideClaimRequest = z.object({
  action: z.literal('release'),
  reason: longText.min(1),
});
export type OverrideClaimRequest = z.infer<typeof OverrideClaimRequest>;

export const ClaimWithOfferResponse = z.object({ claim: Claim, offer: Offer });
export type ClaimWithOfferResponse = z.infer<typeof ClaimWithOfferResponse>;
