import { NextRequest, NextResponse } from 'next/server'
import { syncBillEmbeddings } from '@/scripts/sync-bill-embeddings'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncBillEmbeddings()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cron/sync-bill-embeddings]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
