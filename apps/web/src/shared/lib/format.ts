export const percent = (value: number, digits = 0): string =>
  `${(value * 100).toFixed(digits)}%`;

export const plural = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`;

/** "post_purchase_email" -> "Post-purchase email" */
export const humanise = (value: string): string => {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** "FreshCrate (meal kit)" -> "FreshCrate" */
export const shortProduct = (product: string): string =>
  product.replace(/\s*\(.*\)$/, '');

export const topEntries = (
  counts: Record<string, number>,
  limit = 3,
): [string, number][] =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);

const LANGUAGE_NAME: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  de: 'German',
  pt: 'Portuguese',
  fr: 'French',
  zh: 'Chinese',
};

export const languageName = (code: string): string =>
  LANGUAGE_NAME[code.toLowerCase()] ?? code.toUpperCase();

/**
 * True when the star rating points the opposite way to the extracted sentiment.
 * Worth flagging in the UI: it happens in roughly a quarter of this corpus.
 */
export const ratingContradictsText = (
  rating: number | null,
  sentiment: string | null,
): boolean => {
  if (rating === null || sentiment === null) return false;
  if (rating >= 4 && sentiment === 'negative') return true;
  return rating <= 2 && sentiment === 'positive';
};
