import { fetchApi } from './client';

export interface JobGenerateRequest {
    title: string;
    bullet_points: string;
}

export interface JobGenerateResponse {
    description: string;
    questions: string[];
}

export const aiApi = {
    generateJob: (data: JobGenerateRequest) =>
        fetchApi<JobGenerateResponse>('/jobs/generate', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
};
