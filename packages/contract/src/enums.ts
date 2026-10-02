import { z } from 'zod';

export const Role = z.enum(['donor', 'recipient', 'coordinator', 'administrator']);
export type Role = z.infer<typeof Role>;

export const Language = z.enum(['en', 'af', 'xh']);
export type Language = z.infer<typeof Language>;

export const UserStatus = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatus>;

export const OrganisationType = z.enum(['donor', 'recipient']);
export type OrganisationType = z.infer<typeof OrganisationType>;

/** donors start `active`, only recipients go through verification */
export const OrganisationStatus = z.enum([
  'pending',
  'verified',
  'rejected',
  'active',
  'suspended',
]);
export type OrganisationStatus = z.infer<typeof OrganisationStatus>;

export const VerificationDecision = z.enum(['verify', 'reject', 'suspend', 'reinstate']);
export type VerificationDecision = z.infer<typeof VerificationDecision>;

export const FoodCategory = z.enum(['bakery', 'produce', 'dairy', 'prepared', 'dry', 'other']);
export type FoodCategory = z.infer<typeof FoodCategory>;

export const ColdChain = z.enum(['ambient', 'refrigerated', 'frozen']);
export type ColdChain = z.infer<typeof ColdChain>;

export const OfferStatus = z.enum(['open', 'claimed', 'collected', 'expired', 'cancelled']);
export type OfferStatus = z.infer<typeof OfferStatus>;

/** kept apart from `released` so reports can tell a collection failure from a release */
export const ClaimStatus = z.enum(['active', 'released', 'fulfilled', 'expired']);
export type ClaimStatus = z.infer<typeof ClaimStatus>;

export const CollectionStatus = z.enum(['dispatched', 'completed', 'cancelled']);
export type CollectionStatus = z.infer<typeof CollectionStatus>;

/** the UI labels `problem` as "Poor" */
export const Condition = z.enum(['good', 'acceptable', 'problem']);
export type Condition = z.infer<typeof Condition>;

export const NotificationKind = z.enum([
  'offer_posted',
  'offer_claimed',
  'claim_released',
  'handover_confirmed',
  'driver_dispatched',
  'verification',
  'dispute',
]);
export type NotificationKind = z.infer<typeof NotificationKind>;

export const NotificationChannel = z.enum(['in_app', 'push', 'whatsapp', 'sms']);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

export const DeliveryStatus = z.enum(['queued', 'sent', 'delivered', 'failed']);
export type DeliveryStatus = z.infer<typeof DeliveryStatus>;

export const AuditAction = z.enum([
  'verify_organisation',
  'reject_organisation',
  'suspend_organisation',
  'reinstate_organisation',
  'update_capacity_notes',
  'create_user',
  'disable_user',
  'enable_user',
  'change_role',
  'cancel_offer',
  'override_claim',
  'dispatch_driver',
  'update_collection',
  'resolve_dispute',
  'update_valuation_rates',
  'issue_certificate',
]);
export type AuditAction = z.infer<typeof AuditAction>;
