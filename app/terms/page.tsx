import Link from 'next/link'

export default function TermsOfService() {
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
          Terms of Service
        </h1>

        <div className="space-y-6 text-sm text-[#1C1C1A]/70 leading-relaxed">
          <p>
            <strong className="text-[#1C1C1A]">Last updated:</strong> April 2026
          </p>

          <p>
            Welcome to Beyond the Vote. By accessing or using our platform, you agree to be bound by
            these Terms of Service. Please read them carefully.
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            1. Use of Service
          </h2>
          <p>
            Beyond the Vote provides publicly available information about elected officials,
            legislation, and voting records. You may use this service for personal, non-commercial
            purposes to stay informed about your representatives and legislation.
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            2. Accounts
          </h2>
          <p>
            You may create an account to access personalized features such as tracking bills and
            following representatives. You are responsible for maintaining the security of your
            account credentials.
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            3. Data Accuracy
          </h2>
          <p>
            We source data from official government APIs including Congress.gov and the Federal
            Election Commission. While we strive for accuracy, we cannot guarantee that all
            information is complete or up to date. Always verify critical information through
            official government sources.
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            4. Prohibited Use
          </h2>
          <p>
            You agree not to misuse the service, including but not limited to: automated scraping,
            distributing misleading information attributed to this platform, or using the service
            for any unlawful purpose.
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            5. Changes to Terms
          </h2>
          <p>
            We may update these terms from time to time. Continued use of the service after changes
            constitutes acceptance of the updated terms.
          </p>

          <h2 className="text-lg text-[#1C1C1A] font-semibold pt-4" style={{ fontFamily: 'var(--font-serif)' }}>
            6. Contact
          </h2>
          <p>
            If you have questions about these terms, please reach out through our platform.
          </p>
        </div>
      </main>
    </div>
  )
}
