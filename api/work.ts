/**
 * Cliente del servicio Buscar Work (bolsa de empleo) — backend unificado.
 * Base ABSOLUTA: vive en /api/work/* (como intercity).
 * Forma normalizada que consume filterJobs/sortJobs del kit.
 */

import { http } from './httpClient';

import { API_HOST } from './config';
export const WORK_API = `${API_HOST}/api`;
const w = (p: string) => `${WORK_API}${p}`;

export interface WorkRecruiter { name: string | null; role: string | null; avatarColor: string | null; phone: string | null; }
export interface WorkJob {
  id: string; title: string; company: string; companyLogo?: string | null; companyColor: string;
  companyVerified: boolean; applicantsCount: number;
  city: string; cityId: string; location?: string | null; zone?: string | null;
  coordinates: { latitude: number | null; longitude: number | null };
  salaryMin: number; salaryMax: number; salary: string;
  contractType: string; contractLabel: string; category: string; experienceRequired: number;
  benefits: string[]; responsibilities: string[]; requirements: string[];
  description: string; isNew: boolean; isUrgent: boolean;
  isFeatured: boolean; featuredUntil?: string | null;
  distance?: string | null; publishedAt: string; expiresAt?: string | null; status: string;
  bookmarked: boolean; applied: boolean; recruiter: WorkRecruiter;
  similar?: WorkJob[];
  applicants?: Array<{ id: string; fullName?: string | null; phone?: string | null; documentType?: string | null; documentNumber?: string | null; note?: string | null; status: string; createdAt: string }>;
}
export interface WorkCatalog { categories: Array<{ id: string; label: string }>; cities: Array<{ id: string; label: string }>; contractTypes: Record<string, string>; }

export interface WorkPlan {
  planCode: string; planName: string; offerLimit: number; activeJobs: number; expiresAt: string | null;
}

export interface WorkFilters {
  categories?: string[]; cities?: string[]; contractTypes?: string[]; benefits?: string[];
  salaryMin?: number; salaryMax?: number; experience?: number; distance?: number;
  verifiedOnly?: boolean; urgentOnly?: boolean; q?: string;
}

export const workApi = {
  catalog: () => http.get<WorkCatalog>(w('/work/catalog'), false),
  jobs: (f: WorkFilters = {}) => {
    const p: Record<string, string> = {};
    if (f.categories?.length) p.categories = f.categories.join(',');
    if (f.cities?.length) p.cities = f.cities.join(',');
    if (f.contractTypes?.length) p.contractTypes = f.contractTypes.join(',');
    if (f.benefits?.length) p.benefits = f.benefits.join(',');
    if (f.salaryMin != null) p.salaryMin = String(f.salaryMin);
    if (f.salaryMax != null) p.salaryMax = String(f.salaryMax);
    if (f.experience != null) p.experience = String(f.experience);
    if (f.verifiedOnly) p.verifiedOnly = 'true';
    if (f.urgentOnly) p.urgentOnly = 'true';
    if (f.q) p.q = f.q;
    const qs = new URLSearchParams(p).toString();
    return http.get<WorkJob[]>(w(`/work/jobs${qs ? '?' + qs : ''}`), true);
  },
  job: (id: string) => http.get<WorkJob>(w(`/work/jobs/${id}`), true),
  similar: (id: string) => http.get<WorkJob[]>(w(`/work/jobs/${id}/similar`), true),
  myJobs: () => http.get<WorkJob[]>(w('/work/my-jobs'), true),
  myPlan: () => http.get<WorkPlan>(w('/work/me/plan'), true),
  create: (body: Record<string, unknown>) => http.post<{ message: string; job: WorkJob }>(w('/work/jobs'), body, true),
  update: (id: string, body: Record<string, unknown>) => http.put<{ message: string }>(w(`/work/jobs/${id}`), body, true),
  close: (id: string) => http.put<{ message: string }>(w(`/work/jobs/${id}/close`), {}, true),
  duplicate: (id: string) => http.post<{ message: string; job: WorkJob }>(w(`/work/jobs/${id}/duplicate`), {}, true),
  bookmark: (id: string) => http.post<{ message: string; bookmarked: boolean }>(w(`/work/jobs/${id}/bookmark`), {}, true),
  apply: (id: string, note?: string) => http.post<{ message: string }>(w(`/work/jobs/${id}/apply`), { note }, true),
  selectApplicant: (appId: string, status: 'selected' | 'rejected') =>
    http.put<{ message: string }>(w(`/work/applications/${appId}/status`), { status }, true),
  report: (id: string, reason?: string, note?: string) =>
    http.post<{ message: string }>(w(`/work/jobs/${id}/report`), { reason, note }, true),
};
