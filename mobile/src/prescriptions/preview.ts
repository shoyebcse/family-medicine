import type { PrescriptionItem } from './types';

export function reviewedCandidates(
  items: PrescriptionItem[],
  plans: Record<string, string>,
): PrescriptionItem[] {
  return items.filter((item) => !plans[item.id] && item.verified && item.schedule?.reviewed);
}

export function requireReviewedCandidates(
  items: PrescriptionItem[],
  plans: Record<string, string>,
): PrescriptionItem[] {
  const selected = reviewedCandidates(items, plans);
  if (!selected.length)
    throw new Error(
      items.some((item) => !plans[item.id])
        ? 'No medicines are reviewed yet. Complete the required fields in a medicine card, then click “I reviewed and confirm this medicine”. Its status must say Reviewed before previewing. Saving a draft alone does not confirm a medicine.'
        : 'These medicines already have saved plans. Add and review a new medicine to preview another schedule.',
    );
  return selected;
}
