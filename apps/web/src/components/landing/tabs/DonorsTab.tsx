import { Link } from '@tanstack/react-router'
import { TopoBackground, MockDonorCard, Feature, IconDollar, IconArrowsLeftRight, IconSparkles } from './Shared'

export function DonorsTab({ onSignUp }: { onSignUp: () => void }) {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-20 px-6">
        <TopoBackground />
        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 items-center">
            <div>
              <span className="inline-block text-xs font-medium text-accent bg-accent-deep/[0.12] border border-accent-deep/20 px-3 py-1 rounded-full mb-6 tracking-[0.08em] uppercase">
                Follow the Money
              </span>
              <h1 className="text-5xl sm:text-6xl text-fg mb-6 leading-[1.08] tracking-tight">
                See who funds your representatives, and where the money goes
              </h1>
              <p className="text-xl text-fg/55 mb-9 leading-relaxed max-w-lg">
                Explore the political action committees spending millions to influence Congress.
                Track contributions, uncover political leanings, and understand the financial
                forces shaping policy.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onSignUp}
                  className="px-6 py-3 bg-accent-deep text-fg rounded-xl text-sm font-medium hover:bg-accent-deep-hover transition-colors"
                >
                  Start exploring donors
                </button>
                <Link
                  to="/donors"
                  className="px-6 py-3 bg-surface border border-edge text-fg rounded-xl text-sm font-medium hover:border-accent-deep/50 hover:text-accent transition-colors"
                >
                  Browse top PACs &rarr;
                </Link>
              </div>
            </div>

            {/* Preview cards */}
            <div className="flex flex-col gap-3 lg:mt-0 mt-4">
              <MockDonorCard
                rank={1}
                name="American Crossroads"
                total="$48.2M"
                lean="Republican"
                recipients={47}
              />
              <MockDonorCard
                rank={2}
                name="Senate Majority PAC"
                total="$41.7M"
                lean="Democrat"
                recipients={31}
              />
              <MockDonorCard
                rank={3}
                name="Congressional Leadership Fund"
                total="$35.1M"
                lean="Mixed"
                recipients={62}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-surface/50 border-y border-edge-soft" aria-labelledby="donors-features-heading">
        <div className="max-w-5xl mx-auto">
          <h2
            id="donors-features-heading"
            className="text-3xl text-fg mb-2 text-center tracking-tight"
          >
            Follow every dollar in politics
          </h2>
          <p className="text-sm text-fg/50 text-center mb-14 max-w-md mx-auto tracking-[0.01em]">
            Powerful tools to trace political money from source to candidate.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <Feature
              icon={<IconDollar />}
              title="Search & explore PACs"
              description="Browse a ranked leaderboard of political action committees by total contributions. Search by name and see which organizations spend the most to influence elections."
            />
            <Feature
              icon={<IconArrowsLeftRight />}
              title="Follow the money trail"
              description="See exactly which candidates each PAC supports, with full breakdowns of direct contributions and independent expenditures, for and against."
            />
            <Feature
              icon={<IconSparkles />}
              title="AI-powered insights"
              description="Every PAC profile includes an AI-generated summary explaining the organization's mission, spending patterns, and political lean in plain language."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-6" aria-labelledby="donors-how-heading">
        <div className="max-w-3xl mx-auto">
          <h2
            id="donors-how-heading"
            className="text-xl text-fg mb-10 text-center tracking-tight"
          >
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { step: 1, title: 'Find a PAC', description: 'Search our database of political action committees or browse the top contributors ranked by total spending.' },
              { step: 2, title: 'See where money flows', description: 'View complete recipient lists, party breakdowns, and contribution types for every PAC in the system.' },
              { step: 3, title: 'Connect the dots', description: 'Link donor data to your own representatives and understand who is funding the people who represent you.' },
            ].map(({ step, title, description }) => (
              <div key={step} className="text-center">
                <div className="w-8 h-8 rounded-full bg-accent-deep/[0.12] border border-accent-deep/15 flex items-center justify-center mx-auto mb-4">
                  <span className="text-sm font-medium text-accent">{step}</span>
                </div>
                <h3 className="text-sm font-semibold text-fg mb-1.5 tracking-tight">
                  {title}
                </h3>
                <p className="text-sm text-fg/55 leading-[1.7]">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-accent-deep/[0.08] border-t border-accent-deep/15" aria-labelledby="donors-cta-heading">
        <div className="max-w-xl mx-auto text-center">
          <h2
            id="donors-cta-heading"
            className="text-3xl text-fg mb-4 tracking-tight"
          >
            Money in politics shouldn&apos;t be a mystery
          </h2>
          <p className="text-base text-fg/55 mb-8 leading-relaxed">
            From PAC contributions to independent expenditures, Beyond the Vote makes political
            funding transparent and accessible to every voter.
          </p>
          <button
            onClick={onSignUp}
            className="px-10 py-3.5 bg-accent-deep text-fg rounded-xl text-sm font-medium hover:bg-accent-deep-hover transition-colors"
          >
            Create your account
          </button>
        </div>
      </section>
    </div>
  )
}
