import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { jobsApi } from '../api/jobs'

export const Route = createFileRoute('/dashboard')({
    component: Dashboard,
})

function Dashboard() {
    const { data: jobs, isLoading, error } = useQuery({
        queryKey: ['jobs'],
        queryFn: jobsApi.getAll,
    })

    // Basic authentication flow handled elsewhere for now

    return (
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="md:flex md:items-center md:justify-between mb-8">
                <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                        Offres d'emploi
                    </h2>
                </div>
                <div className="mt-4 flex md:ml-4 md:mt-0">
                    <Link
                        to="/jobs/new"
                        className="ml-3 inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                        Nouvelle offre
                    </Link>
                </div>
            </div>

            {isLoading && <p className="text-gray-500">Chargement des offres...</p>}

            {error && (
                <div className="rounded-md bg-red-50 p-4 mb-4">
                    <h3 className="text-sm font-medium text-red-800">Erreur lors du chargement</h3>
                    <p className="mt-2 text-sm text-red-700">{error.message}</p>
                </div>
            )}

            {jobs && jobs.length === 0 && (
                <div className="text-center rounded-lg border-2 border-dashed border-gray-300 p-12">
                    <p className="text-sm font-semibold text-gray-900">Aucune offre</p>
                    <p className="mt-1 text-sm text-gray-500">Commencez par créer une nouvelle fiche de poste.</p>
                </div>
            )}

            {jobs && jobs.length > 0 && (
                <ul role="list" className="divide-y divide-gray-100 bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl">
                    {jobs.map((job) => (
                        <li key={job.id} className="relative flex justify-between gap-x-6 px-4 py-5 hover:bg-gray-50 sm:px-6">
                            <div className="flex min-w-0 gap-x-4">
                                <div className="min-w-0 flex-auto">
                                    <p className="text-sm font-semibold leading-6 text-gray-900">
                                        <Link to="/jobs/$jobId" params={{ jobId: job.id }}>
                                            <span className="absolute inset-0" />
                                            {job.title}
                                        </Link>
                                    </p>
                                    <p className="mt-1 flex text-xs leading-5 text-gray-500">
                                        Créée le {new Date(job.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-x-4">
                                <div className="hidden sm:flex sm:flex-col sm:items-end">
                                    <p className="text-sm leading-6 text-gray-900">{job.status}</p>
                                </div>
                                <svg className="h-5 w-5 flex-none text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                </svg>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
