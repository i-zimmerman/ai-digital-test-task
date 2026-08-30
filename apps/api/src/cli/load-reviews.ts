import { RawReviewsSchema, type RawReview } from '@rs/contracts';
import { readFileSync } from 'node:fs';
import { dataPath } from '../lib/paths';

export function loadReviews(): RawReview[] {
  const file = dataPath('reviews.json');
  return RawReviewsSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
