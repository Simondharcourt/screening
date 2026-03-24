import { useState, useEffect, useRef } from 'react'

interface JobsCounterProps {
  total: number
  sources: Record<string, number>
  isSearching: boolean
}

function AnimatedCounter({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(0)
  const prev = useRef(0)

  useEffect(() => {
    const start = prev.current
    const end = value
    const duration = 600
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      const val = Math.round(start + (end - start) * eased)
      setDisplayed(val)
      prev.current = val
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [value])

  return <span className="tabular-nums font-extrabold">{displayed.toLocaleString('fr-FR')}</span>
}

export function JobsCounter({ total, sources, isSearching }: JobsCounterProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      <div className="relative">
        <div className="text-[8rem] leading-none text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)] tabular-nums">
          <AnimatedCounter value={total} />
        </div>
        {isSearching && (
          <div className="absolute top-4 -right-8 w-4 h-4 rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)] animate-pulse">
            <div className="absolute inset-0 rounded-full bg-white opacity-50 animate-ping"></div>
          </div>
        )}
      </div>
      
      <div className="text-2xl font-bold text-white/90 mt-4 tracking-wide uppercase">
        {isSearching ? 'offres trouvées' : 'offres analysées'}
      </div>

      {(sources.algolia || sources.local_db) && (
        <div className="flex items-center gap-4 mt-8 text-white/60 font-medium text-sm bg-white/5 px-6 py-2 rounded-full border border-white/10">
          {sources.algolia > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              Algolia : <span className="text-white/90 font-bold">{sources.algolia}</span>
            </div>
          )}
          
          {sources.algolia > 0 && sources.local_db > 0 && (
            <span className="opacity-30">•</span>
          )}

          {sources.local_db > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              Base locale : <span className="text-white/90 font-bold">{sources.local_db}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
