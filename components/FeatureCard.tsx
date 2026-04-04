import type { ReactNode } from 'react'

interface FeatureCardProps {
  title: string
  description: string
  icon: ReactNode
}

export function FeatureCard({ title, description, icon }: FeatureCardProps) {
  return (
    <div className="bg-white rounded-lg p-8 border border-[rgba(28,28,26,0.1)] hover:border-[#9B7FA6]/30 transition-all hover:shadow-md">
      <div className="w-12 h-12 bg-[#9B7FA6]/10 rounded-lg flex items-center justify-center mb-5">
        <div className="text-[#9B7FA6]">{icon}</div>
      </div>
      <h3 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
        {title}
      </h3>
      <p className="text-[#1C1C1A]/70 leading-relaxed">{description}</p>
    </div>
  )
}
