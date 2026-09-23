/**
 * Ordenación client-side del set YA filtrado por el servidor.
 */
import type { WorkJob } from '../api/work';
import type { SortKey } from '../components/jobs';

export function sortJobs(jobs: WorkJob[], by: SortKey): WorkJob[] {
  const copy = [...jobs];
  if (by === 'salary') return copy.sort((a, b) => (b.salaryMax ?? 0) - (a.salaryMax ?? 0));
  if (by === 'distance') return copy.sort((a, b) => parseFloat(a.distance ?? '99') - parseFloat(b.distance ?? '99'));
  return copy.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}
