import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ArrowRight, User, Mail, Sparkles } from 'lucide-react'

export const Route = createFileRoute('/jobs/$jobId/apply')({
  component: CandidateApplicationForm,
})

function CandidateApplicationForm() {
  const { jobId } = Route.useParams()
  const navigate = useNavigate()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      // 1. Check if candidate already exists by email
      let { data: existingCandidates, error: searchError } = await supabase
        .from('candidates')
        .select('*')
        .eq('email', email)

      if (searchError) throw searchError;

      let candidateId = existingCandidates?.[0]?.id;

      // 2. If not, create candidate
      if (!candidateId) {
        const { data: newCandidate, error: createError } = await supabase
          .from('candidates')
          .insert([{
            first_name: firstName,
            last_name: lastName,
            email: email
          }])
          .select()
          .single()

        if (createError) throw createError;
        candidateId = newCandidate.id;
      }

      // 3. Create screening session
      const { error: screeningError } = await supabase
        .from('screenings')
        .insert([{
          job_id: jobId,
          candidate_id: candidateId,
          status: 'interviewing'
        }])

      if (screeningError) throw screeningError;

      // 4. Redirect to AI Coach (In a real app, generate a secure token here instead of relying on local storage)
      localStorage.setItem('coach_session_id', `cand_${candidateId}_job_${jobId}`);
      navigate({ to: '/candidate/coach' })

    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || "Une erreur est survenue lors de l'inscription.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col justify-center relative overflow-hidden py-12 sm:px-6 lg:px-8">
      {/* Ambient Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-gradient-to-br from-indigo-200/40 to-purple-200/40 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] rounded-full bg-gradient-to-tr from-blue-200/40 to-indigo-200/40 blur-[100px]" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 animate-fade-in">
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl mb-6 transform rotate-3">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-center text-3xl font-extrabold text-surface-900 tracking-tight">
          Votre candidature
        </h2>
        <p className="mt-3 text-center text-sm text-gray-500 max-w-sm mx-auto">
          AuraHR analyse votre profil via un court échange avec notre intelligence artificielle.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="glass shadow-2xl rounded-3xl p-8 sm:p-10 border border-white/60 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent pointer-events-none" />

          <form className="space-y-6 relative z-10" onSubmit={handleApply}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-semibold text-gray-700 ml-1 mb-2">
                  Prénom
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="firstName"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 bg-white/60 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                    placeholder="Jean"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-semibold text-gray-700 ml-1 mb-2">
                  Nom
                </label>
                <input
                  id="lastName"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="block w-full px-4 py-3 bg-white/60 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                  placeholder="Dupont"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 ml-1 mb-2">
                Adresse email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-white/60 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                  placeholder="jean.dupont@email.com"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Un lien magique vous sera envoyé pour suivre votre candidature.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-semibold text-white bg-surface-900 hover:bg-surface-800 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative z-10 flex items-center gap-2">
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Démarrer l'entretien IA <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                )}
              </span>
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-gray-400 mt-8 font-medium">
          Aucune préparation nécessaire. Soyez vous-même.
        </p>
      </div>
    </div>
  )
}
