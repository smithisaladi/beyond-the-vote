import { TopoBackground, MockBillCard, Feature, IconFilter, IconTrending, IconBookmark } from './Shared'
import { ALL_TOPICS, topicToSlug } from '@/lib/topics'

export function BillsTab({ onSignUp }: { onSignUp: () => void }) {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-20 px-6">
        <TopoBackground />
        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 items-center">
            <div>
              <span className="inline-block text-xs font-medium text-[#7B5E8A] bg-[#7B5E8A]/10 border border-[#7B5E8A]/20 px-3 py-1 rounded-full mb-6 tracking-[0.08em] uppercase">
                Bills Tracker
              </span>
              <h1
                className="text-5xl sm:text-6xl text-[#1C1C1A] mb-6 leading-[1.08] tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}
              >
                Follow legislation from introduction to law
              </h1>
              <p className="text-xl text-[#1C1C1A]/55 mb-9 leading-relaxed max-w-lg">
                Track thousands of bills in real time. Understand what's being debated in Congress
                and how it could affect your community before it becomes law.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onSignUp}
                  className="px-6 py-3 bg-[#7B5E8A] text-white rounded-xl text-sm font-medium hover:bg-[#6A4F78] transition-colors shadow-sm"
                >
                  Start tracking bills
                </button>
                <a
                  href="/bills"
                  className="px-6 py-3 bg-white border border-[#D6CFC4] text-[#1C1C1A] rounded-xl text-sm font-medium hover:border-[#7B5E8A]/50 hover:text-[#7B5E8A] transition-colors shadow-sm"
                >
                  Browse legislation →
                </a>
              </div>
            </div>

            {/* Preview cards */}
            <div className="flex flex-col gap-3 lg:mt-0 mt-4">
              <MockBillCard
                number="H.R. 4521"
                title="America COMPETES Act: Strengthening domestic semiconductor manufacturing and supply chains"
                status="Active"
                category="Economy"
              />
              <MockBillCard
                number="S. 1247"
                title="Clean Energy Transition Act: Accelerating renewable energy adoption and carbon reduction targets"
                status="Committee"
                category="Climate & Environment"
              />
              <MockBillCard
                number="H.R. 7910"
                title="Affordable Housing and Community Development Act"
                status="Passed"
                category="Housing"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-white/50 border-y border-[rgba(28,28,26,0.07)]" aria-labelledby="bills-features-heading">
        <div className="max-w-5xl mx-auto">
          <h2
            id="bills-features-heading"
            className="text-3xl text-[#1C1C1A] mb-2 text-center"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Track legislation like a professional
          </h2>
          <p className="text-sm text-[#1C1C1A]/50 text-center mb-14 max-w-md mx-auto tracking-[0.01em]">
            Powerful search and filtering tools make it easy to find what matters to you.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <Feature
              icon={<IconFilter />}
              title="Search & filter"
              description="Find bills by topic, status, sponsor, date, or keyword. Filter by party, committee, and chamber to narrow down thousands of bills instantly."
            />
            <Feature
              icon={<IconTrending />}
              title="Track progress"
              description="Watch bills move through every stage, from introduction and committee markup to floor vote and final passage, with real-time status updates."
            />
            <Feature
              icon={<IconBookmark />}
              title="Save and follow"
              description="Bookmark the bills you care about. Get notified when a tracked bill advances, stalls, or reaches the President's desk."
            />
          </div>
        </div>
      </section>

      {/* Topic highlights */}
      <section className="py-16 px-6" aria-labelledby="topics-heading">
        <div className="max-w-5xl mx-auto">
          <h2
            id="topics-heading"
            className="text-xl text-[#1C1C1A] mb-7 text-center"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 500 }}
          >
            Explore by topic
          </h2>
          <div className="flex flex-wrap gap-2 justify-center">
            {ALL_TOPICS.map(t => (
              <a
                key={t}
                href={`/bills?topics=${topicToSlug(t)}`}
                className="text-sm font-medium text-[#1C1C1A]/60 bg-white border border-[rgba(28,28,26,0.1)] px-4 py-2 rounded-full hover:border-[#7B5E8A]/50 hover:text-[#7B5E8A] transition-colors tracking-[0.01em]"
              >
                {t}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-[#7B5E8A]/[0.07] border-t border-[#7B5E8A]/15" aria-labelledby="bills-cta-heading">
        <div className="max-w-xl mx-auto text-center">
          <h2
            id="bills-cta-heading"
            className="text-3xl text-[#1C1C1A] mb-4"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Legislation shapes everyday life
          </h2>
          <p className="text-base text-[#1C1C1A]/55 mb-8 leading-relaxed">
            From healthcare costs to housing prices to climate policy, the bills moving through
            Congress today will affect you tomorrow. Stay ahead of it.
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
