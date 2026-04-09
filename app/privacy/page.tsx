import Link from 'next/link'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <header className="sticky top-0 z-20 bg-[#F5F0E8]/95 backdrop-blur-sm border-b border-[rgba(28,28,26,0.1)]">
        <div className="max-w-6xl mx-auto px-6 flex items-center h-16 gap-6">
          <Link
            href="/"
            className="text-base text-[#1C1C1A] tracking-[0.01em] flex-shrink-0"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Beyond the Vote
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1
          className="text-4xl text-[#1C1C1A] mb-8"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}
        >
          Privacy Policy
        </h1>

        <div className="space-y-6 text-sm text-[#1C1C1A]/70 leading-relaxed">
          <p>
            <strong className="text-[#1C1C1A]">Last updated:</strong> April 2026
          </p>

          <p>
            Your privacy matters to us. This policy explains what information we collect, how we use
            it, and your rights regarding your data.
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            1. Information We Collect
          </h2>
          <p>
            <strong className="text-[#1C1C1A]">Account information:</strong> When you create an account, we collect your
            name and email address. If you sign in with Google, we receive your name and email from
            your Google account.
          </p>
          <p>
            <strong className="text-[#1C1C1A]">Address lookups:</strong> When you search for representatives by address,
            your address is sent to our server to identify your congressional district. We do not
            store your address.
          </p>
          <p>
            <strong className="text-[#1C1C1A]">Usage data:</strong> We may collect basic analytics about how you use the
            platform to improve the service.
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            2. How We Use Your Information
          </h2>
          <p>
            We use your information to provide and improve the service, including personalizing your
            experience with tracked bills and followed representatives. We do not sell your personal
            information to third parties.
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            3. Data Storage
          </h2>
          <p>
            Your data is stored securely using Supabase, which provides encryption at rest and in
            transit. We retain your data for as long as your account is active.
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            4. Your Rights
          </h2>
          <p>
            You may request deletion of your account and associated data at any time through the
            settings page. Upon deletion, we will remove your personal information from our systems.
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            5. Third-Party Services
          </h2>
          <p>
            We use the following third-party services: Supabase (authentication and database),
            Mapbox (address geocoding), Congress.gov API (legislative data), and the Federal
            Election Commission API (campaign finance data).
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            6. Changes to This Policy
          </h2>
          <p>
            We may update this policy from time to time. We will notify registered users of
            significant changes via email.
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            7. Contact
          </h2>
          <p>
            If you have questions about this privacy policy, please reach out through our platform.
          </p>
        </div>
      </main>
    </div>
  )
}
