import { useState } from 'react'

interface Props {
  question: string
  completionScore: number    // 0.0–1.0
  onSubmit: (answer: string) => void
  onSkip: () => void
  isLoading: boolean
}

export function QuestionCard({ question, completionScore, onSubmit, onSkip, isLoading }: Props) {
  const [answer, setAnswer] = useState('')
  const pct = Math.round(completionScore * 100)

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-xl">
      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex justify-between text-white/60 text-sm mb-1">
          <span>Profil complété</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-white/20 rounded-full">
          <div
            className="h-full bg-white rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <p className="text-white text-lg font-medium mb-4">{question}</p>

      {/* Answer input */}
      <textarea
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && answer.trim()) { e.preventDefault(); onSubmit(answer.trim()) } }}
        placeholder="Votre réponse..."
        rows={3}
        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 resize-none focus:outline-none focus:border-white/50 transition-colors"
        disabled={isLoading}
      />

      {/* Actions */}
      <div className="flex justify-between items-center mt-4">
        <button
          onClick={onSkip}
          className="text-white/50 hover:text-white/80 text-sm transition-colors"
          disabled={isLoading}
        >
          Passer à la recherche →
        </button>
        <button
          onClick={() => { if (answer.trim()) onSubmit(answer.trim()) }}
          disabled={!answer.trim() || isLoading}
          className="px-6 py-2.5 bg-white text-indigo-700 font-semibold rounded-xl disabled:opacity-40 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          {isLoading ? '...' : 'Suivant'}
        </button>
      </div>
    </div>
  )
}
