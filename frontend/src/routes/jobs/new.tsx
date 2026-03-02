import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { jobsApi } from '../../api/jobs'
import { aiApi } from '../../api/ai'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Sparkles, ArrowRight, ArrowLeft, Check, Plus, X, AlertCircle } from 'lucide-react'

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
        <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 animate-fade-in">
            <div className="mb-8">
                <Button
                    variant="ghost"
                    onClick={() => navigate({ to: '/dashboard' })}
                    className="mb-4 pl-0 text-gray-500 hover:text-gray-900"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour au Dashboard
                </Button>
                <h2 className="text-2xl font-bold leading-7 text-surface-900 sm:truncate sm:text-3xl sm:tracking-tight flex items-center gap-3">
                    Nouvelle offre d'emploi
                    {step === 1 && <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10"><Sparkles className="w-3 h-3 mr-1" /> IA</span>}
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                    {step === 1
                        ? "Décrivez brièvement le poste, notre IA s'occupe de rédiger la fiche complète et les questions de qualification."
                        : "Vérifiez et ajustez la description générée avant de la publier."}
                </p>
            </div>

            {/* Progress steps */}
            <div className="mb-8">
                <div className="hidden sm:block">
                    <nav className="flex" aria-label="Progress">
                        <ol role="list" className="flex space-x-8 w-full">
                            <li className="flex-1">
                                <div className={`group flex flex-col border-t-4 py-2 hover:border-primary-800 ${step === 1 ? 'border-primary-600' : 'border-primary-600'}`}>
                                    <span className={`text-sm font-medium ${step === 1 ? 'text-primary-600' : 'text-primary-600 group-hover:text-primary-800'}`}>Étape 1</span>
                                    <span className="text-sm font-medium text-gray-900">Brief et Génération</span>
                                </div>
                            </li>
                            <li className="flex-1">
                                <div className={`group flex flex-col border-t-4 py-2 ${step === 2 ? 'border-primary-600' : 'border-gray-200 hover:border-gray-300'}`}>
                                    <span className={`text-sm font-medium ${step === 2 ? 'text-primary-600' : 'text-gray-500 group-hover:text-gray-700'}`}>Étape 2</span>
                                    <span className="text-sm font-medium text-gray-900">Relecture et Publication</span>
                                </div>
                            </li>
                        </ol>
                    </nav>
                </div>
            </div>

            <Card className="p-8 shadow-sm">
                {errorMsg && (
                    <div className="rounded-lg bg-red-50 p-4 mb-6 border border-red-100 flex items-start">
                        <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3 shrink-0" />
                        <div>
                            <h3 className="text-sm font-medium text-red-800">Une erreur est survenue</h3>
                            <p className="mt-1 text-sm text-red-700">{errorMsg}</p>
                        </div>
                    </div>
                )}

                {/* STEP 1: Input */}
                {step === 1 && (
                    <form onSubmit={handleGenerate} className="space-y-6 animate-fade-in">
                        <div className="space-y-6">
                            <Input
                                id="title"
                                label="Titre du poste"
                                required
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="ex: Senior React Engineer, Product Manager, etc."
                                disabled={generateMutation.isPending}
                            />

                            <Textarea
                                id="bulletPoints"
                                label="Points clés (contexte, technos, profil attendu)"
                                required
                                rows={6}
                                value={bulletPoints}
                                onChange={(e) => setBulletPoints(e.target.value)}
                                placeholder="- Remote friendly&#10;- Stack technologique : React, Node.js, AWS&#10;- Profil autonome orienté produit avec 5 ans d'expérience&#10;- Avantages : mutuelle à 100%, tickets restaurant"
                                disabled={generateMutation.isPending}
                                helperText="Plus vous donnez de détails, meilleure sera la génération."
                            />
                        </div>

                        <div className="pt-6 flex items-center justify-end gap-x-4 border-t border-gray-100 mt-8">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => navigate({ to: '/dashboard' })}
                                disabled={generateMutation.isPending}
                            >
                                Annuler
                            </Button>
                            <Button
                                type="submit"
                                disabled={generateMutation.isPending || !title || !bulletPoints}
                                isLoading={generateMutation.isPending}
                                className="bg-purple-600 hover:bg-purple-700 focus-visible:ring-purple-500 shadow-purple-500/20 shadow-lg"
                            >
                                {!generateMutation.isPending && <Sparkles className="w-4 h-4 mr-2" />}
                                Générer la fiche
                            </Button>
                        </div>
                    </form>
                )}

                {/* STEP 2: Review */}
                {step === 2 && (
                    <form onSubmit={handleSave} className="space-y-8 animate-fade-in">

                        <div className="rounded-lg bg-blue-50 p-4 border border-blue-100">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <Check className="h-5 w-5 text-blue-400" aria-hidden="true" />
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-blue-800">Génération réussie !</h3>
                                    <div className="mt-2 text-sm text-blue-700">
                                        <p>L'IA a rédigé une proposition de fiche de poste et extrait des questions de qualification pour l'agent vocal. Vous pouvez tout modifier ci-dessous avant de publier.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <Textarea
                                id="description"
                                label="Description complète du poste (Markdown)"
                                required
                                rows={16}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="font-mono text-sm leading-relaxed"
                            />

                            <div className="pt-4 border-t border-gray-100">
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-900">Questions de qualification</h4>
                                        <p className="text-xs text-gray-500 mt-1">Ces questions seront posées au candidat par l'agent vocal lors du screening.</p>
                                    </div>
                                    <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                                        <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter
                                    </Button>
                                </div>

                                <div className="space-y-3">
                                    {questions.map((q, index) => (
                                        <div key={index} className="flex items-start gap-2">
                                            <div className="mt-2 text-xs font-semibold text-gray-400 w-6 text-right shrink-0">{index + 1}.</div>
                                            <div className="flex-1">
                                                <Input
                                                    type="text"
                                                    required={index === 0}
                                                    value={q}
                                                    onChange={(e) => handleQuestionChange(index, e.target.value)}
                                                    placeholder="Rédigez une question claire pour l'agent vocal..."
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => removeQuestion(index)}
                                                disabled={questions.length === 1}
                                                className="mt-0.5 text-gray-400 hover:text-red-500"
                                                aria-label="Supprimer"
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-6">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setStep(1)}
                                disabled={saveMutation.isPending}
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Revenir au brief
                            </Button>
                            <Button
                                type="submit"
                                disabled={saveMutation.isPending}
                                isLoading={saveMutation.isPending}
                            >
                                Publier l'offre
                                {!saveMutation.isPending && <ArrowRight className="w-4 h-4 ml-2" />}
                            </Button>
                        </div>
                    </form>
                )}
            </Card>
        </div>
    )
}
