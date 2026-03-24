import { type CandidateProfile } from '../../api/onboarding'

interface ProfilePanelProps {
  profile: CandidateProfile
}

export function ProfilePanel({ profile }: ProfilePanelProps) {
  const formatSalary = (val?: number) => val ? `${val.toLocaleString('fr-FR')} €` : null
  const formatRemote = (val?: string) => {
    if (val?.toLowerCase().includes('remote') || val?.toLowerCase().includes('télétravail')) return 'Télétravail pro'
    if (val?.toLowerCase().includes('hybride')) return 'Hybride'
    return val
  }

  const fields = [
    { label: 'Poste visé', value: profile.job_title_target, highlight: true },
    { label: 'Expérience', value: profile.experience_years ? `${profile.experience_years} ans` : null },
    { label: 'Mode de travail', value: formatRemote(profile.remote_pref) },
    { label: 'Localisation', value: profile.location_pref },
    { label: 'Salaire min.', value: formatSalary(profile.salary_min) },
  ]

  return (
    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-[2rem] p-8 shadow-2xl h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-indigo-500/30 flex items-center justify-center">
          <svg className="w-5 h-5 text-indigo-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Votre profil IA</h2>
      </div>

      <div className="space-y-5 flex-1">
        {fields.map((f, i) => (
          <div key={i} className="flex justify-between items-center pb-3 border-b border-white/10 last:border-0 last:pb-0">
            <span className="text-white/60 text-sm font-medium">{f.label}</span>
            {f.value ? (
              <span className={`text-right font-medium animate-fade-in delay-[${i * 100}ms] ${f.highlight ? 'text-white text-lg font-bold' : 'text-white/90'}`}>
                {f.value}
              </span>
            ) : (
              <span className="text-white/40 italic text-sm">Non renseigné</span>
            )}
          </div>
        ))}

        {profile.summary && (
          <div className="pt-2">
            <span className="text-white/60 text-sm font-medium block mb-2">Résumé</span>
            <p className="text-white/90 text-sm leading-relaxed whitespace-pre-line bg-white/5 p-4 rounded-xl border border-white/10">
              {profile.summary}
            </p>
          </div>
        )}

        {profile.skills.length > 0 && (
          <div className="pt-2">
            <span className="text-white/60 text-sm font-medium block mb-3">Compétences clés</span>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill, i) => (
                <span key={i} className="bg-white/15 hover:bg-white/25 transition-colors text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/10">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
