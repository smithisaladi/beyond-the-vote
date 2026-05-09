import { MarketingHeader } from '@/components/layout/MarketingHeader'

const LAST_UPDATED = 'April 2026'

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

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <MarketingHeader />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1
          className="text-4xl text-[#1C1C1A] mb-8"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}
        >
          Privacy Policy
        </h1>

        <div className="space-y-6 text-sm text-[#1C1C1A]/70 leading-relaxed">
          <p>
            <strong className="text-[#1C1C1A]">Last updated:</strong> {LAST_UPDATED}
          </p>

          <p>
            Your privacy matters to us. This policy explains what information
            we collect, how we use it, and your rights regarding your data.
          </p>

          <Section title="1. Information We Collect">
            <p>
              <strong className="text-[#1C1C1A]">Account information:</strong>{' '}
              When you create an account, we collect your name and email
              address. If you sign in with Google, we receive your name and
              email from your Google account.
            </p>
            <p>
              <strong className="text-[#1C1C1A]">Address lookups:</strong> When
              you search for representatives by address, your address is sent
              to our server to identify your congressional district. We do not
              store your address.
            </p>
            <p>
              <strong className="text-[#1C1C1A]">Usage data:</strong> We may
              collect basic analytics about how you use the platform to improve
              the service.
            </p>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>
              We use your information to provide and improve the service,
              including personalizing your experience with tracked bills and
              followed representatives. We do not sell your personal
              information to third parties.
            </p>
          </Section>

          <Section title="3. Data Storage">
            <p>
              Your data is stored securely using Supabase, which provides
              encryption at rest and in transit. We retain your data for as
              long as your account is active.
            </p>
          </Section>

          <Section title="4. Your Rights">
            <p>
              You may request deletion of your account and associated data at
              any time through the settings page. Upon deletion, we will remove
              your personal information from our systems.
            </p>
          </Section>

          <Section title="5. Third-Party Services">
            <p>
              We use the following third-party services: Supabase
              (authentication and database), Mapbox (address geocoding),
              Congress.gov API (legislative data), and the Federal Election
              Commission API (campaign finance data).
            </p>
          </Section>

          <Section title="6. Changes to This Policy">
            <p>
              We may update this policy from time to time. We will notify
              registered users of significant changes via email.
            </p>
          </Section>

          <Section title="7. Contact">
            <p>
              If you have questions about this privacy policy, please reach
              out through our platform.
            </p>
          </Section>
        </div>
      </main>
    </div>
  )
}
