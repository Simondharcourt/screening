import { fetchApi } from './client';

export const vapiApi = {
    triggerCall: (screeningId: string, phoneNumber: string) =>
        fetchApi<{ status: string, call_details: any }>(`/vapi/screenings/${screeningId}/call`, {
            method: 'POST',
            body: JSON.stringify({ phone_number: phoneNumber }),
        }),
};
