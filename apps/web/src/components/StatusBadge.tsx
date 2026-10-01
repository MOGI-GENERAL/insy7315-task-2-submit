/* STATUS BADGES: text label always accompanies colour, not colour-only */

import { Icon } from './Icon';
import type { IconName } from './Icon';
import { useT, statusKey, coldChainKey } from '../i18n/useT';
import { isExpiringSoon } from '../lib/format';
import type { ColdChain, NotificationChannel, OfferStatus, VerificationStatus } from '../store/types';

export function StatusBadge({
  status,
  deadline,
}: {
  status: OfferStatus;
  deadline?: string;
}) {
  const t = useT();
  const expiring = status === 'open' && deadline ? isExpiringSoon(deadline) : false;
  const tone = expiring ? 'expiring' : status;
  const icon: IconName =
    tone === 'expiring'
      ? 'alert'
      : status === 'collected'
        ? 'check-circle'
        : status === 'claimed'
          ? 'check'
          : status === 'open'
            ? 'clock'
            : 'close';

  return (
    <span className="badge" data-tone={tone}>
      <Icon name={icon} size={14} />
      {expiring ? t('status.expiring') : t(statusKey(status))}
    </span>
  );
}

export function ColdChainBadge({ coldChain }: { coldChain: ColdChain }) {
  const t = useT();
  const icon: IconName =
    coldChain === 'frozen' ? 'snow' : coldChain === 'refrigerated' ? 'fridge' : 'box';
  return (
    <span className="badge badge--quiet">
      <Icon name={icon} size={14} />
      {t(coldChainKey(coldChain))}
    </span>
  );
}

const verificationTone: Record<VerificationStatus, string> = {
  pending: 'expiring',
  'visit-booked': 'open',
  verified: 'collected',
  suspended: 'expired',
};

const verificationLabel: Record<VerificationStatus, string> = {
  pending: 'Awaiting verification',
  'visit-booked': 'Site visit booked',
  verified: 'Verified',
  suspended: 'Suspended',
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <span className="badge" data-tone={verificationTone[status]}>
      <Icon name={status === 'verified' ? 'check-circle' : 'shield'} size={14} />
      {verificationLabel[status]}
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: NotificationChannel }) {
  const label = channel === 'push' ? 'App' : channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
  return (
    <span className="badge badge--quiet badge--sm">
      {label}
    </span>
  );
}
