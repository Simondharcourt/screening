import { fetchApi, API_BASE_URL } from './client';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ExtractedProfile {
    skills: string[];
    experience_years?: number;
    preferred_role?: string;
    location_pref?: string;
    summary?: string;
}

export interface ChatHistoryResponse {
    messages: ChatMessage[];
    profile?: ExtractedProfile;
}

export const chatApi = {
    getHistory: (sessionId: string) => fetchApi<ChatHistoryResponse>(`/chat/candidate/${sessionId}/history`),

    // Custom fetch function that uses fetch directly to handle streams (not wrapped by typical axios/fetch wrapper)
    streamMessage: async (
        sessionId: string,
        message: string,
        onToken: (token: string) => void,
        onProfileUpdate: (profile: ExtractedProfile) => void
    ) => {

        // We use standard fetch here to process the Response body as a reader stream
        const response = await fetch(`${API_BASE_URL}/chat/candidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, message })
        });

        if (!response.body) throw new Error("No readable stream");

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');

            // Keep the last incomplete part in the buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;

                const eventMatch = line.match(/^event:\s*(.*)/m);
                const dataMatch = line.match(/^data:\s*(.*)/m);

                if (dataMatch) {
                    const eventType = eventMatch ? eventMatch[1].trim() : 'message';
                    const dataStr = dataMatch[1].trim();

                    if (eventType === 'done') return;

                    try {
                        const data = JSON.parse(dataStr);

                        if (eventType === 'message' && data.token) {
                            onToken(data.token);
                        } else if (eventType === 'profile_update') {
                            onProfileUpdate(data);
                        } else if (eventType === 'error') {
                            throw new Error(data.error);
                        }
                    } catch (e) {
                        console.warn('Failed to parse SSE line:', dataStr);
                    }
                }
            }
        }
    }
};
