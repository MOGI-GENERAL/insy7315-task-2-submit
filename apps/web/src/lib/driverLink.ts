/** 32 random bytes as base64url without padding, which is 43 characters */
export function mintDriverToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export const driverLink = (origin: string, token: string) => `${origin}/c/${token}`;

/** false when another dispatch got there first. the link this coordinator sent is then dead */
export function dispatchedByUs(
  result: { created: boolean; collection: { dispatchedByUserId: string; driverPhone: string } },
  request: { driverPhone: string },
  userId: string,
) {
  const { collection } = result;
  return (
    result.created ||
    (collection.dispatchedByUserId === userId && collection.driverPhone === request.driverPhone)
  );
}

export const mapsLink = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
