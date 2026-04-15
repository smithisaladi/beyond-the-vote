import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

export const runtime = 'edge'

const WIDTH = 1200
const HEIGHT = 630

const PARTY_COLORS: Record<string, string> = {
  Democrat:    '#7B8FA8',
  Republican:  '#A87B7B',
  Independent: '#8A8A7A',
}

const STATUS_COLORS: Record<string, string> = {
  Active:    '#7B5E8A',
  Committee: '#8A8A7A',
  Stalled:   '#B85C38',
  Passed:    '#6A9B7B',
  Failed:    '#B85C38',
}

async function loadFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  return res.arrayBuffer()
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const type = searchParams.get('type') ?? 'default'

  // Fetch Fraunces for headings
  const frauncesFont = await loadFont(
    'https://fonts.gstatic.com/s/fraunces/v31/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemjDP_Wx5CFBmy5lsg.woff2'
  )

  const commonOptions = {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'Fraunces', data: frauncesFont, style: 'normal' as const },
    ],
  }

  // ─── Default / fallback ───────────────────────────────────────────────────

  if (type === 'default') {
    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height: HEIGHT,
            background: '#F5F0E8',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px',
          }}
        >
          <Wordmark />
          <div
            style={{
              marginTop: 24,
              fontSize: 28,
              color: 'rgba(28,28,26,0.55)',
              fontFamily: 'sans-serif',
              textAlign: 'center',
              maxWidth: 600,
            }}
          >
            Uncover the votes, funding, and values behind your elected officials.
          </div>
          <BottomAccent />
        </div>
      ),
      commonOptions,
    )
  }

  // ─── Politician ───────────────────────────────────────────────────────────

  if (type === 'politician') {
    const name   = searchParams.get('name')   ?? 'Unknown'
    const title  = searchParams.get('title')  ?? ''
    const state  = searchParams.get('state')  ?? ''
    const party  = searchParams.get('party')  ?? 'Independent'
    const partyColor = PARTY_COLORS[party] ?? PARTY_COLORS['Independent']

    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height: HEIGHT,
            background: '#F5F0E8',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '64px 80px',
          }}
        >
          <Wordmark />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Party + state badge row */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span
                style={{
                  background: `${partyColor}22`,
                  color: partyColor,
                  fontSize: 20,
                  fontFamily: 'sans-serif',
                  fontWeight: 500,
                  padding: '6px 16px',
                  borderRadius: 999,
                }}
              >
                {party}
              </span>
              {state && (
                <span style={{ fontSize: 20, color: 'rgba(28,28,26,0.45)', fontFamily: 'sans-serif' }}>
                  {state}
                </span>
              )}
            </div>

            {/* Name */}
            <div
              style={{
                fontSize: 72,
                fontFamily: 'Fraunces',
                color: '#1C1C1A',
                lineHeight: 1.1,
                letterSpacing: '-1px',
              }}
            >
              {name}
            </div>

            {/* Title */}
            {title && (
              <div style={{ fontSize: 28, color: 'rgba(28,28,26,0.55)', fontFamily: 'sans-serif' }}>
                {title}
              </div>
            )}
          </div>

          <BottomAccent />
        </div>
      ),
      commonOptions,
    )
  }

  // ─── Bill ─────────────────────────────────────────────────────────────────

  if (type === 'bill') {
    const number = searchParams.get('number') ?? ''
    const title  = searchParams.get('title')  ?? 'Untitled Bill'
    const status = searchParams.get('status') ?? 'Active'
    const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS['Active']

    // Truncate long titles for display
    const displayTitle = title.length > 120 ? title.slice(0, 117) + '…' : title

    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height: HEIGHT,
            background: '#F5F0E8',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '64px 80px',
          }}
        >
          <Wordmark />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Status + bill number row */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span
                style={{
                  background: `${statusColor}22`,
                  color: statusColor,
                  fontSize: 20,
                  fontFamily: 'sans-serif',
                  fontWeight: 500,
                  padding: '6px 16px',
                  borderRadius: 999,
                }}
              >
                {status}
              </span>
              {number && (
                <span style={{ fontSize: 20, color: 'rgba(28,28,26,0.45)', fontFamily: 'sans-serif', fontWeight: 500 }}>
                  {number}
                </span>
              )}
            </div>

            {/* Title */}
            <div
              style={{
                fontSize: 52,
                fontFamily: 'Fraunces',
                color: '#1C1C1A',
                lineHeight: 1.2,
                letterSpacing: '-0.5px',
                maxWidth: 960,
              }}
            >
              {displayTitle}
            </div>
          </div>

          <BottomAccent />
        </div>
      ),
      commonOptions,
    )
  }

  // Unrecognised type — fall through to default
  return new ImageResponse(<div style={{ background: '#F5F0E8', width: WIDTH, height: HEIGHT }} />, commonOptions)
}

// ─── Shared sub-elements ──────────────────────────────────────────────────────

function Wordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* Purple dot accent */}
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: '#7B5E8A',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 22,
          fontFamily: 'Fraunces',
          color: '#1C1C1A',
          letterSpacing: '-0.3px',
        }}
      >
        Beyond the Vote
      </span>
    </div>
  )
}

function BottomAccent() {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: 4,
        borderRadius: 2,
        background: 'linear-gradient(90deg, #7B5E8A 0%, rgba(155,127,166,0.2) 100%)',
      }}
    />
  )
}
