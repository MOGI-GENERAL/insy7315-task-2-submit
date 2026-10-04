/* STATUS BADGES: text label always accompanies colour, not colour-only */

import { Icon } from './Icon';
import type { IconName } from './Icon';
import { useT, statusKey, coldChainKey } from '../i18n/useT';
import type { StringKey } from '../i18n/strings';
import { isExpiringSoon } from '../lib/format';
import type {
  ColdChain,
  NotificationChannel,
  OfferStatus,
  OrganisationStatus,
} from '../store/types';

export function StatusBadge({ status, deadline }: { status: OfferStatus; deadline?: string }) {
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

const verificationTone: Record<OrganisationStatus, string> = {
  pending: 'expiring',
  verified: 'collected',
  rejected: 'expired',
  active: 'collected',
  suspended: 'expired',
};

const channelKey: Record<NotificationChannel, StringKey> = {
  in_app: 'notif.viaPush',
  push: 'notif.viaPush',
  whatsapp: 'notif.viaWhatsapp',
  sms: 'notif.viaSms',
};

export function VerificationBadge({ status }: { status: OrganisationStatus }) {
  const t = useT();
  const approved = status === 'verified' || status === 'active';
  return (
    <span className="badge" data-tone={verificationTone[status]}>
      <Icon name={approved ? 'check-circle' : 'shield'} size={14} />
      {t(`orgStatus.${status}`)}
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: NotificationChannel }) {
  const t = useT();
  return <span className="badge badge--quiet badge--sm">{t(channelKey[channel])}</span>;
}
