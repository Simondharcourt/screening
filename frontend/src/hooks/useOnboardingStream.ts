import { useState, useCallback, useRef } from 'react'
import {
  uploadCv as apiUploadCv,
  submitAnswers as apiSubmitAnswers,
  openSearchStream,
  openRankStream,
  type CandidateProfile,
  type RankedJobResult,
} from '../api/onboarding'

export type Phase = 'idle' | 'uploading' | 'profiling' | 'searching' | 'answering' | 'ranking' | 'results'

export interface OnboardingState {
  phase: Phase
  profile: CandidateProfile | null
  questions: string[]
  jobsTotal: number
  jobSources: Record<string, number>
  rankedJobs: RankedJobResult[]
  error: string | null
}

export function useOnboardingStream() {
  const [state, setState] = useState<OnboardingState>({
    phase: 'idle',
    profile: null,
    questions: [],
    jobsTotal: 0,
    jobSources: {},
    rankedJobs: [],
    error: null,
  })

  const sessionIdRef = useRef<string | null>(null)
  const closeSearchRef = useRef<(() => void) | null>(null)
  const closeRankRef = useRef<(() => void) | null>(null)

  const uploadCv = useCallback(async (file: File) => {
    setState(prev => ({ ...prev, phase: 'uploading', error: null }))
    try {
      const result = await apiUploadCv(file)
      sessionIdRef.current = result.session_id
      setState(prev => ({
        ...prev,
        phase: 'profiling',
        profile: result.profile,
        questions: result.questions,
      }))

      // Start search in background immediately (parallel with questions)
      closeSearchRef.current = openSearchStream(
        result.session_id,
        (event) => {
          if (event.type === 'jobs_found') {
            setState(prev => ({
              ...prev,
              // Transition to 'searching' on first job batch so counter appears
              phase: prev.phase === 'profiling' ? 'searching' : prev.phase,
              jobsTotal: event.total,
              jobSources: { ...prev.jobSources, [event.source]: (prev.jobSources[event.source] ?? 0) + event.delta },
            }))
          } else if (event.type === 'search_done') {
            // Phase stays as-is: CTA appears when questions.length === 0 AND phase === 'answering'
            // If user already submitted answers → they're already in 'answering', CTA shows
            // If user hasn't answered yet → phase is 'searching', CTA stays hidden until submitAnswers
            setState(prev => ({
              ...prev,
              phase: prev.questions.length === 0 ? 'answering' : prev.phase,
            }))
          }
        }
      )

    } catch (e: unknown) {
      setState(prev => ({ ...prev, phase: 'idle', error: e instanceof Error ? e.message : 'Erreur inattendue' }))
    }
  }, [])

  const submitAnswers = useCallback(async (answers: Record<string, string | number>) => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    try {
      await apiSubmitAnswers(sessionId, answers)
      setState(prev => ({ ...prev, questions: [], phase: 'answering' }))
    } catch (e: unknown) {
      setState(prev => ({ ...prev, error: e instanceof Error ? e.message : 'Erreur' }))
    }
  }, [])

  const startRanking = useCallback(() => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    setState(prev => ({ ...prev, phase: 'ranking', rankedJobs: [] }))
    closeRankRef.current = openRankStream(
      sessionId,
      (event) => {
        if (event.type === 'job_ranked') {
          setState(prev => ({ ...prev, rankedJobs: [...prev.rankedJobs, event.data] }))
        } else if (event.type === 'done') {
          setState(prev => ({ ...prev, phase: 'results' }))
        } else if (event.type === 'error') {
          setState(prev => ({ ...prev, error: event.error }))
        }
      }
    )
  }, [])

  const cleanup = useCallback(() => {
    closeSearchRef.current?.()
    closeRankRef.current?.()
  }, [])

  return { state, uploadCv, submitAnswers, startRanking, cleanup }
}
