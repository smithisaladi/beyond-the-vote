import { Navigation } from '@/components/Navigation'
import { Hero } from '@/components/Hero'
import { Features } from '@/components/Features'
import { TopicFeed } from '@/components/TopicFeed'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        <Hero />
        <Features />
        <TopicFeed />
      </main>
      <footer className="w-full border-t border-[rgba(28,28,26,0.1)] py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-sm text-[#1C1C1A]/60">
          <p>© 2026 Beyond the Ballot. Bringing transparency to democracy.</p>
        </div>
      </footer>
    </div>
  )
}
