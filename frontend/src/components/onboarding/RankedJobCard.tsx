import { type RankedJobResult } from '../../api/onboarding'

interface RankedJobCardProps {
  job: RankedJobResult
  index: number
}

export function RankedJobCard({ job, index }: RankedJobCardProps) {
  const isExcellent = job.score >= 70
  const isGood = job.score >= 40 && job.score < 70
  
  const scoreClass = isExcellent 
    ? 'bg-green-400/30 text-green-100 border border-green-400/40 shadow-[0_0_20px_rgba(74,222,128,0.2)]' 
    : isGood 
      ? 'bg-orange-400/30 text-orange-100 border border-orange-400/40 shadow-[0_0_20px_rgba(251,146,60,0.2)]'
      : 'bg-red-400/30 text-red-100 border border-red-400/40 shadow-[0_0_20px_rgba(248,113,113,0.2)]'

  return (
    <div 
      className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-[2rem] p-6 shadow-xl hover:bg-white/[0.15] transition-all duration-300 animate-slide-up"
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        
        {/* Header & Source */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className={`px-3 py-1 rounded-full text-xs font-black tracking-widest ${scoreClass}`}>
              MATCH: {job.score}%
            </span>
            <span className="bg-white/10 border border-white/10 text-white/70 text-xs px-2 py-1 rounded-md capitalize">
              {job.job.source}
            </span>
          </div>
          <h3 className="text-xl font-bold text-white mb-2 leading-tight">
            {job.job.title}
          </h3>
          <p className="text-white/70 text-sm line-clamp-2">
            {job.job.description_snippet}
          </p>
        </div>

        {/* Evaluation Match */}
        <div className="sm:w-[400px] shrink-0 bg-white/5 rounded-2xl p-4 border border-white/10">
          
          <p className="text-white/80 italic text-sm mb-4 leading-relaxed font-medium">
            "{job.justification}"
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="flex items-center gap-1.5 text-green-300 text-xs font-bold uppercase mb-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
                Points forts
              </h4>
              <ul className="space-y-1">
                {job.strengths.map((str, i) => (
                  <li key={i} className="text-white/90 text-sm flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">•</span>
                    <span className="leading-snug">{str}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            {(job.weaknesses.length > 0) && (
              <div>
                <h4 className="flex items-center gap-1.5 text-orange-300 text-xs font-bold uppercase mb-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Points d'attention
                </h4>
                <ul className="space-y-1">
                  {job.weaknesses.map((weak, i) => (
                    <li key={i} className="text-white/90 text-sm flex items-start gap-2">
                      <span className="text-orange-400 mt-0.5">•</span>
                      <span className="leading-snug">{weak}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Footer / CTA */}
      <div className="mt-6 pt-5 border-t border-white/10 flex justify-end">
        {job.job.external_url ? (
          <a
            href={job.job.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2.5 bg-white text-surface-900 font-bold rounded-xl text-sm hover:scale-105 active:scale-95 transition-transform duration-200 flex items-center gap-2"
          >
            Voir l'offre
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : (
          <span className="px-6 py-2.5 bg-white/20 text-white/50 font-bold rounded-xl text-sm italic cursor-not-allowed">
            Lien non disponible
          </span>
        )}
      </div>
    </div>
  )
}
