import { fetchApi } from './client';

export interface MatchScoreRequest {
    job_id: string;
    candidate_id: string;
}

export interface MatchScoreResponse {
    score: number;
    justification: string;
}

export const matchingApi = {
    scoreCandidate: (data: MatchScoreRequest) =>
        fetchApi<MatchScoreResponse>('/matching/score', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    getRecommendations: (jobId: string) =>
        fetchApi<{ recommendations: any[] }>(`/matching/job/${jobId}/recommendations`)
};
