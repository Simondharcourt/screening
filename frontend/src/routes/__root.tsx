import { createRootRoute, Outlet, Link, useNavigate } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Sparkles, LogOut, LayoutDashboard } from 'lucide-react'

export const Route = createRootRoute({
    component: RootComponent,
})

function RootComponent() {
    const navigate = useNavigate()
    const [session, setSession] = useState<any>(null)

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

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate({ to: '/' });
    }

    return (
        <div className="flex flex-col min-h-screen font-sans">
            {/* Premium Header */}
            <header className="sticky top-0 z-50 glass border-b-0 border-white/40 shadow-sm backdrop-blur-xl bg-white/70">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
                    <Link to="/" className="flex items-center gap-2 group">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-indigo-600 flex items-center justify-center text-white shadow-md group-hover:shadow-lg transition-all">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-surface-900 group-hover:text-primary-600 transition-colors">
                            Aura<span className="font-light text-gray-400">HR</span>
                        </span>
                    </Link>

                    <nav className="flex space-x-2 items-center">
                        {session ? (
                            <>
                                <Link
                                    to="/dashboard"
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                >
                                    <LayoutDashboard className="w-4 h-4" />
                                    <span>Dashboard</span>
                                </Link>
                                <div className="h-5 w-px bg-gray-200 mx-2 hidden sm:block"></div>
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span className="hidden sm:inline">Déconnexion</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <Link
                                    to="/jobs"
                                    className="px-4 py-1.5 text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors"
                                >
                                    Offres d'emploi
                                </Link>
                                <Link
                                    to="/candidate/onboarding"
                                    className="px-4 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-lg shadow-sm transition-all shadow-indigo-500/30 font-semibold tracking-wide"
                                >
                                    Espace Candidat
                                </Link>
                                <Link
                                    to="/"
                                    className="px-4 py-1.5 text-sm font-medium text-white bg-surface-900 hover:bg-surface-800 rounded-lg shadow-sm transition-colors"
                                >
                                    Espace Recruteur
                                </Link>
                            </>
                        )}
                    </nav>
                </div>
            </header>

            <main className="flex-1 w-full flex flex-col">
                <Outlet />
            </main>

            <footer className="mt-auto py-6 text-center text-sm text-gray-400 font-medium border-t border-gray-100 bg-surface-50">
                Built with <span className="text-primary-500">Aura</span> AI Platform
            </footer>

            <TanStackRouterDevtools position="bottom-right" />
        </div>
    )
}
