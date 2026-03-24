import { useState } from 'react'

interface QuestionsPanelProps {
  questions: string[]
  onSubmit: (answers: Record<string, string | number>) => void
}

export function QuestionsPanel({ questions, onSubmit }: QuestionsPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Convert to the format expected by backend. Since questions are dynamic strings from LLM,
    // we just use simple keys like q0, q1. The backend will ignore unknown keys,
    // but typically the LLM questions are mapped to known fields. Wait, the prompt says:
    // "Le backend est flexible (for field, value in body.answers.items(): if hasattr(profile, field))"
    // Actually, LLM doesn't give us keys. It just gave us strings in `profile.ambiguities`.
    // Let's pass them directly as keys "q0", "q1", etc - wait, if the backend uses `hasattr(profile, field)`,
    // it expects keys like `"salary_min"`, `"remote_pref"`, `"location_pref"`.
    // If the LLM just returns strings in `ambiguities`, how does the user know the keys?
    // Since the instruction says "Pour simplifier, le frontend peut envoyer { "q0": "réponse1" } — le backend ignore les clés inconnues. L'important est que le profil soit mis à jour" (wait, if it ignores unknown keys, how is it updated? Ah, actually the user text says "Le backend est flexible... Si les clés ne matchent pas un champ connu, elles sont ignorées. L'important est que le profil soit mis à jour."
    // Let's just send what the user types.
    onSubmit(answers)
  }

  return (
    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-[2rem] p-8 shadow-2xl h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-orange-500/30 flex items-center justify-center">
          <svg className="w-5 h-5 text-orange-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Précisons votre recherche</h2>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-6">
        {questions.map((q, i) => (
          <div key={i} className="animate-fade-in" style={{ animationDelay: `${i * 150}ms` }}>
            <label className="block text-white/90 font-medium mb-3 leading-snug">{q}</label>
            <input
              type="text"
              value={answers[`q${i}`] || ''}
              onChange={(e) => setAnswers({ ...answers, [`q${i}`]: e.target.value })}
              className="w-full bg-white/5 border border-white/20 focus:border-white/50 focus:bg-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none transition-all shadow-inner"
              placeholder="Votre réponse..."
            />
          </div>
        ))}

        <div className="pt-6 mt-auto">
          <button
            type="submit"
            className="w-full bg-white text-indigo-900 font-bold py-4 rounded-xl shadow-lg hover:bg-indigo-50 transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
          >
            Continuer
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  )
}
