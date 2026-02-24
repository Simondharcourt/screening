import { fetchApi } from './client';

export interface JobPosting {
    id: string;
    recruiter_id?: string;
    title: string;
    description: string;
    questions: string[];
    status: 'draft' | 'active' | 'closed';
    created_at: string;
}

export type JobPostingCreate = Pick<JobPosting, 'title' | 'description' | 'questions'>;

export const jobsApi = {
    getAll: () => fetchApi<JobPosting[]>('/jobs/'),

    getById: (id: string) => fetchApi<JobPosting>(`/jobs/${id}`),

    create: (data: JobPostingCreate) =>
        fetchApi<JobPosting>('/jobs/', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Partial<JobPostingCreate>) =>
        fetchApi<JobPosting>(`/jobs/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
};
