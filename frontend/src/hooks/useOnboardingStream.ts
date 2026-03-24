import { useState, useCallback, useRef } from 'react'
import {
  uploadCv as apiUploadCv,
  submitAnswer as apiSubmitAnswer,
  skipOnboarding as apiSkipOnboarding,
  openSearchStream,
  openRankStream,
  type CandidateProfile,
  type RankedJobResult,
} from '../api/onboarding'

export type Phase = 'idle' | 'uploading' | 'profiling' | 'searching' | 'answering' | 'ranking' | 'results'

export interface OnboardingState {
  phase: Phase
  profile: CandidateProfile | null
  currentQuestion: string | null
  completionScore: number
  jobsTotal: number
  jobSources: Record<string, number>
  rankedJobs: RankedJobResult[]
  error: string | null
}

export function useOnboardingStream() {
  const [state, setState] = useState<OnboardingState>({
    phase: 'idle',
    profile: null,
    currentQuestion: null,
    completionScore: 0,
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
        currentQuestion: result.question,
        completionScore: result.profile.completion_score,
      }))

      // Start search in background immediately (parallel with questions)
      closeSearchRef.current = openSearchStream(
        result.session_id,
        (event) => {
          if (event.type === 'jobs_found') {
            setState(prev => ({
              ...prev,
              phase: prev.phase === 'profiling' ? 'searching' : prev.phase,
              jobsTotal: event.total,
              jobSources: { ...prev.jobSources, [event.source]: (prev.jobSources[event.source] ?? 0) + event.delta },
            }))
          } else if (event.type === 'search_done') {
            setState(prev => ({
              ...prev,
              phase: prev.currentQuestion === null ? 'answering' : prev.phase,
            }))
          }
        }
      )

    } catch (e: unknown) {
      setState(prev => ({ ...prev, phase: 'idle', error: e instanceof Error ? e.message : 'Erreur inattendue' }))
    }
  }, [])

  const submitAnswer = useCallback(async (answer: string) => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    setState(prev => ({ ...prev, error: null }))
    try {
      const result = await apiSubmitAnswer(sessionId, answer)
      setState(prev => ({
        ...prev,
        profile: result.profile,
        currentQuestion: result.question,
        completionScore: result.completion_score,
        phase: result.is_complete || !result.question ? 'answering' : prev.phase,
      }))
    } catch (e: unknown) {
      setState(prev => ({ ...prev, error: e instanceof Error ? e.message : 'Erreur' }))
    }
  }, [])

  const skipOnboarding = useCallback(async () => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    try {
      await apiSkipOnboarding(sessionId)
    } catch (e: unknown) {
      setState(prev => ({ ...prev, error: e instanceof Error ? e.message : 'Erreur' }))
    } finally {
      setState(prev => ({ ...prev, currentQuestion: null, phase: 'answering' }))
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

  return { state, uploadCv, submitAnswer, skipOnboarding, startRanking, cleanup }
}
