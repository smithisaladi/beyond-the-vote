import { Link } from '@tanstack/react-router'
import { TopoBackground, MockRepCard, Feature, IconUsers, IconVote, IconBell } from './Shared'

export function RepresentativesTab({ onSignUp }: { onSignUp: () => void }) {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-16 px-6">
        <TopoBackground />
        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 items-center">
            <div>
              <span className="inline-block text-xs font-medium text-accent bg-accent-deep/[0.12] border border-accent-deep/20 px-3 py-1 rounded-full mb-6 tracking-[0.08em] uppercase">
                Know Your Representative
              </span>
              <h1 className="text-4xl sm:text-5xl text-fg mb-6 leading-[1.08] tracking-tight">
                Know exactly who represents you, and what they stand for
              </h1>
              <p className="text-lg text-fg/55 mb-8 leading-relaxed max-w-lg">
                Beyond the Vote connects you directly to your elected officials&apos; voting records,
                positions, and actions so you can hold them accountable.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onSignUp}
                  className="px-6 py-3 bg-accent-deep text-fg rounded-xl text-sm font-medium hover:bg-accent-deep-hover transition-colors"
                >
                  Get started
                </button>
                <Link
                  to="/representatives"
                  className="px-6 py-3 bg-surface border border-edge text-fg rounded-xl text-sm font-medium hover:border-accent-deep/50 hover:text-accent transition-colors"
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
      <section className="py-16 px-6 bg-surface/50 border-y border-edge-soft" aria-labelledby="rep-features-heading">
        <div className="max-w-5xl mx-auto">
          <h2
            id="rep-features-heading"
            className="text-2xl text-fg mb-2 text-center tracking-tight"
          >
            Everything you need to stay informed
          </h2>
          <p className="text-[13px] text-fg/50 text-center mb-10 max-w-md mx-auto tracking-[0.01em]">
            One platform to find, follow, and understand the people who represent you.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
      <section className="py-12 px-6" aria-label="Platform statistics">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-6 text-center">
          {[
            { stat: '535', label: 'Members of Congress tracked' },
            { stat: '10,000+', label: 'Bills indexed' },
            { stat: '100%', label: 'Open and accessible' },
          ].map(({ stat, label }) => (
            <div key={label}>
              <p className="text-3xl font-semibold text-accent mb-1.5 font-mono tabular-nums">
                {stat}
              </p>
              <p className="text-[10px] text-fg/50 leading-snug uppercase tracking-[0.07em]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6 bg-accent-deep/[0.08] border-t border-accent-deep/15" aria-labelledby="rep-cta-heading">
        <div className="max-w-xl mx-auto text-center">
          <h2
            id="rep-cta-heading"
            className="text-2xl text-fg mb-3 tracking-tight"
          >
            Democracy works when voters are informed
          </h2>
          <p className="text-[13px] text-fg/55 mb-7 leading-relaxed">
            Join Beyond the Vote and start building a clearer picture of who really represents your interests.
          </p>
          <button
            onClick={onSignUp}
            className="px-8 py-2.5 bg-accent-deep text-fg rounded-xl text-sm font-medium hover:bg-accent-deep-hover transition-colors"
          >
            Create your account
          </button>
        </div>
      </section>
    </div>
  )
}
