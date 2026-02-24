import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { jobsApi } from '../../api/jobs'

export const Route = createFileRoute('/jobs/new')({
    component: NewJob,
})

function NewJob() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [questions, setQuestions] = useState<string[]>([''])

    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    const createMutation = useMutation({
        mutationFn: jobsApi.create,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
            navigate({ to: '/jobs/$jobId', params: { jobId: data.id } })
        },
        onError: (err: any) => {
            setErrorMsg(err.message || "Failed to create job")
            setSaving(false)
        }
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setErrorMsg('')

        // Filter out empty questions
        const filteredQuestions = questions.filter(q => q.trim().length > 0)

        createMutation.mutate({
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
                    Nouvelle offre d'emploi (Manuel)
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                    *Dans la Phase 3, ce formulaire sera géré et pré-rempli par l'Agent IA.*
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8 bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl p-8">

                {errorMsg && (
                    <div className="rounded-md bg-red-50 p-4">
                        <h3 className="text-sm font-medium text-red-800">Erreur</h3>
                        <p className="mt-2 text-sm text-red-700">{errorMsg}</p>
                    </div>
                )}

                <div>
                    <label htmlFor="title" className="block text-sm font-medium leading-6 text-gray-900">
                        Titre du poste
                    </label>
                    <div className="mt-2">
                        <input
                            type="text"
                            id="title"
                            required
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                            placeholder="ex: Senior Software Engineer"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="description" className="block text-sm font-medium leading-6 text-gray-900">
                        Description globale
                    </label>
                    <div className="mt-2">
                        <textarea
                            id="description"
                            required
                            rows={5}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                            placeholder="Missions, Tech Stack, Equipe..."
                        />
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center">
                        <label className="block text-sm font-medium leading-6 text-gray-900">
                            Questions de screening (Pré-qualification)
                        </label>
                        <button
                            type="button"
                            onClick={addQuestion}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-500"
                        >
                            + Ajouter
                        </button>
                    </div>

                    <div className="mt-4 space-y-3">
                        {questions.map((q, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    required={index === 0}
                                    value={q}
                                    onChange={(e) => handleQuestionChange(index, e.target.value)}
                                    className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm"
                                    placeholder={`Question ${index + 1}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => removeQuestion(index)}
                                    className="text-gray-400 hover:text-red-500 p-2"
                                    title="Supprimer"
                                    disabled={questions.length === 1}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-x-6 border-t border-gray-900/10 pt-6">
                    <button type="button" onClick={() => navigate({ to: '/dashboard' })} className="text-sm font-semibold leading-6 text-gray-900">
                        Annuler
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
                    >
                        {saving ? 'Création...' : 'Créer l\'offre'}
                    </button>
                </div>

            </form>
        </div>
    )
}
