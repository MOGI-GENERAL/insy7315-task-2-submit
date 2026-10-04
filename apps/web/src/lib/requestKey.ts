/** `crypto.randomUUID` needs HTTPS, and a phone testing against a laptop on the LAN has none */
export function newRequestKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
