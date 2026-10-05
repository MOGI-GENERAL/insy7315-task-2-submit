import type { PushSubscriptionRequest } from '@fedsa/contract';

/**
 * references:
 * - https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe - subscribing with the server's public key
 * - https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static - asking for permission from a tap
 * - https://web.dev/articles/push-notifications-permissions-ux - asking after an action, not on page load
 */

export type PushState = 'unsupported' | 'off' | 'on' | 'blocked';

/** whether this device has been offered push yet, and whether it said not now */
export type PromptState = 'shown' | 'dismissed' | null;

const PROMPT_KEY = 'fedsa.pushPrompt';

/** null in the dev server and in browsers without push, where no service worker registers */
async function registration() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const registered = await navigator.serviceWorker.getRegistration();
  return registered ? navigator.serviceWorker.ready : null;
}

export async function pushState(): Promise<PushState> {
  const reg = await registration();
  if (!reg) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

export async function currentSubscription() {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** the key arrives as base64url, and some older Android browsers accept only bytes */
function keyBytes(key: string) {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** asks for permission, then subscribes this browser. null when permission is refused */
export async function subscribeBrowser(key: string): Promise<PushSubscriptionRequest | null> {
  const reg = await registration();
  if (!reg) return null;
  if ((await Notification.requestPermission()) !== 'granted') return null;
  // subscribing again with a different key throws
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key),
    }));
  const { keys } = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: { p256dh: keys?.p256dh ?? '', auth: keys?.auth ?? '' },
  };
}

export function readPrompt(): PromptState {
  try {
    const stored = localStorage.getItem(PROMPT_KEY);
    return stored === 'shown' || stored === 'dismissed' ? stored : null;
  } catch {
    return null;
  }
}

export function savePrompt(prompt: 'shown' | 'dismissed') {
  try {
    localStorage.setItem(PROMPT_KEY, prompt);
  } catch {
    // private windows can refuse storage, and the card then shows again next time
  }
}
