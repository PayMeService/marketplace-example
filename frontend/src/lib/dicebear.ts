/**
 * Avatars and product art, generated from ids.
 *
 * Every image is derived from a seed rather than stored, so a user or a product
 * gets the same picture on every machine and in every environment with no
 * upload, no column and no bytes in the repo. The seed is always an id — never a
 * name — because a name can change and an id cannot, and a renamed shop that
 * silently becomes a different face reads as a bug.
 *
 * https://www.dicebear.com/how-to-use/http-api/
 */

const BASE = 'https://api.dicebear.com/10.x';

function build(style: string, seed: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ seed, ...params });
  return `${BASE}/${style}/svg?${query.toString()}`;
}

/**
 * A person: the signed-in user, a seller, a buyer on a sale.
 *
 * No `backgroundColor` — the API validates it against a hex pattern and rejects
 * the word "transparent" with a 400, and avataaars is already transparent.
 */
export function avatarUrl(seed: string): string {
  return build('avataaars', seed);
}

/**
 * A shop. Same generator as a person, on a tinted ground so a row of stores
 * reads as a set rather than as floating heads.
 */
export function storeAvatarUrl(seed: string): string {
  // One colour, not a list: the API validates each entry against a hex pattern
  // and a comma-joined string fails that check as a single value.
  return build('avataaars', seed, { backgroundColor: 'd6f2d6', radius: '50' });
}

/**
 * A product. Abstract shapes rather than a photo — this is a sandbox where the
 * listings are invented, and a stock photograph would imply a real catalogue.
 */
export function productImageUrl(seed: string): string {
  return build('shapes', seed);
}
