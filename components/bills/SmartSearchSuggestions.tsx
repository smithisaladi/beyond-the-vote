'use client'

const EXAMPLE_QUERIES = [
  'bills about climate change',
  'healthcare for veterans',
  'data privacy protections',
  'immigration reform',
]

interface Props {
  onSelect: (query: string) => void
}

export function SmartSearchSuggestions({ onSelect }: Props) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-[#1C1C1A]/45 mb-5">Describe the legislation you&rsquo;re looking for — try one of these:</p>
      <div className="flex flex-wrap gap-2.5 justify-center">
        {EXAMPLE_QUERIES.map(q => (
          <button
            key={q}
            type="button"
            onClick={() => onSelect(q)}
            className="text-sm text-[#9B7FA6] bg-[#9B7FA6]/[0.07] hover:bg-[#9B7FA6]/[0.13] border border-[#9B7FA6]/20 hover:border-[#9B7FA6]/35 px-4 py-2 rounded-full transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
