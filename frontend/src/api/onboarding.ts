import { API_BASE_URL } from './client'

export interface CandidateProfile {
  job_title_target: string
  experience_years?: number
  skills: string[]
  location_pref?: string
  remote_pref?: string
  salary_min?: number
  contract_type?: string
  aspirations?: string
  values: string[]
  preferred_sector: string[]
  preferred_team_size?: string
  dislikes?: string
  summary: string
  completion_score: number
}

export interface UploadResponse {
  session_id: string
  profile: CandidateProfile
  question: string | null
}

export interface AnswerResponse {
  profile: CandidateProfile
  question: string | null
  completion_score: number
  is_complete: boolean
}

export interface RankedJobResult {
  rank: number
  score: number
  job: {
    id: string
    title: string
    source: string
    external_url?: string
    description_snippet: string
  }
  strengths: string[]
  weaknesses: string[]
  justification: string
}

export type SSESearchEvent =
  | { type: 'phase'; id: number; label: string }
  | { type: 'jobs_found'; source: string; delta: number; total: number }
  | { type: 'search_done'; total: number }
  | { type: 'done' }
  | { type: 'error'; error: string }

export type SSERankEvent =
  | { type: 'phase'; id: number; label: string; total: number }
  | { type: 'job_ranked'; data: RankedJobResult }
  | { type: 'done'; total: number }
  | { type: 'error'; error: string }

export async function uploadCv(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}/onboarding/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Upload failed')
  }

  return response.json()
}

export async function submitAnswer(
  sessionId: string,
  answer: string
): Promise<AnswerResponse> {
  const response = await fetch(`${API_BASE_URL}/onboarding/answer/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to submit answer')
  }
  return response.json()
}

export async function skipOnboarding(sessionId: string): Promise<{ profile: CandidateProfile }> {
  const response = await fetch(`${API_BASE_URL}/onboarding/skip/${sessionId}`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Skip failed')
  }
  return response.json()
}

export async function patchProfile(
  sessionId: string,
  updates: Partial<CandidateProfile>
): Promise<{ profile: CandidateProfile }> {
  const response = await fetch(`${API_BASE_URL}/onboarding/profile/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Patch failed')
  }
  return response.json()
}

function openSSEStream(
  url: string,
  onEvent: (eventName: string, data: unknown) => void,
  onError?: (err: Error) => void
): () => void {
  const abortController = new AbortController()

  ;(async () => {
    try {
      const response = await fetch(url, { signal: abortController.signal })
      if (!response.ok || !response.body) throw new Error('SSE stream failed to connect')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let eventName = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7).trim()
          } else if (line.startsWith('data: ') && eventName) {
            try { onEvent(eventName, JSON.parse(line.slice(6))) } catch { /* ignore malformed JSON */ }
            eventName = ''
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') onError?.(err)
    }
  })()

  return () => abortController.abort()
}

export function openSearchStream(
  sessionId: string,
  onEvent: (event: SSESearchEvent) => void,
  onError?: (err: Error) => void
): () => void {
  return openSSEStream(
    `${API_BASE_URL}/onboarding/search-stream/${sessionId}`,
    (eventName, data) => {
      const d = data as Record<string, unknown>
      if (eventName === 'phase') onEvent({ type: 'phase', ...d } as SSESearchEvent)
      else if (eventName === 'jobs_found') onEvent({ type: 'jobs_found', ...d } as SSESearchEvent)
      else if (eventName === 'search_done') onEvent({ type: 'search_done', ...d } as SSESearchEvent)
      else if (eventName === 'done') onEvent({ type: 'done' })
      else if (eventName === 'error') onEvent({ type: 'error', ...d } as SSESearchEvent)
    },
    onError
  )
}

export function openRankStream(
  sessionId: string,
  onEvent: (event: SSERankEvent) => void,
  onError?: (err: Error) => void
): () => void {
  return openSSEStream(
    `${API_BASE_URL}/onboarding/rank-stream/${sessionId}`,
    (eventName, data) => {
      const d = data as Record<string, unknown>
      if (eventName === 'phase') onEvent({ type: 'phase', ...d } as SSERankEvent)
      else if (eventName === 'job_ranked') onEvent({ type: 'job_ranked', data: data as RankedJobResult })
      else if (eventName === 'done') onEvent({ type: 'done', ...d } as SSERankEvent)
      else if (eventName === 'error') onEvent({ type: 'error', ...d } as SSERankEvent)
    },
    onError
  )
}
