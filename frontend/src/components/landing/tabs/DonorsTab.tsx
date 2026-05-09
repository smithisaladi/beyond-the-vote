import { Link } from 'react-router-dom'
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
              <span className="inline-block text-xs font-medium text-[#7B5E8A] bg-[#7B5E8A]/10 border border-[#7B5E8A]/20 px-3 py-1 rounded-full mb-6 tracking-[0.08em] uppercase">
                Follow the Money
              </span>
              <h1
                className="text-5xl sm:text-6xl text-[#1C1C1A] mb-6 leading-[1.08] tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}
              >
                See who funds your representatives, and where the money goes
              </h1>
              <p className="text-xl text-[#1C1C1A]/55 mb-9 leading-relaxed max-w-lg">
                Explore the political action committees spending millions to influence Congress.
                Track contributions, uncover political leanings, and understand the financial
                forces shaping policy.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onSignUp}
                  className="px-6 py-3 bg-[#7B5E8A] text-white rounded-xl text-sm font-medium hover:bg-[#6A4F78] transition-colors shadow-sm"
                >
                  Start exploring donors
                </button>
                <Link
                  href="/donors"
                  className="px-6 py-3 bg-white border border-[#D6CFC4] text-[#1C1C1A] rounded-xl text-sm font-medium hover:border-[#7B5E8A]/50 hover:text-[#7B5E8A] transition-colors shadow-sm"
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
      <section className="py-20 px-6 bg-white/50 border-y border-[rgba(28,28,26,0.07)]" aria-labelledby="donors-features-heading">
        <div className="max-w-5xl mx-auto">
          <h2
            id="donors-features-heading"
            className="text-3xl text-[#1C1C1A] mb-2 text-center"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Follow every dollar in politics
          </h2>
          <p className="text-sm text-[#1C1C1A]/50 text-center mb-14 max-w-md mx-auto tracking-[0.01em]">
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
            className="text-xl text-[#1C1C1A] mb-10 text-center"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 500 }}
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
                <div className="w-8 h-8 rounded-full bg-[#7B5E8A]/10 border border-[#7B5E8A]/15 flex items-center justify-center mx-auto mb-4">
                  <span className="text-sm font-medium text-[#7B5E8A]">{step}</span>
                </div>
                <h3
                  className="text-sm font-semibold text-[#1C1C1A] mb-1.5"
                  style={{ fontFamily: 'var(--font-serif)', fontWeight: 500 }}
                >
                  {title}
                </h3>
                <p className="text-sm text-[#1C1C1A]/55 leading-[1.7]">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-[#7B5E8A]/[0.07] border-t border-[#7B5E8A]/15" aria-labelledby="donors-cta-heading">
        <div className="max-w-xl mx-auto text-center">
          <h2
            id="donors-cta-heading"
            className="text-3xl text-[#1C1C1A] mb-4"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Money in politics shouldn&apos;t be a mystery
          </h2>
          <p className="text-base text-[#1C1C1A]/55 mb-8 leading-relaxed">
            From PAC contributions to independent expenditures, Beyond the Vote makes political
            funding transparent and accessible to every voter.
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
