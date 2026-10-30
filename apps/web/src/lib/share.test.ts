import { describe, expect, test } from 'vitest';
import { emailLink, whatsAppLink } from './share';

const text =
  'FEDSA: Collection HTH7. Collect from Victoria Road, Woodstock (Riaan, +27000000001) by Tue & deliver.\nThanks';

describe('share links', () => {
  test('WhatsApp gets the number as bare digits', () => {
    expect(whatsAppLink('+27 82 123 4567', 'hi')).toBe('https://wa.me/27821234567?text=hi');
  });

  test('WhatsApp text survives encoding', () => {
    const url = new URL(whatsAppLink('+27000000031', text));
    expect(url.searchParams.get('text')).toBe(text);
  });

  test('email carries the subject and body and no address', () => {
    const link = emailLink('FEDSA collection HTH7', text);
    expect(link.startsWith('mailto:?subject=')).toBe(true);
    const params = new URLSearchParams(link.slice('mailto:?'.length));
    expect(params.get('subject')).toBe('FEDSA collection HTH7');
    expect(decodeURIComponent(link.split('&body=')[1] ?? '')).toBe(text);
  });
});
