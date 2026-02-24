import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { jobsApi } from '../../api/jobs'
import { candidatesApi } from '../../api/candidates'

export const Route = createFileRoute('/jobs/$jobId')({
    component: JobDetail,
})

function JobDetail() {
    const { jobId } = Route.useParams()
    const queryClient = useQueryClient()
    const [showAddModal, setShowAddModal] = useState(false)

    const { data: job, isLoading: jobLoading } = useQuery({
        queryKey: ['job', jobId],
        queryFn: () => jobsApi.getById(jobId),
    })

    const { data: candidates, isLoading: candidatesLoading } = useQuery({
        queryKey: ['candidates', jobId],
        queryFn: () => candidatesApi.getByJobId(jobId),
    })

    if (jobLoading) return <div className="p-8">Chargement de l'offre...</div>
    if (!job) return <div className="p-8">Offre introuvable.</div>

    return (
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* Header */}
            <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl p-6">
                <div className="md:flex md:items-center md:justify-between">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                            {job.title}
                        </h2>
                        <div className="mt-1 flex flex-col sm:mt-0 sm:flex-row sm:flex-wrap sm:space-x-6">
                            <div className="mt-2 flex items-center text-sm text-gray-500">
                                Statut: <span className="ml-1 font-medium text-gray-900">{job.status}</span>
                            </div>
                            <div className="mt-2 flex items-center text-sm text-gray-500">
                                Créée le {new Date(job.created_at).toLocaleDateString()}
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 flex md:ml-4 md:mt-0">
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                            {candidates?.length || 0} Candidat(s)
                        </span>
                    </div>
                </div>

                <div className="mt-6 border-t border-gray-100 pt-6">
                    <h3 className="text-sm font-medium leading-6 text-gray-900">Description</h3>
                    <p className="mt-2 text-sm text-gray-500 whitespace-pre-wrap">{job.description}</p>
                </div>

                <div className="mt-6 border-t border-gray-100 pt-6">
                    <h3 className="text-sm font-medium leading-6 text-gray-900">Questions de screening ({job.questions.length})</h3>
                    <ul className="mt-2 list-disc pl-5 text-sm text-gray-500 space-y-1">
                        {job.questions.map((q, i) => (
                            <li key={i}>{q}</li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Candidates List */}
            <div>
                <div className="sm:flex sm:items-center">
                    <div className="sm:flex-auto">
                        <h2 className="text-base font-semibold leading-6 text-gray-900">Candidats</h2>
                        <p className="mt-2 text-sm text-gray-700">Liste des candidats positionnés sur cette offre.</p>
                    </div>
                    <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
                        <button
                            type="button"
                            onClick={() => setShowAddModal(true)}
                            className="block rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                            Ajouter un candidat
                        </button>
                    </div>
                </div>

                {candidatesLoading && <div className="mt-6 text-sm text-gray-500">Chargement des candidats...</div>}

                {!candidatesLoading && candidates && candidates.length === 0 && (
                    <div className="mt-6 text-center rounded-lg border-2 border-dashed border-gray-300 p-12 bg-white">
                        <p className="text-sm font-semibold text-gray-900">Aucun candidat</p>
                        <p className="mt-1 text-sm text-gray-500">Ajoutez le premier candidat manuellement.</p>
                    </div>
                )}

                {!candidatesLoading && candidates && candidates.length > 0 && (
                    <div className="mt-8 flow-root">
                        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                                <table className="min-w-full divide-y divide-gray-300">
                                    <thead>
                                        <tr>
                                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">Nom</th>
                                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Statut</th>
                                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Score de Compatibilité</th>
                                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">CV</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {candidates.map((wrapper) => (
                                            <tr key={wrapper.candidate.id}>
                                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                                                    <div className="flex flex-col">
                                                        <span>{wrapper.candidate.name}</span>
                                                        <span className="text-gray-500 font-normal">{wrapper.candidate.email}</span>
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${wrapper.screening.status === 'pending' ? 'bg-yellow-50 text-yellow-800 ring-yellow-600/20' :
                                                            'bg-gray-50 text-gray-600 ring-gray-500/10'
                                                        }`}>
                                                        {wrapper.screening.status}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                    {wrapper.screening.compatibility_score !== null ? `${wrapper.screening.compatibility_score}%` : 'N/A'}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                    {wrapper.candidate.cv_url ? (
                                                        <a href={wrapper.candidate.cv_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-900 underline">
                                                            Voir
                                                        </a>
                                                    ) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Add Candidate Modal */}
            {showAddModal && <AddCandidateModal jobId={jobId} onClose={() => setShowAddModal(false)} onSuccess={() => queryClient.invalidateQueries({ queryKey: ['candidates', jobId] })} />}
        </div>
    )
}

function AddCandidateModal({ jobId, onClose, onSuccess }: { jobId: string, onClose: () => void, onSuccess: () => void }) {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [cv, setCv] = useState<File | null>(null)
    const [errorMsg, setErrorMsg] = useState('')

    const addMutation = useMutation({
        mutationFn: (formData: FormData) => candidatesApi.create(jobId, formData),
        onSuccess: () => {
            onSuccess()
            onClose()
        },
        onError: (err: any) => setErrorMsg(err.message || 'Erreur lors de l\'ajout')
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMsg('')
        const formData = new FormData()
        formData.append('name', name)
        formData.append('email', email)
        if (cv) {
            formData.append('cv', cv)
        }
        addMutation.mutate(formData)
    }

    return (
        <div className="relative z-10" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
            <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                    <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">

                        <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                            <button type="button" onClick={onClose} className="rounded-md bg-white text-gray-400 border-none hover:text-gray-500 outline-none">
                                <span className="sr-only">Close</span>
                                ✕
                            </button>
                        </div>

                        <div>
                            <h3 className="text-base font-semibold leading-6 text-gray-900" id="modal-title">Ajouter un candidat</h3>
                            <div className="mt-2">
                                <p className="text-sm text-gray-500">Ajout du candidat pour l'évaluation. Un CV est fortement recommandé.</p>
                            </div>

                            {errorMsg && <p className="mt-2 text-sm text-red-600">{errorMsg}</p>}

                            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Nom Complet</label>
                                    <input type="text" required value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600 sm:text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Email</label>
                                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600 sm:text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">CV au format PDF (Optionnel)</label>
                                    <input type="file" accept="application/pdf" onChange={e => setCv(e.target.files?.[0] || null)} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                                </div>

                                <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                                    <button type="submit" disabled={addMutation.isPending} className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:col-start-2 disabled:opacity-50">
                                        {addMutation.isPending ? 'Ajout...' : 'Ajouter'}
                                    </button>
                                    <button type="button" onClick={onClose} className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0">
                                        Annuler
                                    </button>
                                </div>
                            </form>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
