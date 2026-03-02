import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { jobsApi } from '../../api/jobs'
import { candidatesApi } from '../../api/candidates'
import { matchingApi } from '../../api/matching'
import { vapiApi } from '../../api/vapi'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Input'
import Vapi from '@vapi-ai/web'
import {
    Users,
    ArrowLeft,
    Clock,
    FileText,
    MessageSquare,
    Phone,
    Plus,
    X,
    CheckCircle2,
    Briefcase,
    Sparkles,
    AlertCircle,
    UserPlus,
    ExternalLink
} from 'lucide-react'

export const Route = createFileRoute('/jobs/$jobId')({
    component: JobDetail,
})

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

    // Web Call States
    const [isWebCallActive, setIsWebCallActive] = useState(false);
    const [vapiInstance, setVapiInstance] = useState<any>(null);

    useEffect(() => {
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
            // Refresh candidates to get transcript
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
        mutationFn: ({ screeningId }: { screeningId: string }) => vapiApi.triggerCall(screeningId, "+33600000000"),
        onSuccess: (data: any) => {
            if (data && data.call_details && data.call_details.assistant_id && vapiInstance) {
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

    if (jobLoading) return (
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 flex flex-col items-center justify-center mt-20">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-500 font-medium">Chargement de l'offre...</p>
        </div>
    )

    if (!job) return (
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 flex items-start">
                <AlertCircle className="w-6 h-6 text-red-500 mr-3 shrink-0" />
                <div>
                    <h3 className="text-base font-medium text-red-800">Offre introuvable</h3>
                    <p className="mt-2 text-sm text-red-700">L'offre que vous cherchez n'existe pas ou a été supprimée.</p>
                    <div className="mt-4">
                        <Link to="/dashboard">
                            <Button variant="outline" size="sm">Retour au dashboard</Button>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )

    return (
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
            {/* Navigation back */}
            <Link to="/dashboard" className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Retour aux offres
            </Link>

            {/* Header / Stats row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Main Info Card */}
                <Card className="lg:col-span-2 p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <Badge variant={job.status === 'active' ? 'success' : job.status === 'draft' ? 'warning' : 'default'} className="text-sm px-3 py-1">
                                {job.status === 'active' ? 'Active' : job.status === 'draft' ? 'Brouillon' : 'Fermée'}
                            </Badge>
                            <span className="flex items-center text-sm text-gray-500">
                                <Clock className="w-4 h-4 mr-1.5" />
                                Créée le {new Date(job.created_at).toLocaleDateString()}
                            </span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
                            {job.title}
                        </h1>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-4 pt-6 border-t border-gray-100">
                        <div className="flex items-center text-green-700 bg-green-50 px-3 py-1.5 rounded-lg text-sm font-medium border border-green-100">
                            <Users className="w-4 h-4 mr-2" />
                            {candidates?.length || 0} Candidats
                        </div>
                        <div className="flex items-center text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-medium border border-blue-100">
                            <MessageSquare className="w-4 h-4 mr-2" />
                            {job.questions.length} Questions
                        </div>
                    </div>
                </Card>

                {/* Questions Preview Card */}
                <Card className="p-6 bg-surface-50 border-gray-200">
                    <h3 className="font-semibold text-gray-900 flex items-center mb-4">
                        <MessageSquare className="w-4 h-4 mr-2 text-primary-600" />
                        Trame de l'Agent IA
                    </h3>
                    <ul className="space-y-3">
                        {job.questions.slice(0, 3).map((q, i) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                <div className="mt-0.5 w-4 h-4 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                                    {i + 1}
                                </div>
                                <span>{q}</span>
                            </li>
                        ))}
                    </ul>
                    {job.questions.length > 3 && (
                        <p className="text-xs text-gray-500 mt-3 font-medium text-center">
                            + {job.questions.length - 3} autres questions
                        </p>
                    )}
                </Card>
            </div>

            {/* Content Tabs (Description vs Candidates) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200">
                    <nav className="flex -mb-px px-6">
                        <div className="border-b-2 border-primary-500 py-4 px-1 text-sm font-semibold text-primary-600 flex items-center mr-8">
                            <Users className="w-4 h-4 mr-2" />
                            Candidats
                            <Badge variant="primary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full text-xs">
                                {candidates?.length || 0}
                            </Badge>
                        </div>
                        <div className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center">
                            <FileText className="w-4 h-4 mr-2" />
                            Description du poste
                        </div>
                    </nav>
                </div>

                <div className="p-6">
                    {/* Header for candidates section */}
                    <div className="sm:flex sm:items-center justify-between mb-6">
                        <div>
                            <p className="text-sm text-gray-500">Gérez les candidats, analysez leur profil et lancez des entretiens vocaux avec l'IA.</p>
                        </div>
                        <div className="mt-4 sm:ml-16 sm:mt-0 flex space-x-3">
                            <Button
                                onClick={() => setShowAddModal(true)}
                                className="gap-2"
                            >
                                <UserPlus className="w-4 h-4" />
                                Ajouter un candidat
                            </Button>
                        </div>
                    </div>

                    {candidatesLoading && (
                        <div className="py-12 text-center text-gray-500">Chargement des candidats...</div>
                    )}

                    {!candidatesLoading && candidates && candidates.length === 0 && (
                        <div className="text-center rounded-xl border-2 border-dashed border-gray-300 py-16 px-6 bg-gray-50">
                            <div className="mx-auto w-12 h-12 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-gray-100">
                                <Users className="w-6 h-6 text-gray-400" />
                            </div>
                            <h3 className="text-base font-semibold text-gray-900">Aucun candidat</h3>
                            <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
                                Vous n'avez pas encore de candidat pour cette offre. Ajoutez manuellement le premier ou attendez des candidatures entrantes.
                            </p>
                            <div className="mt-6">
                                <Button onClick={() => setShowAddModal(true)} variant="outline">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Ajouter un candidat
                                </Button>
                            </div>
                        </div>
                    )}

                    {!candidatesLoading && candidates && candidates.length > 0 && (
                        <div className="ring-1 ring-gray-200 rounded-xl overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="py-3.5 pl-6 pr-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Candidat</th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Matching IA</th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Entretien IA (Vapi)</th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">CV</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {candidates.map((wrapper) => (
                                        <tr key={wrapper.candidate.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm">
                                                <div className="flex items-center">
                                                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 flex items-center justify-center font-bold text-gray-600">
                                                        {wrapper.candidate.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className="font-medium text-gray-900">{wrapper.candidate.name}</div>
                                                        <div className="text-gray-500 text-xs">{wrapper.candidate.email}</div>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                                                {wrapper.screening.compatibility_score !== null ? (
                                                    <div className="flex items-center group cursor-pointer" onClick={() => handleAnalyze(wrapper.candidate.id)}>
                                                        <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold shadow-sm border
                                                            ${wrapper.screening.compatibility_score > 75 ? 'bg-green-50 text-green-700 border-green-200' :
                                                                wrapper.screening.compatibility_score > 40 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                                                    'bg-red-50 text-red-700 border-red-200'}`}>
                                                            {wrapper.screening.compatibility_score}
                                                        </div>
                                                        <Sparkles className="w-4 h-4 ml-2 text-gray-300 group-hover:text-primary-500 transition-colors" />
                                                    </div>
                                                ) : (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleAnalyze(wrapper.candidate.id)}
                                                        disabled={analyzingCandidate === wrapper.candidate.id}
                                                        className="h-8 shadow-none"
                                                    >
                                                        {analyzingCandidate === wrapper.candidate.id ? (
                                                            <><div className="w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mr-2" /> Analyse...</>
                                                        ) : (
                                                            <><Sparkles className="w-3.5 h-3.5 mr-1.5 text-primary-600" /> Évaluer profil</>
                                                        )}
                                                    </Button>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                                                {wrapper.screening.transcript ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setTranscriptModalData({
                                                            name: wrapper.candidate.name,
                                                            transcript: wrapper.screening.transcript!,
                                                            status: wrapper.screening.call_status!
                                                        })}
                                                        className="text-primary-700 bg-primary-50 hover:bg-primary-100"
                                                    >
                                                        <FileText className="w-4 h-4 mr-2" />
                                                        Voir l'entretien
                                                    </Button>
                                                ) : wrapper.screening.call_status === 'calling' || wrapper.screening.call_status === 'in-progress' || wrapper.screening.call_status === 'ringing' ? (
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="primary" className="animate-pulse">
                                                            <Phone className="w-3 h-3 mr-1" />
                                                            En cours
                                                        </Badge>
                                                        {isWebCallActive && callingCandidate === wrapper.candidate.id ? (
                                                            <button
                                                                onClick={() => vapiInstance?.stop()}
                                                                className="text-xs text-red-600 hover:text-red-800 underline font-medium"
                                                            >
                                                                Raccrocher
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                ) : (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setPhoneInputCandidate({ id: wrapper.candidate.id, screeningId: wrapper.screening.id, name: wrapper.candidate.name })}
                                                        disabled={callingCandidate === wrapper.candidate.id}
                                                        className="h-8 shadow-none text-gray-700"
                                                    >
                                                        <Phone className="w-3.5 h-3.5 mr-1.5" />
                                                        Entretien IA
                                                    </Button>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                                {wrapper.candidate.cv_url ? (
                                                    <a
                                                        href={wrapper.candidate.cv_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center justify-center p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                                                        title="Ouvrir le CV"
                                                    >
                                                        <ExternalLink className="w-5 h-5" />
                                                    </a>
                                                ) : (
                                                    <span className="text-gray-300 text-xs">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals Follow Below */}
            {/* Add Candidate Modal */}
            {showAddModal && <AddCandidateModal jobId={jobId} onClose={() => setShowAddModal(false)} onSuccess={() => queryClient.invalidateQueries({ queryKey: ['candidates', jobId] })} />}

            {/* Score Details Modal */}
            {scoreModalData && (
                <div className="relative z-50">
                    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"></div>
                    <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                            <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-xl">
                                <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                                    <div className="sm:flex sm:items-start">
                                        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                                            <Sparkles className="h-5 w-5 text-blue-600" aria-hidden="true" />
                                        </div>
                                        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                                            <h3 className="text-lg font-semibold leading-6 text-gray-900">Résultat de l'analyse I.A.</h3>
                                            <div className="mt-6 flex justify-center sm:justify-start">
                                                <div className="flex flex-col items-center">
                                                    <div className={`text-4xl font-black ${scoreModalData.score > 75 ? 'text-green-600' :
                                                            scoreModalData.score > 40 ? 'text-yellow-600' :
                                                                'text-red-600'
                                                        }`}>
                                                        {scoreModalData.score}%
                                                    </div>
                                                    <span className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-widest">Match</span>
                                                </div>
                                            </div>
                                            <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-100">
                                                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Analyse détaillée</h4>
                                                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{scoreModalData.justification}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                                    <Button onClick={() => setScoreModalData(null)}>
                                        Compris
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Phone Input Modal for Vapi */}
            {phoneInputCandidate && (
                <div className="relative z-50">
                    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"></div>
                    <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                            <div className="relative transform overflow-hidden rounded-xl bg-white px-4 pb-4 pt-5 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md sm:p-6">
                                <form onSubmit={handleCallSubmit}>
                                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 mb-4">
                                        <Phone className="h-6 w-6 text-indigo-600" />
                                    </div>
                                    <h3 className="text-lg font-bold text-center leading-6 text-gray-900">Entretien avec {phoneInputCandidate.name}</h3>
                                    <div className="mt-2 text-center">
                                        <p className="text-sm text-gray-500">
                                            L'Agent IA Vocale Vapi va démarrer un appel <strong>depuis votre navigateur</strong> pour évaluer ce candidat.
                                        </p>
                                        <div className="mt-4 bg-yellow-50 text-yellow-800 text-xs p-3 rounded-lg border border-yellow-200 text-left flex gap-2">
                                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                            <span>Autorisez l'accès au microphone lorsque le navigateur vous le demandera.</span>
                                        </div>
                                    </div>
                                    <div className="mt-6 flex justify-between gap-3">
                                        <Button type="button" variant="outline" onClick={() => setPhoneInputCandidate(null)} className="flex-1">
                                            Annuler
                                        </Button>
                                        <Button type="submit" disabled={callMutation.isPending || isWebCallActive} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                                            {callMutation.isPending ? 'Chargement...' : isWebCallActive ? 'En cours...' : 'Démarrer l\'appel'}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Transcript Modal */}
            {transcriptModalData && (
                <div className="relative z-50">
                    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"></div>
                    <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                            <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-2xl transition-all sm:my-8 w-full max-w-3xl flex flex-col max-h-[90vh]">
                                <div className="bg-white px-6 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-primary-100 flex items-center justify-center text-primary-700">
                                            <Phone className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">Entretien IA</h3>
                                            <p className="text-xs font-medium text-gray-500">Candidat : {transcriptModalData.name}</p>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => setTranscriptModalData(null)} className="h-8 w-8 p-0 rounded-full">
                                        <X className="w-5 h-5 text-gray-500" />
                                    </Button>
                                </div>
                                <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 font-mono text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                                        {transcriptModalData.transcript || "Aucune transcription disponible."}
                                    </div>
                                </div>
                                <div className="bg-white px-6 py-4 border-t border-gray-100 shrink-0 flex justify-end">
                                    <Button onClick={() => setTranscriptModalData(null)}>Fermer</Button>
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
        <div className="relative z-50">
            <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"></div>
            <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                    <div className="relative transform overflow-hidden rounded-xl bg-white px-4 pb-4 pt-5 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">

                        <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                            <button type="button" onClick={onClose} className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div>
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 mb-4">
                                <UserPlus className="h-6 w-6 text-blue-600" />
                            </div>
                            <h3 className="text-lg font-bold leading-6 text-gray-900 text-center" id="modal-title">Nouveau candidat</h3>
                            <div className="mt-2 text-center">
                                <p className="text-sm text-gray-500">Ajoutez un profil pour qu'il soit évalué par l'IA.</p>
                            </div>

                            {errorMsg && (
                                <div className="mt-4 bg-red-50 text-red-700 p-3 rounded-lg text-sm border border-red-100">
                                    {errorMsg}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                                <Input
                                    label="Nom Complet"
                                    required
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Jean Dupont"
                                />

                                <Input
                                    label="Adresse Email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="jean.dupont@example.com"
                                />

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">CV au format PDF</label>
                                    <div className="mt-2 flex justify-center rounded-lg border border-dashed border-gray-300 px-6 py-6 hover:bg-gray-50 transition-colors">
                                        <div className="text-center">
                                            <FileText className="mx-auto h-8 w-8 text-gray-300" aria-hidden="true" />
                                            <div className="mt-4 flex text-sm leading-6 text-gray-600">
                                                <label htmlFor="file-upload" className="relative cursor-pointer rounded-md bg-white font-semibold text-primary-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-2 hover:text-primary-500">
                                                    <span>Télécharger un fichier</span>
                                                    <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="application/pdf" onChange={e => setCv(e.target.files?.[0] || null)} />
                                                </label>
                                                <p className="pl-1">ou glisser-déposer</p>
                                            </div>
                                            <p className="text-xs leading-5 text-gray-500">
                                                {cv ? cv.name : 'PDF uniquement, jusqu\'à 5MB'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 flex gap-3">
                                    <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                                        Annuler
                                    </Button>
                                    <Button type="submit" disabled={addMutation.isPending} isLoading={addMutation.isPending} className="flex-1">
                                        Ajouter
                                    </Button>
                                </div>
                            </form>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
