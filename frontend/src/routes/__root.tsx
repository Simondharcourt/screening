import { createRootRoute, Outlet, Link } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
    component: RootComponent,
})

function RootComponent() {
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
                        <nav className="flex space-x-4">
                            {/* Later: Add conditionally rendered links based on auth status */}
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
