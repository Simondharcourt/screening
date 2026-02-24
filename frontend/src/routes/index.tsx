import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Sparkles, Mail, ArrowRight, ShieldCheck, Zap, Users } from 'lucide-react'

export const Route = createFileRoute('/')({
    component: HomeComponent,
})

function HomeComponent() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [session, setSession] = useState<any>(null)
    const navigate = useNavigate()

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
        })

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })

        return () => subscription.unsubscribe()
    }, [])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage('')

        // Try sign in first
        let { error } = await supabase.auth.signInWithPassword({
            email,
            password
        })

        // If it fails with Invalid login credentials, try to sign up automatically
        if (error && error.message.includes('Invalid login credentials')) {
            const signUpResponse = await supabase.auth.signUp({
                email,
                password
            })
            error = signUpResponse.error

            if (!error && signUpResponse.data.session) {
                navigate({ to: '/dashboard' })
                return
            } else if (!error && !signUpResponse.data.session) {
                // Should not happen if confirm email is disabled, but just in case
                setMessage("Compte créé, vous pouvez vous connecter.")
                setLoading(false)
                return
            }
        }

        if (error) {
            setMessage(error.message)
        } else {
            navigate({ to: '/dashboard' })
        }
        setLoading(false)
    }

    if (session) {
        return (
            <div className="flex flex-col flex-1 items-center justify-center p-8 bg-surface-50 min-h-screen relative overflow-hidden">
                {/* Background decorative elements */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-100/50 blur-3xl pointer-events-none" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-100/50 blur-3xl pointer-events-none" />

                <div className="glass z-10 p-10 rounded-3xl max-w-md w-full text-center animate-fade-in border border-white">
                    <div className="mx-auto w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6 shadow-sm">
                        <ShieldCheck className="w-8 h-8" />
                    </div>
                    <h2 className="text-3xl font-bold mb-2 text-surface-900">Bienvenue</h2>
                    <p className="text-gray-500 mb-8 font-medium">{session.user.email}</p>

                    <div className="space-y-4">
                        <button
                            onClick={() => navigate({ to: '/dashboard' })}
                            className="w-full relative overflow-hidden group bg-surface-900 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                        >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                Accéder au Dashboard <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-primary-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </button>

                        <button
                            onClick={() => supabase.auth.signOut()}
                            className="w-full text-gray-500 hover:text-gray-900 font-medium py-3 px-6 transition duration-200"
                        >
                            Se déconnecter
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-surface-50 flex flex-col justify-center relative overflow-hidden selection:bg-primary-100 selection:text-primary-900">
            {/* Premium ambient background */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-blue-200/40 to-indigo-200/40 blur-[100px]" />
                <div className="absolute top-[60%] -right-[10%] w-[60%] h-[60%] rounded-full bg-gradient-to-tl from-purple-200/40 to-blue-200/40 blur-[100px]" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
            </div>

            <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="w-full max-w-[1000px] grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

                    {/* Left Column - Copy */}
                    <div className="animate-fade-in hidden lg:block pr-8">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm font-semibold tracking-wide mb-6">
                            <Sparkles className="w-4 h-4" />
                            <span>Plateforme RH Intelligente</span>
                        </div>
                        <h1 className="text-4xl sm:text-5xl font-extrabold text-surface-900 tracking-tight leading-[1.1] mb-6">
                            Recrutez les meilleurs talents avec <span className="text-gradient">l'Intelligence Artificielle.</span>
                        </h1>
                        <p className="text-lg text-gray-600 leading-relaxed mb-8">
                            Générez des fiches de postes parfaites, évaluez les candidats via des agents vocaux autonomes, et trouvez le profil idéal en un temps record.
                        </p>

                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="mt-1 bg-white shadow-sm p-1.5 rounded-md border border-gray-100"><Zap className="w-5 h-5 text-primary-600" /></div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">Agents Autonomes LangGraph</h3>
                                    <p className="text-sm text-gray-500">Des flux d'automatisation avancés pour chaque étape.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="mt-1 bg-white shadow-sm p-1.5 rounded-md border border-gray-100"><Users className="w-5 h-5 text-indigo-600" /></div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">Entretiens Vocaux (Vapi)</h3>
                                    <p className="text-sm text-gray-500">Laissez l'IA réaliser le premier filtre téléphonique.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Auth Form */}
                    <div className="w-full max-w-md mx-auto animate-fade-in" style={{ animationDelay: '0.1s' }}>
                        <div className="glass rounded-[2rem] p-8 sm:p-10 relative overflow-hidden">
                            {/* Subtle inner highlight */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/60 to-transparent pointer-events-none rounded-[2rem]" />

                            <div className="relative z-10">
                                <div className="text-center mb-8">
                                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Espace Recruteur</h2>
                                    <p className="text-sm text-gray-500 mt-2">Connectez-vous via Magic Link pour accéder au Dashboard.</p>
                                </div>

                                <form onSubmit={handleLogin} className="space-y-5">
                                    <div className="space-y-2">
                                        <label htmlFor="email" className="block text-sm font-semibold text-gray-700 ml-1">
                                            Email professionnel
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                <Mail className="h-5 w-5 text-gray-400" />
                                            </div>
                                            <input
                                                id="email"
                                                type="email"
                                                required
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="block w-full pl-11 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition duration-200 shadow-sm outline-none"
                                                placeholder="vous@entreprise.com"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label htmlFor="password" className="block text-sm font-semibold text-gray-700 ml-1">
                                            Mot de passe
                                        </label>
                                        <div className="relative">
                                            <input
                                                id="password"
                                                type="password"
                                                required
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className="block w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition duration-200 shadow-sm outline-none"
                                                placeholder="••••••••"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full relative overflow-hidden group bg-surface-900 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5 mt-2"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-primary-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                        <div className="relative z-10 flex items-center justify-center gap-2">
                                            {loading ? (
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <>Se connecter <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" /></>
                                            )}
                                        </div>
                                    </button>
                                </form>

                                {message && (
                                    <div className={`mt-6 p-4 rounded-xl text-sm font-medium border ${message.includes('envoyé')
                                        ? 'bg-green-50/50 border-green-200 text-green-700'
                                        : 'bg-red-50/50 border-red-200 text-red-700'
                                        } animate-fade-in`}
                                    >
                                        {message}
                                    </div>
                                )}
                            </div>
                        </div>

                        <p className="text-center text-xs text-gray-400 mt-6 font-medium">
                            En vous connectant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
