import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { jobsApi } from '../../api/jobs'
import { candidatesApi } from '../../api/candidates'
import { matchingApi } from '../../api/matching'
import { vapiApi } from '../../api/vapi'
import Vapi from '@vapi-ai/web'

export const Route = createFileRoute('/jobs/$jobId')({
    component: JobDetail,
})

// Vapi requires the public key to initialize the Web SDK
// Let's use the explicit public key: "d37d7ab0-c2ee-4a18-844e-811435bc2b35" which is the user's API Key. 
// Actually, Vapi Web SDK needs the Public Key, not the Private API Key. 
// But since this is a prototype, we'll initialize it when the user clicks 'Appeler'

function JobDetail() {
    const { jobId } = Route.useParams()
    const queryClient = useQueryClient()
    const [showAddModal, setShowAddModal] = useState(false)
    const [analyzingCandidate, setAnalyzingCandidate] = useState<string | null>(null)
    const [scoreModalData, setScoreModalData] = useState<{ score: number, justification: string } | null>(null)

    // Vapi States
    const [callingCandidate, setCallingCandidate] = useState<string | null>(null)
    const [transcriptModalData, setTranscriptModalData] = useState<{ name: string, transcript: string, status: string } | null>(null)
    const [phoneInputCandidate, setPhoneInputCandidate] = useState<{ id: string, screeningId: string, name: string } | null>(null)

    // Instead of a phone number, we just need confirmation to start the web call
    const [isWebCallActive, setIsWebCallActive] = useState(false);
    const [vapiInstance, setVapiInstance] = useState<any>(null);

    useEffect(() => {
        // Initialize Vapi with the Public Key once
        // Handle Vite's ESM interop if Vapi module is exported under .default
        const VapiConstructor = (Vapi as any).default || Vapi;
        const v = new VapiConstructor("887f35e6-93e3-4643-bd9f-0a646c63dcb7");

        v.on('call-start', () => {
            setIsWebCallActive(true);
            setCallingCandidate(phoneInputCandidate?.id || null);
            setPhoneInputCandidate(null);
        });

        v.on('call-end', () => {
            setIsWebCallActive(false);
            setCallingCandidate(null);
            alert("L'appel web est terminé ! La transcription devrait arriver d'ici quelques secondes.");
            queryClient.invalidateQueries({ queryKey: ['candidates', jobId] });
        });

        v.on('error', (e: any) => {
            console.error("Vapi Web Error", e);
            alert("Erreur lors de l'appel web via le navigateur.");
            setIsWebCallActive(false);
            setCallingCandidate(null);
        });

        setVapiInstance(v);

        return () => {
            v.stop();
        };
    }, []);

    const scoreMutation = useMutation({
        mutationFn: matchingApi.scoreCandidate,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['candidates', jobId] })
            setScoreModalData(data)
            setAnalyzingCandidate(null)
        },
        onError: (err: any) => {
            alert(err.message || 'Erreur lors de l\'analyse')
            setAnalyzingCandidate(null)
        }
    })

    const handleAnalyze = (candidateId: string) => {
        setAnalyzingCandidate(candidateId)
        scoreMutation.mutate({ job_id: jobId, candidate_id: candidateId })
    }

    const callMutation = useMutation({
        // We no longer need a real phone number
        mutationFn: ({ screeningId }: { screeningId: string }) => vapiApi.triggerCall(screeningId, "+33600000000"),
        onSuccess: (data: any) => {
            // The backend now returns call_details: { assistant_id: "..." }
            if (data && data.call_details && data.call_details.assistant_id && vapiInstance) {
                // Start the WebRTC call in the browser directly to this temporary assistant
                vapiInstance.start(data.call_details.assistant_id);
            } else {
                alert("Erreur : Impossible de récupérer l'ID de l'assistant Vapi.");
                setCallingCandidate(null);
            }
        },
        onError: (err: any) => {
            alert(err.message || 'Erreur lors de l\'initialisation de l\'appel')
            setCallingCandidate(null)
        }
    })

    const handleCallSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (phoneInputCandidate && vapiInstance) {
            setCallingCandidate(phoneInputCandidate.id)
            callMutation.mutate({ screeningId: phoneInputCandidate.screeningId })
        }
    }

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
                                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Appel IA (Vapi)</th>
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
                                                    {wrapper.screening.compatibility_score !== null ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-gray-900">{wrapper.screening.compatibility_score}%</span>
                                                            <button
                                                                onClick={() => handleAnalyze(wrapper.candidate.id)}
                                                                disabled={analyzingCandidate === wrapper.candidate.id}
                                                                className="text-xs text-blue-600 hover:text-blue-500"
                                                            >
                                                                {analyzingCandidate === wrapper.candidate.id ? '(Analyse...)' : '(Réévaluer)'}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleAnalyze(wrapper.candidate.id)}
                                                            disabled={analyzingCandidate === wrapper.candidate.id}
                                                            className="text-blue-600 hover:text-blue-900 font-medium disabled:opacity-50"
                                                        >
                                                            {analyzingCandidate === wrapper.candidate.id ? 'Analyse...' : 'Analyser le profil'}
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                    {wrapper.screening.transcript ? (
                                                        <button
                                                            onClick={() => setTranscriptModalData({
                                                                name: wrapper.candidate.name,
                                                                transcript: wrapper.screening.transcript!,
                                                                status: wrapper.screening.call_status!
                                                            })}
                                                            className="text-blue-600 hover:text-blue-900 font-medium"
                                                        >
                                                            Voir l'entretien
                                                        </button>
                                                    ) : wrapper.screening.call_status === 'calling' || wrapper.screening.call_status === 'in-progress' || wrapper.screening.call_status === 'ringing' ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                                                Appel en cours...
                                                            </span>
                                                            {isWebCallActive && callingCandidate === wrapper.candidate.id ? (
                                                                <button
                                                                    onClick={() => vapiInstance?.stop()}
                                                                    className="text-xs text-red-600 hover:text-red-500 underline font-medium"
                                                                >
                                                                    (Raccrocher)
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => setPhoneInputCandidate({ id: wrapper.candidate.id, screeningId: wrapper.screening.id, name: wrapper.candidate.name })}
                                                                    disabled={callingCandidate === wrapper.candidate.id}
                                                                    className="text-xs text-blue-600 hover:text-blue-500 underline text-nowrap"
                                                                >
                                                                    (Relancer)
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setPhoneInputCandidate({ id: wrapper.candidate.id, screeningId: wrapper.screening.id, name: wrapper.candidate.name })}
                                                            disabled={callingCandidate === wrapper.candidate.id}
                                                            className="text-indigo-600 hover:text-indigo-900 font-medium disabled:opacity-50 flex items-center gap-1"
                                                        >
                                                            📞 Envoyer l'IA
                                                        </button>
                                                    )}
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

            {/* Score Details Modal */}
            {scoreModalData && (
                <div className="relative z-10" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
                    <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                            <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-xl sm:p-6">
                                <div>
                                    <h3 className="text-lg font-semibold leading-6 text-gray-900">Résultat de l'analyse IA</h3>
                                    <div className="mt-4">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="text-3xl font-bold text-blue-600">{scoreModalData.score}%</div>
                                            <div className="text-sm font-medium text-gray-500">Score de compatibilité</div>
                                        </div>
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{scoreModalData.justification}</p>
                                    </div>
                                </div>
                                <div className="mt-5 sm:mt-6">
                                    <button type="button" onClick={() => setScoreModalData(null)} className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">Fermer</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Phone Input Modal for Vapi */}
            {phoneInputCandidate && (
                <div className="relative z-10" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
                    <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                            <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md sm:p-6">
                                <form onSubmit={handleCallSubmit}>
                                    <h3 className="text-lg font-semibold leading-6 text-gray-900">Appeler {phoneInputCandidate.name}</h3>
                                    <div className="mt-4">
                                        <p className="mt-2 text-sm text-gray-500">
                                            L'Agent IA Vocale Vapi va démarrer un appel <strong>depuis votre navigateur</strong> concernant l'offre actuelle.
                                        </p>
                                        <p className="mt-2 text-xs text-gray-400">Assurez-vous d'avoir autorisé l'accès au microphone.</p>
                                    </div>
                                    <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                                        <button type="submit" disabled={callMutation.isPending || isWebCallActive} className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:col-start-2 disabled:opacity-50">
                                            {callMutation.isPending ? 'Lancement...' : isWebCallActive ? 'Appel en cours' : 'Démarrer l\'appel Web'}
                                        </button>
                                        <button type="button" onClick={() => setPhoneInputCandidate(null)} className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0">
                                            Annuler
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Transcript Modal */}
            {transcriptModalData && (
                <div className="relative z-10" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
                    <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                            <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-semibold leading-6 text-gray-900">Entretien: {transcriptModalData.name}</h3>
                                    <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                        Terminé
                                    </span>
                                </div>
                                <div className="mt-2 max-h-96 overflow-y-auto bg-gray-50 p-4 rounded-md border border-gray-100">
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{transcriptModalData.transcript}</p>
                                </div>
                                <div className="mt-5 sm:mt-6">
                                    <button type="button" onClick={() => setTranscriptModalData(null)} className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
                                        Fermer
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
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
