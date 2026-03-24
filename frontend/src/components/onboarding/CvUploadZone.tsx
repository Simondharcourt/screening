import { useState, useRef } from 'react'

interface CvUploadZoneProps {
  onFileSelected: (file: File) => void
  isUploading: boolean
}

export function CvUploadZone({ onFileSelected, isUploading }: CvUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const validateAndSelect = (file: File) => {
    setError(null)
    if (file.type !== 'application/pdf') {
      setError("Seuls les fichiers PDF sont acceptés.")
      return
    }
    onFileSelected(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSelect(e.dataTransfer.files[0])
    }
  }

  return (
    <div
      className={`
        relative w-full max-w-2xl mx-auto rounded-[2rem] p-12 text-center transition-all duration-300 ease-out
        backdrop-blur-xl border-2 border-dashed
        ${isDragging 
          ? 'bg-white/20 border-white/70 scale-[1.02] shadow-[0_0_40px_rgba(255,255,255,0.2)]' 
          : 'bg-white/10 border-white/30 hover:bg-white/[0.15]'}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !isUploading && fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && validateAndSelect(e.target.files[0])}
        accept="application/pdf"
        className="hidden"
      />

      {isUploading ? (
        <div className="flex flex-col items-center justify-center space-y-4 animate-fade-in">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          <p className="text-white text-lg font-medium tracking-wide">Analyse de votre profil en cours...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center space-y-6 cursor-pointer">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center shadow-lg">
            <svg className="w-10 h-10 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Postez votre CV pour commencer</h3>
            <p className="text-white/70">Glissez-déposez votre PDF ici, ou <span className="text-white font-semibold underline decoration-white/40 underline-offset-4">parcourez vos fichiers</span></p>
          </div>
          {error && (
            <p className="text-red-300 bg-red-500/20 px-4 py-2 rounded-lg text-sm mt-4 font-medium animate-slide-up">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
