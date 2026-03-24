import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useOnboardingStream, type Phase } from '../../hooks/useOnboardingStream'
import { CvUploadZone } from '../../components/onboarding/CvUploadZone'
import { ProfilePanel } from '../../components/onboarding/ProfilePanel'
import { QuestionsPanel } from '../../components/onboarding/QuestionsPanel'
import { JobsCounter } from '../../components/onboarding/JobsCounter'
import { RankedJobCard } from '../../components/onboarding/RankedJobCard'

export const Route = createFileRoute('/candidate/onboarding')({
  component: CandidateOnboarding,
})

const PHASE_GRADIENTS: Record<Phase, string> = {
  idle:      'from-blue-700 via-blue-600 to-indigo-800',
  uploading: 'from-blue-700 via-blue-600 to-indigo-800',
  profiling: 'from-blue-600 via-indigo-600 to-blue-700',
  searching: 'from-indigo-600 via-purple-600 to-orange-500',
  answering: 'from-indigo-600 via-purple-600 to-orange-500',
  ranking:   'from-orange-500 via-red-500 to-rose-600',
  results:   'from-rose-600 via-red-600 to-orange-600',
}

const PHASE_TITLES: Record<Phase, string> = {
  idle:      'Déposez votre CV',
  uploading: 'Analyse en cours...',
  profiling: 'Profil extrait',
  searching: 'Recherche d\'offres en cours',
  answering: 'Quelques questions',
  ranking:   'Sélection des meilleures offres...',
  results:   'Vos offres personnalisées',
}

function CandidateOnboarding() {
  const { state, uploadCv, submitAnswers, startRanking, cleanup } = useOnboardingStream()
  
  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  const gradient = PHASE_GRADIENTS[state.phase]
  const showCounter = state.jobsTotal > 0
  const showStartRankingCta = state.phase === 'answering' && state.questions.length === 0

  return (
    <div className={`min-h-[calc(100vh-64px)] w-full bg-gradient-to-br ${gradient} transition-all duration-[1500ms] ease-in-out relative flex flex-col`}>
      {/* Subtle noise overlay */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPRI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20 pointer-events-none mix-blend-overlay" />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-12 flex-1 flex flex-col">

        {/* Header */}
        <div className="text-center mb-10 transition-all duration-500">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight drop-shadow-sm">
            {PHASE_TITLES[state.phase]}
          </h1>
          {state.phase === 'profiling' && (
            <p className="text-white/80 mt-3 text-lg font-medium animate-fade-in">
              La recherche d'offres démarre en arrière-plan pendant que vous répondez aux questions.
            </p>
          )}
          {(state.phase === 'searching' || state.phase === 'answering') && (
            <p className="text-white/80 mt-3 text-lg font-medium animate-fade-in">
              Nous explorons les offres en temps réel...
            </p>
          )}
          {state.phase === 'ranking' && (
            <p className="text-white/80 mt-3 text-lg font-medium animate-fade-in">
              Évaluation de {state.jobsTotal} offres avec l'IA...
            </p>
          )}
        </div>

        {/* Phase 1 — CV Upload */}
        {(state.phase === 'idle' || state.phase === 'uploading') && (
          <div className="flex-1 flex flex-col items-center justify-center -mt-12 animate-fade-in">
            <CvUploadZone onFileSelected={uploadCv} isUploading={state.phase === 'uploading'} />
          </div>
        )}

        {/* Phase 1→2 — Profile + Questions */}
        {state.profile && !['ranking', 'results'].includes(state.phase) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-stretch animate-slide-up">
            <div className="h-full">
              <ProfilePanel profile={state.profile} />
            </div>
            {state.questions.length > 0 && (
              <div className="h-full">
                <QuestionsPanel questions={state.questions} onSubmit={submitAnswers} />
              </div>
            )}
          </div>
        )}

        {/* Live counter */}
        {showCounter && (
          <JobsCounter
            total={state.jobsTotal}
            sources={state.jobSources}
            isSearching={state.phase === 'searching'}
          />
        )}

        {/* CTA: start ranking */}
        {showStartRankingCta && (
          <div className="text-center mt-8 animate-fade-in">
            <button
              onClick={startRanking}
              className="px-10 py-5 bg-white text-orange-600 font-extrabold rounded-2xl text-xl shadow-[0_20px_40px_rgba(0,0,0,0.2)] hover:shadow-[0_25px_50px_rgba(0,0,0,0.3)] hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer flex items-center justify-center gap-3 mx-auto"
            >
              Voir mes {state.jobsTotal} offres personnalisées 
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        )}

        {/* Phase 3 — Ranked jobs */}
        {state.rankedJobs.length > 0 && (
          <div className="mt-8 space-y-6">
            {state.phase === 'results' && (
              <h2 className="text-2xl font-bold text-white mb-6 text-center animate-fade-in">
                {state.rankedJobs.length} offres parfaitement alignées avec votre profil
              </h2>
            )}
            <div className="space-y-4">
              {state.rankedJobs.map((job, i) => (
                <RankedJobCard key={job.rank} job={job} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {state.error && (
          <div className="mt-8 p-4 bg-red-500/20 backdrop-blur-md border border-red-400/40 rounded-xl text-red-50 font-medium text-center shadow-lg animate-slide-up">
            Une erreur est survenue : {state.error}
          </div>
        )}
      </div>
    </div>
  )
}
