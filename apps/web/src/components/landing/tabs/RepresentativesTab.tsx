import { Link } from '@tanstack/react-router'
import { TopoBackground, MockRepCard, Feature, IconUsers, IconVote, IconBell } from './Shared'

export function RepresentativesTab({ onSignUp }: { onSignUp: () => void }) {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-20 px-6">
        <TopoBackground />
        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 items-center">
            <div>
              <span className="inline-block text-xs font-medium text-[#7B5E8A] bg-[#7B5E8A]/10 border border-[#7B5E8A]/20 px-3 py-1 rounded-full mb-6 tracking-[0.08em] uppercase">
                Know Your Representative
              </span>
              <h1
                className="text-5xl sm:text-6xl text-[#1C1C1A] mb-6 leading-[1.08] tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}
              >
                Know exactly who represents you, and what they stand for
              </h1>
              <p className="text-xl text-[#1C1C1A]/55 mb-9 leading-relaxed max-w-lg">
                Beyond the Vote connects you directly to your elected officials&apos; voting records,
                positions, and actions so you can hold them accountable.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onSignUp}
                  className="px-6 py-3 bg-[#7B5E8A] text-white rounded-xl text-sm font-medium hover:bg-[#6A4F78] transition-colors shadow-sm"
                >
                  Get started
                </button>
                <Link
                  href="/representatives"
                  className="px-6 py-3 bg-white border border-[#D6CFC4] text-[#1C1C1A] rounded-xl text-sm font-medium hover:border-[#7B5E8A]/50 hover:text-[#7B5E8A] transition-colors shadow-sm"
                >
                  Find your representatives →
                </Link>
              </div>
            </div>

            {/* Preview cards */}
            <div className="flex flex-col gap-3 lg:mt-0 mt-4">
              <MockRepCard
                name="Margaret Chen"
                title="U.S. Senator"
                party="Democrat"
                state="California"
                vote={{ bill: 'Clean Energy Transition Act', position: 'Yea' }}
              />
              <MockRepCard
                name="Robert Harmon"
                title="U.S. Representative"
                party="Republican"
                state="Texas"
                vote={{ bill: 'Federal Budget Reconciliation Act', position: 'Nay' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-white/50 border-y border-[rgba(28,28,26,0.07)]" aria-labelledby="rep-features-heading">
        <div className="max-w-5xl mx-auto">
          <h2
            id="rep-features-heading"
            className="text-3xl text-[#1C1C1A] mb-2 text-center"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Everything you need to stay informed
          </h2>
          <p className="text-sm text-[#1C1C1A]/50 text-center mb-14 max-w-md mx-auto tracking-[0.01em]">
            One platform to find, follow, and understand the people who represent you.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <Feature
              icon={<IconUsers />}
              title="Find your representatives"
              description="Enter your home address to instantly see every federal official who represents you, from senators to your House member."
            />
            <Feature
              icon={<IconVote />}
              title="Track their votes"
              description="See how your representatives vote on every bill, from healthcare and climate to defense and education, in clear, plain language."
            />
            <Feature
              icon={<IconBell />}
              title="Get personalized alerts"
              description="Follow specific politicians and receive notifications when they vote on issues that matter to you, so you're never out of the loop."
            />
          </div>
        </div>
      </section>

      {/* Social proof / stat strip */}
      <section className="py-16 px-6" aria-label="Platform statistics">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-6 text-center">
          {[
            { stat: '535', label: 'Members of Congress tracked' },
            { stat: '10,000+', label: 'Bills indexed' },
            { stat: '100%', label: 'Open and accessible' },
          ].map(({ stat, label }) => (
            <div key={label}>
              <p className="text-4xl font-semibold text-[#7B5E8A] mb-1.5" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
                {stat}
              </p>
              <p className="text-[11px] text-[#1C1C1A]/50 leading-snug uppercase tracking-[0.04em]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-[#7B5E8A]/[0.07] border-t border-[#7B5E8A]/15" aria-labelledby="rep-cta-heading">
        <div className="max-w-xl mx-auto text-center">
          <h2
            id="rep-cta-heading"
            className="text-3xl text-[#1C1C1A] mb-4"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Democracy works when voters are informed
          </h2>
          <p className="text-base text-[#1C1C1A]/55 mb-8 leading-relaxed">
            Join Beyond the Vote and start building a clearer picture of who really represents your interests.
          </p>
          <button
            onClick={onSignUp}
            className="px-10 py-3.5 bg-[#7B5E8A] text-white rounded-xl text-sm font-medium hover:bg-[#6A4F78] transition-colors shadow-sm"
          >
            Create your account
          </button>
        </div>
      </section>
    </div>
  )
}
