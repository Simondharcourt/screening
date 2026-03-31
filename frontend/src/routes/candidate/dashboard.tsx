import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { supabase } from '../../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { candidateMeApi } from '../../api/candidateMe'
import { Badge } from '../../components/ui/Badge'
import { Briefcase, Clock, FileText, Phone } from 'lucide-react'

export const Route = createFileRoute('/candidate/dashboard')({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/candidate/login', search: { redirect: location.href } })
  },
  component: CandidateDashboard,
})

function CandidateDashboard() {
  const { data: applications, isLoading } = useQuery({
    queryKey: ['my-applications'],
    queryFn: candidateMeApi.getApplications,
  })

  // Group applications for UI (example logic)
  return (
    <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Espace Candidat</h1>
        <p className="text-gray-500 mt-2">Suivez vos candidatures et préparez vos entretiens IA.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 bg-surface-50/50">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary-600" />
            Mes candidatures
          </h2>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Chargement de vos candidatures...</div>
        ) : !applications || applications.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
              <FileText className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-base font-medium text-gray-900">Aucune candidature</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">Vous n'avez pas encore postulé à une offre. Découvrez nos offres disponibles pour démarrer.</p>
            <Link to="/jobs" className="mt-6 inline-flex items-center text-sm font-medium text-primary-600 bg-primary-50 px-4 py-2 rounded-lg hover:bg-primary-100 transition-colors">
              Voir les offres
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {applications.map((app) => (
              <div key={app.id} className="p-6 hover:bg-gray-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 group-hover:text-primary-600">
                    {app.job_postings ? app.job_postings.title : "Offre supprimée"}
                  </h3>
                  <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {new Date(app.created_at).toLocaleDateString()}
                    </span>
                    {app.job_postings?.source && (
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-xs font-medium">
                        Source: {app.job_postings.source}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full md:w-auto mt-4 md:mt-0">
                  <div className="flex flex-col gap-1.5 min-w-[140px]">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Statut Pipeline</span>
                    <Badge variant={app.status === 'interviewed' || app.status === 'evaluated' ? 'success' : 'primary'}>
                      {app.status === 'interviewing' ? 'Entretien en cours' : 
                       app.status === 'pending' ? 'En attente' : 
                       app.status === 'interviewed' ? 'Entretien terminé' : app.status}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-1.5 min-w-[140px]">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Statut Appel Vapi</span>
                    {app.call_status ? (
                        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 px-2 py-1 rounded-md shadow-sm">
                          <Phone className={`w-3.5 h-3.5 ${app.call_status === 'calling' || app.call_status === 'in-progress' ? 'text-primary-500 animate-pulse' : 'text-gray-400'}`} />
                          {app.call_status}
                        </div>
                    ) : (
                        <span className="text-sm text-gray-400">-</span>
                    )}
                  </div>

                  {app.compatibility_score !== null && (
                    <div className="flex flex-col gap-1.5 min-w-[100px] items-center">
                       <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Score</span>
                       <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold shadow-sm border
                            ${app.compatibility_score > 75 ? 'bg-green-50 text-green-700 border-green-200' :
                              app.compatibility_score > 40 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                              'bg-red-50 text-red-700 border-red-200'}`}>
                            {app.compatibility_score}
                        </div>
                    </div>
                  )}

                  {/* Bouton d'action si pas encore de call... */}
                  {(!app.call_status || app.call_status === 'ended') && app.job_postings?.source === 'internal' && (
                    <Link to="/candidate/coach" className="flex items-center justify-center bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition shadow-sm ml-auto">
                      Aller au Coach IA
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
