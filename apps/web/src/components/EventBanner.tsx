/* LAST-ACTION OUTCOME BANNER (shown on next screen after any reducer event) */

import { Banner } from './ui';
import type { BannerTone } from './ui';
import { useApp } from '../store/context';

const toneByKind: Record<string, BannerTone> = {
  'claim-rejected': 'bad',
  'claim-made': 'good',
  'claim-released': 'warn',
  'offer-posted': 'good',
  'offer-cancelled': 'warn',
  'handover-donor': 'good',
  'handover-complete': 'good',
  'driver-dispatched': 'good',
  verification: 'good',
  'note-saved': 'good',
  'dispute-resolved': 'good',
  'certificate-issued': 'good',
  'account-toggled': 'warn',
};

export function EventBanner() {
  const { state, dispatch } = useApp();
  const event = state.lastEvent;
  if (!event) return null;

  return (
    <Banner
      tone={toneByKind[event.kind] ?? 'info'}
      onDismiss={() => dispatch({ type: 'CLEAR_EVENT' })}
    >
      {event.message}
    </Banner>
  );
}
