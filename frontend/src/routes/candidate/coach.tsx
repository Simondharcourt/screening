import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { chatApi } from '../../api/chat'
import type { ChatMessage, ExtractedProfile } from '../../api/chat'

export const Route = createFileRoute('/candidate/coach')({
    component: CandidateCoach,
})

function CandidateCoach() {
    // Use a simple session ID for this demo. In prod, use the user ID.
    const [sessionId] = useState(() => localStorage.getItem('coach_session_id') || `sess_${Date.now()}`)

    const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: 'Bonjour ! Je suis votre Coach Carrière. Parlez-moi un peu de ce que vous recherchez comme emploi !' }])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [profile, setProfile] = useState<ExtractedProfile | null>(null)

    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        localStorage.setItem('coach_session_id', sessionId)
        // Load history on mount
        chatApi.getHistory(sessionId).then(res => {
            if (res.messages && res.messages.length > 0) {
                setMessages(res.messages)
            }
            if (res.profile) {
                setProfile(res.profile)
            }
        }).catch(console.error)
    }, [sessionId])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || isTyping) return

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

    return (
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 flex gap-8 h-[calc(100vh-80px)]">

            {/* LEFT: Chat Area */}
            <div className="flex-1 flex flex-col bg-white shadow-sm ring-1 ring-gray-900/5 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Coach Carrière IA</h2>
                        <p className="text-xs text-gray-500">Génération de votre profil en temps réel</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] rounded-2xl px-5 py-3 text-sm ${msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                                : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none shadow-sm'
                                }`}>
                                {msg.content}
                                {msg.role === 'assistant' && isTyping && i === messages.length - 1 && !msg.content && (
                                    <span className="flex space-x-1 h-4 items-center opacity-50">
                                        <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce"></span>
                                        <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                                        <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-4 border-t border-gray-100 bg-white">
                    <form onSubmit={handleSubmit} className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={isTyping}
                            placeholder="Parlez de votre expérience..."
                            className="flex-1 rounded-full border-0 py-2.5 px-5 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600 sm:text-sm shadow-sm"
                        />
                        <button
                            type="submit"
                            disabled={isTyping || !input.trim()}
                            className="rounded-full bg-blue-600 p-2.5 text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 transition-all flex items-center justify-center w-10 h-10"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
                            </svg>
                        </button>
                    </form>
                </div>
            </div>

            {/* RIGHT: Profile Live Extraction Sidebar */}
            <div className="hidden lg:flex w-80 flex-col bg-white shadow-sm ring-1 ring-gray-900/5 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-purple-50">
                    <h3 className="text-sm font-bold text-purple-900 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-purple-600">
                            <path fillRule="evenodd" d="M14.5 10a4.5 4.5 0 004.284-5.882c-.105-.324-.51-.391-.752-.15L15.34 6.66a.454.454 0 01-.493.11 3.01 3.01 0 01-1.618-1.616.455.455 0 01.11-.494l2.694-2.692c.24-.241.174-.647-.15-.752a4.5 4.5 0 00-5.873 4.575c.055.873-.128 1.808-.8 2.368l-7.23 6.024a2.724 2.724 0 103.837 3.837l6.024-7.23c.56-.672 1.495-.855 2.368-.8.096.007.193.01.291.01zM5 16a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
                        </svg>
                        Extraction en direct
                    </h3>
                    <p className="text-xs text-purple-700 mt-1">L'IA déduit votre profil pendant que vous parlez.</p>
                </div>
                <div className="p-6 flex-1 overflow-y-auto space-y-6">

                    <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Poste Recherché</h4>
                        <div className="text-sm font-medium text-gray-900">
                            {profile?.preferred_role || <span className="text-gray-400 italic">En attente...</span>}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Années d'expérience</h4>
                        <div className="text-sm font-medium text-gray-900">
                            {profile?.experience_years !== undefined ? `${profile.experience_years} ans` : <span className="text-gray-400 italic">En attente...</span>}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Compétences</h4>
                        {profile?.skills && profile.skills.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {profile.skills.map((skill, i) => (
                                    <span key={i} className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="text-sm text-gray-400 italic">Aucune compétence détectée</span>
                        )}
                    </div>

                    <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Résumé</h4>
                        <p className="text-sm text-gray-700">
                            {profile?.summary || <span className="text-gray-400 italic">Le résumé s'affichera ici.</span>}
                        </p>
                    </div>

                </div>
            </div>
        </div>
    )
}
