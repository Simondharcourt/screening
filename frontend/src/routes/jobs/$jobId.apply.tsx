import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { candidateMeApi } from '../../api/candidateMe'
import { ArrowRight, User, Mail, Sparkles, Lock } from 'lucide-react'

export const Route = createFileRoute('/jobs/$jobId/apply')({
  component: CandidateApplicationForm,
})

function CandidateApplicationForm() {
  const { jobId } = Route.useParams()
  const navigate = useNavigate()

  const [isLogin, setIsLogin] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      let authUserId: string | undefined;

      if (isLogin) {
        // LOGIN MODE
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        if (error) throw new Error("Email ou mot de passe incorrect.")
        authUserId = data.user?.id;
      } else {
        // SIGNUP MODE
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        })
        // If a user exists as a recruiter, they can't sign up again here, they should log in.
        // We'll let Supabase handle the "User already registered" error
        if (error) throw new Error(error.message === "User already registered" ? "Un compte existe déjà. Veuillez vous connecter." : error.message)
        authUserId = data.user?.id;
      }

      if (!authUserId) throw new Error("Erreur lors de l'authentification.")

      // Ensure candidate profile exists in DB
      let { data: existingCandidates, error: searchError } = await supabase
        .from('candidates')
        .select('*')
        .eq('user_id', authUserId)

      if (searchError) throw searchError;

      let candidateId = existingCandidates?.[0]?.id;

      // If they don't have a linked candidate profile, create one
      if (!candidateId && !isLogin) {
        const { data: newCandidate, error: createError } = await supabase
          .from('candidates')
          .insert([{
            name: `${firstName} ${lastName}`.trim(),
            email: email,
            user_id: authUserId
          }])
          .select()
          .single()

        if (createError) throw new Error("Erreur lors de la création du profil candidat.")
        candidateId = newCandidate.id;
      } else if (!candidateId && isLogin) {
        // Failsafe: if they logged in but have no candidate profile (e.g. they are a recruiter)
        // We create one for them so they can apply anyway, using their email as name
        const { data: newCandidate, error: createError } = await supabase
          .from('candidates')
          .insert([{
            name: email.split('@')[0],
            email: email,
            user_id: authUserId
          }])
          .select()
          .single()

        if (createError) throw new Error("Erreur serveur de liaison de profil.")
        candidateId = newCandidate.id;
      }

      // Check if screening already exists to avoid duplicates
      let { data: existingScreening } = await supabase
        .from('screenings')
        .select('id')
        .eq('job_id', jobId)
        .eq('candidate_id', candidateId)
        .single()

      let screeningId = existingScreening?.id;

      if (!screeningId) {
        // Create screening session
        const { data: newScreening, error: screeningError } = await supabase
          .from('screenings')
          .insert([{
            job_id: jobId,
            candidate_id: candidateId,
            status: 'interviewing'
          }])
          .select('id')
          .single()

        if (screeningError) throw new Error("Impossible de créer la candidature.")
        screeningId = newScreening.id;
      }

      // Store the specific screening ID so the Chat knows which thread to load
      localStorage.setItem('coach_session_id', screeningId)

      // Application success ! 
      // Claim the session formally in backend
      try {
        await candidateMeApi.claimSession(screeningId)
      } catch (err: any) {
        console.warn("Could not claim via API (maybe trigger handled it):", err)
      }

      navigate({ to: '/candidate/dashboard' })

    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || "Une erreur est survenue lors de l'inscription.")
    } finally {
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
          {isLogin ? "Heureux de vous revoir" : "Votre candidature"}
        </h2>
        <p className="mt-3 text-center text-sm text-gray-500 max-w-sm mx-auto">
          {isLogin
            ? "Connectez-vous pour finaliser votre candidature et passer votre premier entretien."
            : "Inscrivez-vous pour créer votre profil candidat permanent sur AuraHR."}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="glass shadow-2xl rounded-3xl p-8 sm:p-10 border border-white/60 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent pointer-events-none" />

          <form className="space-y-6 relative z-10" onSubmit={handleApply}>

            {!isLogin && (
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
                      required={!isLogin}
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
                    required={!isLogin}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="block w-full px-4 py-3 bg-white/60 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                    placeholder="Dupont"
                  />
                </div>
              </div>
            )}

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
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 ml-1 mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-white/60 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                  placeholder="••••••••"
                />
              </div>
              {!isLogin && (
                <p className="mt-2 text-xs text-gray-500 font-medium">
                  Le mot de passe vous permettra de suivre cette et vos futures candidatures.
                </p>
              )}
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-semibold text-white bg-surface-900 hover:bg-surface-800 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden mt-2"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative z-10 flex items-center gap-2">
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>{isLogin ? "Se connecter" : "Démarrer l'entretien IA"} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                )}
              </span>
            </button>

            <div className="text-center mt-5">
              <button
                type="button"
                className="text-sm font-medium text-primary-600 hover:text-primary-700"
                onClick={() => {
                  setIsLogin(!isLogin)
                  setErrorMsg('')
                }}
              >
                {isLogin ? "Je n'ai pas encore de compte" : "J'ai déjà un compte candidat"}
              </button>
            </div>

          </form>
        </div>
        <p className="text-center text-xs text-gray-400 mt-8 font-medium">
          {isLogin ? "Vos données sont sécurisées." : "Aucune préparation nécessaire. Soyez vous-même."}
        </p>
      </div>
    </div>
  )
}
