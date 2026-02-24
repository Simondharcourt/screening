import { fetchApi } from './client';

export interface Candidate {
    id: string;
    user_id?: string;
    name: string;
    email: string;
    phone?: string;
    profile_text?: string;
    cv_url?: string;
    created_at: string;
}

export interface Screening {
    id: string;
    job_posting_id: string;
    candidate_id: string;
    status: 'pending' | 'scheduled' | 'interviewed' | 'evaluated';
    compatibility_score?: number;
    performance_score?: number;
    created_at: string;
}

export interface CandidateWithScreening {
    candidate: Candidate;
    screening: Screening;
}

export const candidatesApi = {
    getByJobId: (jobId: string) => fetchApi<CandidateWithScreening[]>(`/candidates/by-job/${jobId}`),

    create: (jobId: string, formData: FormData) => {
        formData.append('job_posting_id', jobId);
        return fetchApi<CandidateWithScreening>('/candidates/', {
            method: 'POST',
            body: formData,
        });
    }
};
