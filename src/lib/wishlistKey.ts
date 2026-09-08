/**
 * A recommended bottle and a wishlist row are the same bottle when name and
 * producer match once trimmed and lowercased.
 *
 * Shared by the pairing screen and restaurant mode: both guard against
 * inserting a duplicate, and two copies of this rule would eventually disagree
 * about what counts as the same wine.
 */
export const wishlistKey = (name: string | null, producer: string | null) =>
  `${(name ?? "").trim().toLowerCase()}|${(producer ?? "").trim().toLowerCase()}`;
