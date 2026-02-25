import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { chatApi } from '../../api/chat'
import type { ChatMessage, ExtractedProfile } from '../../api/chat'
import { supabase } from '../../lib/supabase'

export const Route = createFileRoute('/candidate/coach')({
    component: CandidateCoach,
})

function CandidateCoach() {
    const navigate = useNavigate()
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [isCheckingAuth, setIsCheckingAuth] = useState(true)

    const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: 'Bonjour ! Je suis votre Coach Carrière. Parlez-moi un peu de ce que vous recherchez comme emploi !' }])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [profile, setProfile] = useState<ExtractedProfile | null>(null)

    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const verifySession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            const storedSessionId = localStorage.getItem('coach_session_id')

            if (!session || !storedSessionId) {
                // If not authenticated, or missing the active application context, return to jobs
                navigate({ to: '/jobs' })
                return
            }

            setSessionId(storedSessionId)
            setIsCheckingAuth(false)

            // Load history
            chatApi.getHistory(storedSessionId).then(res => {
                if (res.messages && res.messages.length > 0) {
                    setMessages(res.messages)
                }
                if (res.profile) {
                    setProfile(res.profile)
                }
            }).catch(console.error)
        }

        verifySession()
    }, [navigate])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || isTyping || !sessionId) return

        const userMessage = input.trim()
        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: userMessage }])

        // Add empty assistant message that will be streamed into
        setMessages(prev => [...prev, { role: 'assistant', content: '' }])
        setIsTyping(true)

        try {
            await chatApi.streamMessage(
                sessionId,
                userMessage,
                (token) => {
                    setMessages(prev => {
                        const newMessages = [...prev]
                        const lastIndex = newMessages.length - 1
                        newMessages[lastIndex] = {
                            ...newMessages[lastIndex],
                            content: newMessages[lastIndex].content + token
                        }
                        return newMessages
                    })
                },
                (newProfile) => {
                    setProfile(newProfile)
                }
            )
        } catch (err) {
            console.error("Chat error", err)
        } finally {
            setIsTyping(false)
        }
    }

    if (isCheckingAuth) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface-50">
                <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
            </div>
        )
    }

    return (
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 flex gap-8 h-[calc(100vh-80px)] overflow-hidden">
            {/* Ambient Background Elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-100/40 rounded-full blur-3xl pointer-events-none -z-10" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-3xl pointer-events-none -z-10" />

            {/* LEFT: Chat Area */}
            <div className="flex-1 flex flex-col glass rounded-2xl overflow-hidden border border-white/50 shadow-xl relative z-20">
                <div className="px-6 py-4 border-b border-gray-100 bg-white/60 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223zM8.25 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM10.875 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875-1.125a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-surface-900 tracking-tight">Coach Carrière IA</h2>
                            <p className="text-xs text-gray-500 font-medium">Analyse et extraction de profil en temps réel</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-transparent to-surface-50/50">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                            <div className={`max-w-[80%] rounded-2xl px-5 py-3.5 text-sm/relaxed shadow-sm relative group ${msg.role === 'user'
                                ? 'bg-gradient-to-br from-primary-600 to-indigo-600 text-white rounded-tr-sm'
                                : 'bg-white text-surface-900 border border-gray-100/80 rounded-tl-sm'
                                }`}>
                                {msg.content}
                                {msg.role === 'assistant' && isTyping && i === messages.length - 1 && !msg.content && (
                                    <span className="flex space-x-1.5 h-4 items-center opacity-70 px-2 py-1">
                                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce"></span>
                                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></span>
                                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></span>
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-4 sm:p-5 border-t border-gray-100 bg-white/80 backdrop-blur-md">
                    <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={isTyping}
                            placeholder="Décrivez vos expériences, vos diplômes..."
                            className="flex-1 rounded-xl border-0 py-3.5 px-6 text-surface-900 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-primary-500 sm:text-sm shadow-sm transition-all focus:shadow-md bg-white/80 disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={isTyping || !input.trim()}
                            className="rounded-xl bg-surface-900 px-5 text-white shadow-sm hover:bg-surface-800 disabled:opacity-50 transition-all flex items-center justify-center min-w-[3.5rem] group"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 group-hover:translate-x-0.5 transition-transform">
                                <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
                            </svg>
                        </button>
                    </form>
                </div>
            </div>

            {/* RIGHT: Profile Live Extraction Sidebar */}
            <div className="hidden lg:flex w-[350px] flex-col glass rounded-2xl overflow-hidden border border-white/50 shadow-xl relative z-20">
                <div className="px-6 py-4 border-b border-indigo-100/50 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 backdrop-blur-md">
                    <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2 tracking-tight">
                        <div className="p-1.5 bg-indigo-100 rounded-md text-indigo-600">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M14.447 3.027a.75.75 0 01.527.92l-4.5 16.5a.75.75 0 01-1.448-.394l4.5-16.5a.75.75 0 01.921-.526zM16.72 6.22a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L21.44 12l-4.72-4.72a.75.75 0 010-1.06zm-9.44 0a.75.75 0 010 1.06L2.56 12l4.72 4.72a.75.75 0 11-1.06 1.06L.97 12.53a.75.75 0 010-1.06l5.25-5.25a.75.75 0 011.06 0z" clipRule="evenodd" />
                            </svg>
                        </div>
                        Extraction en direct
                    </h3>
                    <p className="text-[11px] text-indigo-600/80 mt-1.5 font-medium leading-relaxed">
                        L'IA structure votre profil à partir de notre conversation.
                    </p>
                </div>

                <div className="p-6 flex-1 overflow-y-auto space-y-7 bg-white/40">

                    {/* Live Profile Data */}
                    <div className="space-y-6">
                        <div className="relative">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full"></span>
                                Poste Souhaité
                            </h4>
                            <div className="text-sm font-semibold text-surface-900 bg-white/60 p-3 rounded-xl border border-gray-100 shadow-sm">
                                {profile?.preferred_role || <span className="text-gray-400 italic font-normal">En attente...</span>}
                            </div>
                        </div>

                        <div className="relative">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                                Expérience
                            </h4>
                            <div className="text-sm font-semibold text-surface-900 bg-white/60 p-3 rounded-xl border border-gray-100 shadow-sm">
                                {profile?.experience_years !== undefined ? `${profile.experience_years} ans` : <span className="text-gray-400 italic font-normal">En attente...</span>}
                            </div>
                        </div>

                        <div className="relative">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                                Compétences Clés
                            </h4>
                            {profile?.skills && profile.skills.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {profile.skills.map((skill, i) => (
                                        <span key={i} className="inline-flex items-center rounded-lg bg-indigo-50/80 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 shadow-sm transition-transform hover:-translate-y-0.5">
                                            {skill}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-sm text-gray-400 italic bg-white/60 p-3 rounded-xl border border-gray-100 border-dashed">
                                    Les compétences apparaîtront ici
                                </div>
                            )}
                        </div>

                        <div className="relative">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                                Pitch / Résumé
                            </h4>
                            <div className="text-sm font-medium text-gray-700 bg-white/60 p-3.5 rounded-xl border border-gray-100 shadow-sm leading-relaxed">
                                {profile?.summary || <span className="text-gray-400 italic">Le résumé auto-généré s'affichera ici au fur et à mesure.</span>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
