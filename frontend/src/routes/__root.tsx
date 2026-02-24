import { createRootRoute, Outlet, Link, useNavigate } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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
        <>
            <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
                <header className="bg-white shadow">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                        <h1 className="text-xl font-bold tracking-tight text-gray-900">
                            <Link to="/" className="hover:text-blue-600 transition-colors">
                                HR AI Screening
                            </Link>
                        </h1>
                        <nav className="flex space-x-4 items-center">
                            {session ? (
                                <>
                                    <Link to="/dashboard" className="text-sm font-medium text-gray-700 hover:text-blue-600">
                                        Dashboard
                                    </Link>
                                    <button onClick={handleLogout} className="text-sm font-medium text-gray-500 hover:text-red-600 ml-4 cursor-pointer">
                                        Se déconnecter
                                    </button>
                                </>
                            ) : (
                                <Link to="/" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                                    Connexion
                                </Link>
                            )}
                        </nav>
                    </div>
                </header>

                <main className="flex-1 w-full flex bg-gray-50">
                    <Outlet />
                </main>

                <footer className="bg-white py-4 mt-auto border-t text-center text-sm text-gray-500">
                    HR AI Platform - Open Source Candidate Screening
                </footer>
            </div>
            <TanStackRouterDevtools position="bottom-right" />
        </>
    )
}
