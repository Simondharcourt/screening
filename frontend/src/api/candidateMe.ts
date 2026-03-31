import { fetchApiAuth } from './client';

export interface MyProfileResponse {
    id: string;
    profile: any;
    onboarding_complete: boolean;
    cv_url: string | null;
}

export interface ApplicationItem {
    id: string;
    status: string;
    call_status: string | null;
    compatibility_score: number | null;
    performance_score: number | null;
    created_at: string;
    job_postings: {
        id: string;
        title: string;
        source: string;
        external_url: string | null;
        status: string;
    } | null;
}

export const candidateMeApi = {
    getProfile: () => fetchApiAuth<MyProfileResponse>('/candidate/me'),
    getApplications: () => fetchApiAuth<ApplicationItem[]>('/candidate/applications'),
    claimSession: (sessionId: string) =>
        fetchApiAuth<{ claimed: boolean }>(`/onboarding/claim/${sessionId}`, { method: 'POST' }),
};
