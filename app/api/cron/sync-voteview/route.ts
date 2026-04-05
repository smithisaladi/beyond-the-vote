import { NextRequest, NextResponse } from 'next/server'
import { syncVoteview } from '@/scripts/sync-voteview'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncVoteview()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cron/sync-voteview]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
