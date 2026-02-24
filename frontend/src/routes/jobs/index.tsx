import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { jobsApi } from '../../api/jobs'
import type { JobPosting } from '../../api/jobs'
import { Briefcase, MapPin, Search, ArrowRight, Sparkles } from 'lucide-react'

export const Route = createFileRoute('/jobs/')({
  component: PublicJobsList,
})

function PublicJobsList() {

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['public-jobs'],
    queryFn: jobsApi.getAll,
  })

  const activeJobs = jobs?.filter((job: JobPosting) => job.status === 'active') || []

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Hero Section */}
      <div className="relative bg-surface-900 py-24 sm:py-32 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-900/40 to-indigo-900/40 mix-blend-multiply" />
          <div className="absolute top-0 right-0 -mr-[25%] w-[50%] h-full bg-gradient-to-bl from-primary-500/20 to-transparent blur-3xl" />
          <div className="absolute bottom-0 left-0 -ml-[25%] w-[50%] h-full bg-gradient-to-tr from-indigo-500/20 to-transparent blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 lg:px-8 text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white text-sm font-medium tracking-wide mb-8 backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-primary-300" />
            <span>Rejoignez des équipes d'exception</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl mb-6">
            Découvrez votre prochaine <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-indigo-400">aventure professionnelle</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-300 max-w-2xl mx-auto">
            Postulez en quelques clics et passez un premier entretien instantané avec notre IA de recrutement pour mettre en avant votre profil.
          </p>
        </div>
      </div>

      {/* Jobs List Section */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 -mt-16 relative z-10">

        <div className="glass-dark bg-white/80 backdrop-blur-xl rounded-2xl p-4 shadow-xl border border-white mb-12 flex items-center gap-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 shrink-0">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            placeholder="Rechercher une offre, une compétence..."
            className="flex-1 bg-transparent border-0 focus:ring-0 text-surface-900 placeholder:text-gray-400 text-lg outline-none"
          />
          <button className="hidden sm:block bg-surface-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-surface-800 transition-colors shadow-sm">
            Rechercher
          </button>
        </div>

        <div className="space-y-6">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={`skeleton-${i}`} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex gap-6 animate-pulse">
                <div className="w-16 h-16 bg-gray-200 rounded-xl shrink-0" />
                <div className="flex-1 space-y-4 py-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-5/6" />
                    <div className="h-3 bg-gray-200 rounded w-4/6" />
                  </div>
                </div>
              </div>
            ))
          ) : activeJobs.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 border-dashed">
              <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">Aucune offre disponible</h3>
              <p className="mt-2 text-gray-500">Revenez plus tard pour découvrir nos nouvelles opportunités.</p>
            </div>
          ) : (
            activeJobs.map((job: JobPosting, index: number) => (
              <div
                key={job.id}
                className="group bg-white rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-primary-100 flex flex-col sm:flex-row gap-6 items-start sm:items-center animate-fade-in"
                style={{ animationDelay: `${0.1 * index + 0.2}s` }}
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-50 to-indigo-50 border border-primary-100/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300">
                  <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-indigo-600">
                    {job.title.charAt(0)}
                  </span>
                </div>

                <div className="flex-1">
                  <h3 className="text-xl font-bold text-surface-900 group-hover:text-primary-600 transition-colors">
                    {job.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-y-2 gap-x-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      <span>Paris, France (Hybride)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Briefcase className="w-4 h-4" />
                      <span>Temps plein</span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-gray-600 line-clamp-2">
                    {job.description || "Découvrez cette opportunité en détails en cliquant sur postuler. Notre processus de recrutement démarre par un échange avec notre IA."}
                  </p>
                </div>

                <div className="w-full sm:w-auto mt-4 sm:mt-0">
                  <Link
                    to={'/jobs/$jobId/apply'}
                    params={{ jobId: job.id }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-surface-50 hover:bg-primary-50 text-surface-900 hover:text-primary-700 font-medium rounded-xl transition-colors border border-gray-200 hover:border-primary-200 group/btn"
                  >
                    Voir l'offre
                    <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
