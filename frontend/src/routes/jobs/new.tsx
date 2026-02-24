import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { jobsApi } from '../../api/jobs'
import { aiApi } from '../../api/ai'

export const Route = createFileRoute('/jobs/new')({
    component: NewJobAI,
})

function NewJobAI() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    // Step 1: AI Generation Inputs
    const [title, setTitle] = useState('')
    const [bulletPoints, setBulletPoints] = useState('')

    // Step 2: Generated Outputs (Editable)
    const [description, setDescription] = useState('')
    const [questions, setQuestions] = useState<string[]>([''])

    const [step, setStep] = useState<1 | 2>(1)
    const [errorMsg, setErrorMsg] = useState('')

    // Mutations
    const generateMutation = useMutation({
        mutationFn: aiApi.generateJob,
        onSuccess: (data) => {
            setDescription(data.description)
            setQuestions(data.questions)
            setStep(2)
            setErrorMsg('')
        },
        onError: (err: any) => {
            setErrorMsg(err.message || "Failed to generate job")
        }
    })

    const saveMutation = useMutation({
        mutationFn: jobsApi.create,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
            navigate({ to: '/jobs/$jobId', params: { jobId: data.id } })
        },
        onError: (err: any) => {
            setErrorMsg(err.message || "Failed to create job")
        }
    })

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMsg('')
        generateMutation.mutate({ title, bullet_points: bulletPoints })
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMsg('')

        // Filter out empty questions
        const filteredQuestions = questions.filter(q => q.trim().length > 0)

        saveMutation.mutate({
            title,
            description,
            questions: filteredQuestions
        })
    }

    const handleQuestionChange = (index: number, value: string) => {
        const newQuestions = [...questions]
        newQuestions[index] = value
        setQuestions(newQuestions)
    }

    const addQuestion = () => {
        setQuestions([...questions, ''])
    }

    const removeQuestion = (index: number) => {
        if (questions.length === 1) return;
        const newQuestions = [...questions]
        newQuestions.splice(index, 1)
        setQuestions(newQuestions)
    }

    return (
        <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                    Nouvelle offre d'emploi (Génération IA 🪄)
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                    Laissez l'Agent IA rédiger la fiche de poste et extraire les questions de qualification.
                </p>
            </div>

            <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl p-8 space-y-8">
                {errorMsg && (
                    <div className="rounded-md bg-red-50 p-4">
                        <h3 className="text-sm font-medium text-red-800">Erreur</h3>
                        <p className="mt-2 text-sm text-red-700">{errorMsg}</p>
                    </div>
                )}

                {/* STEP 1: Input */}
                <form onSubmit={handleGenerate} className="space-y-6">
                    <div className="border-b border-gray-900/10 pb-6">
                        <h3 className="text-base font-semibold leading-7 text-gray-900">Étape 1 : Instructions pour l'IA</h3>
                        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
                            <div className="sm:col-span-4">
                                <label htmlFor="title" className="block text-sm font-medium leading-6 text-gray-900">Titre du poste</label>
                                <div className="mt-2">
                                    <input type="text" id="title" required value={title} onChange={(e) => setTitle(e.target.value)} disabled={step === 2} className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600 sm:text-sm" placeholder="ex: Senior React Engineer" />
                                </div>
                            </div>

                            <div className="col-span-full">
                                <label htmlFor="bulletPoints" className="block text-sm font-medium leading-6 text-gray-900">Points clés (contexte, technos, profil attendu)</label>
                                <div className="mt-2">
                                    <textarea id="bulletPoints" required rows={4} value={bulletPoints} onChange={(e) => setBulletPoints(e.target.value)} disabled={step === 2} className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600 sm:text-sm" placeholder="- Remote friendly&#10;- Stack: React, Node, AWS&#10;- Profil autonome et orienté produit" />
                                </div>
                            </div>
                        </div>

                        {step === 1 && (
                            <div className="mt-6 flex items-center justify-end gap-x-6">
                                <button type="button" onClick={() => navigate({ to: '/dashboard' })} className="text-sm font-semibold leading-6 text-gray-900">Annuler</button>
                                <button type="submit" disabled={generateMutation.isPending} className="rounded-md bg-purple-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 disabled:opacity-50 inline-flex items-center gap-2">
                                    {generateMutation.isPending ? 'Génération en cours...' : '🪄 Générer avec l\'IA'}
                                </button>
                            </div>
                        )}
                    </div>
                </form>

                {/* STEP 2: Review */}
                {step === 2 && (
                    <form onSubmit={handleSave} className="space-y-6 pt-6">
                        <h3 className="text-base font-semibold leading-7 text-gray-900">Étape 2 : Relecture et Validation</h3>

                        <div>
                            <label className="block text-sm font-medium leading-6 text-gray-900">Description générée (Modifiable)</label>
                            <div className="mt-2">
                                <textarea required rows={12} value={description} onChange={(e) => setDescription(e.target.value)} className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600 sm:text-sm font-mono text-sm" />
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-center">
                                <label className="block text-sm font-medium leading-6 text-gray-900">Questions de screening générées</label>
                                <button type="button" onClick={addQuestion} className="text-sm font-semibold text-blue-600 hover:text-blue-500">+ Ajouter</button>
                            </div>
                            <div className="mt-4 space-y-3">
                                {questions.map((q, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <input type="text" required={index === 0} value={q} onChange={(e) => handleQuestionChange(index, e.target.value)} className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600 sm:text-sm" />
                                        <button type="button" onClick={() => removeQuestion(index)} className="text-gray-400 hover:text-red-500 p-2" disabled={questions.length === 1}>✕</button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-x-6 border-t border-gray-900/10 pt-6">
                            <button type="button" onClick={() => setStep(1)} className="text-sm font-semibold leading-6 text-gray-900">
                                Retour & Régénérer
                            </button>
                            <button type="submit" disabled={saveMutation.isPending} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50">
                                {saveMutation.isPending ? 'Sauvegarde...' : 'Valider et Créer l\'offre'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    )
}
