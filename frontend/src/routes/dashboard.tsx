import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { jobsApi } from '../api/jobs'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Plus, Briefcase, ChevronRight, Clock } from 'lucide-react'

export const Route = createFileRoute('/dashboard')({
    beforeLoad: async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw redirect({ to: '/' })
    },
    component: Dashboard,
})

function Dashboard() {
    const { data: jobs, isLoading, error } = useQuery({
        queryKey: ['jobs'],
        queryFn: jobsApi.getAll,
    })

    return (
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
            <div className="md:flex md:items-center md:justify-between mb-8">
                <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold leading-7 text-surface-900 sm:truncate sm:text-3xl sm:tracking-tight flex items-center gap-3">
                        <Briefcase className="w-8 h-8 text-primary-600" />
                        Offres d'emploi
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                        Gérez vos recrutements et consultez les candidats qualifiés.
                    </p>
                </div>
                <div className="mt-4 flex md:ml-4 md:mt-0">
                    <Link to="/jobs/new">
                        <Button className="gap-2">
                            <Plus className="w-4 h-4" />
                            Nouvelle offre
                        </Button>
                    </Link>
                </div>
            </div>

            {isLoading && (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="p-6 animate-pulse">
                            <div className="h-6 bg-gray-200 rounded w-2/3 mb-4"></div>
                            <div className="h-4 bg-gray-200 rounded w-1/3 mb-6"></div>
                            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                                <div className="h-8 bg-gray-200 rounded-full w-20"></div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6">
                    <h3 className="text-sm font-medium text-red-800">Erreur lors du chargement</h3>
                    <p className="mt-2 text-sm text-red-700">{error.message}</p>
                </div>
            )}

            {jobs && jobs.length === 0 && (
                <Card variant="glass" className="text-center p-12 border-dashed border-2 border-gray-300">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 mb-4">
                        <Briefcase className="h-6 w-6 text-primary-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">Aucune offre</h3>
                    <p className="mt-1 text-sm text-gray-500">Commencez par créer une nouvelle fiche de poste pour trouver des candidats.</p>
                    <div className="mt-6">
                        <Link to="/jobs/new">
                            <Button className="gap-2">
                                <Plus className="w-4 h-4" />
                                Nouvelle offre
                            </Button>
                        </Link>
                    </div>
                </Card>
            )}

            {jobs && jobs.length > 0 && (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {jobs.map((job) => (
                        <Link key={job.id} to='/jobs/$jobId' params={{ jobId: job.id }} className="group block focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-xl">
                            <Card className="h-full flex flex-col hover:shadow-lg transition-all duration-200 group-hover:border-primary-200 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="p-6 flex-1 flex flex-col">
                                    <div className="flex items-start justify-between">
                                        <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 group-hover:text-primary-700 transition-colors">
                                            {job.title}
                                        </h3>
                                        <Badge variant={job.status === 'active' ? 'success' : job.status === 'draft' ? 'warning' : 'default'} className="ml-2 shrink-0">
                                            {job.status === 'active' ? 'Active' : job.status === 'draft' ? 'Brouillon' : 'Fermée'}
                                        </Badge>
                                    </div>
                                    <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                                        {job.description || "Aucune description"}
                                    </p>

                                    <div className="mt-auto pt-6 flex items-center justify-between">
                                        <div className="flex items-center text-xs text-gray-500 gap-1.5">
                                            <Clock className="w-3.5 h-3.5" />
                                            {new Date(job.created_at).toLocaleDateString('fr-FR')}
                                        </div>
                                        <div className="flex items-center text-sm font-medium text-primary-600 group-hover:text-primary-700">
                                            Voir détails
                                            <ChevronRight className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
