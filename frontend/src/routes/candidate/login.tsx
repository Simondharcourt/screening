import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { candidateMeApi } from '../../api/candidateMe'
import { User, Mail, Lock, ArrowRight } from 'lucide-react'

export const Route = createFileRoute('/candidate/login')({
  component: CandidateLogin,
})

function CandidateLogin() {
  const navigate = useNavigate()
  const search: any = Route.useSearch()
  
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      let authUserId: string | undefined;

      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error("Email ou mot de passe incorrect.")
        authUserId = data.user?.id;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
              data: { role: 'candidate' } // Allows trigger to pick this up
          }
        })
        if (error) throw new Error(error.message === "User already registered" ? "Un compte existe déjà. Connectez-vous." : error.message)
        authUserId = data.user?.id;
      }

      if (!authUserId) throw new Error("Erreur d'authentification.")

      // Claim session if it exists in local storage
      const sessionId = localStorage.getItem('coach_session_id') || localStorage.getItem('onboarding_session_id')
      if (sessionId) {
          try {
              await candidateMeApi.claimSession(sessionId)
          } catch(err) {
              console.error("Failed to claim session:", err)
              // Don't fail the whole login if claim fails
          }
      }

      const redirectTo = search.redirect || '/candidate/dashboard'
      navigate({ to: redirectTo })

    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col justify-center relative py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md animate-fade-in relative z-10 w-full max-w-md mx-auto">
        <div className="glass shadow-2xl rounded-3xl p-8 sm:p-10 border border-white/60">
            <div className="text-center mb-8">
                <div className="mx-auto w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
                    <User className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">{isLogin ? "Connexion Candidat" : "Inscription Candidat"}</h2>
                <p className="text-sm text-gray-500 mt-2">Accédez à votre espace pour suivre vos candidatures.</p>
            </div>
          
            <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-3 bg-white/60 border border-gray-200 rounded-xl text-gray-900 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mot de passe</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-3 bg-white/60 border border-gray-200 rounded-xl text-gray-900 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">{errorMsg}</div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center py-3.5 px-4 rounded-xl shadow-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all"
                >
                  {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{isLogin ? "Se connecter" : "S'inscrire"} <ArrowRight className="w-4 h-4 ml-2" /></>}
                </button>

                <div className="text-center pt-2">
                  <button type="button" onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); }} className="text-sm text-indigo-600 font-medium hover:text-indigo-800">
                    {isLogin ? "Créer un compte" : "Déjà un compte ? Se connecter"}
                  </button>
                </div>
            </form>
        </div>
      </div>
    </div>
  )
}
