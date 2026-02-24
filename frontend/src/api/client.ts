export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers = {
        'Content-Type': 'application/json',
        ...options?.headers,
    };

    // If body is FormData, don't set Content-Type manually so browser sets boundary
    if (options?.body instanceof FormData) {
        // We cast to any to delete the property safely in TypeScript
        delete (headers as any)['Content-Type'];
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `API Error: ${response.statusText}`);
    }

    return response.json();
}
