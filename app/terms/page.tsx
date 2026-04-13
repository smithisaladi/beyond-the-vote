import type { Metadata } from 'next'
import { MarketingHeader } from '@/components/layout/MarketingHeader'

/**
 * `/terms` — static terms of service.
 *
 * Server-rendered with no client JS. When the terms change materially,
 * bump the `LAST_UPDATED` string below and consider notifying registered
 * users (the policy commits to this in section 5).
 */

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The rules for using Beyond the Vote and the guarantees we make about the service.',
  alternates: { canonical: '/terms' },
}

const LAST_UPDATED = 'April 2026'

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <MarketingHeader />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1
          className="text-4xl text-[#1C1C1A] mb-8"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}
        >
          Terms of Service
        </h1>

        <div className="space-y-6 text-sm text-[#1C1C1A]/70 leading-relaxed">
          <p>
            <strong className="text-[#1C1C1A]">Last updated:</strong> {LAST_UPDATED}
          </p>

          <p>
            Welcome to Beyond the Vote. By accessing or using our platform,
            you agree to be bound by these Terms of Service. Please read them
            carefully.
          </p>

          <Section title="1. Use of Service">
            <p>
              Beyond the Vote provides publicly available information about
              elected officials, legislation, and voting records. You may use
              this service for personal, non-commercial purposes to stay
              informed about your representatives and legislation.
            </p>
          </Section>

          <Section title="2. Accounts">
            <p>
              You may create an account to access personalized features such
              as tracking bills and following representatives. You are
              responsible for maintaining the security of your account
              credentials.
            </p>
          </Section>

          <Section title="3. Data Accuracy">
            <p>
              We source data from official government APIs including
              Congress.gov and the Federal Election Commission. While we
              strive for accuracy, we cannot guarantee that all information
              is complete or up to date. Always verify critical information
              through official government sources.
            </p>
          </Section>

          <Section title="4. Prohibited Use">
            <p>
              You agree not to misuse the service, including but not limited
              to: automated scraping, distributing misleading information
              attributed to this platform, or using the service for any
              unlawful purpose.
            </p>
          </Section>

          <Section title="5. Changes to Terms">
            <p>
              We may update these terms from time to time. Continued use of
              the service after changes constitutes acceptance of the updated
              terms.
            </p>
          </Section>

          <Section title="6. Contact">
            <p>
              If you have questions about these terms, please reach out
              through our platform.
            </p>
          </Section>
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2
        className="text-lg text-[#1C1C1A] font-semibold pt-4"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {title}
      </h2>
      {children}
    </>
  )
}
