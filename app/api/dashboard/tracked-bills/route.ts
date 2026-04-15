import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Lightweight batch endpoint for the dashboard's tracked-bills section.
 * Returns only the fields the dashboard needs from local DB — no external APIs.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get tracked bill IDs
    const { data: tracked } = await supabase
      .from('tracked_bills')
      .select('bill_id')
      .eq('user_id', user.id)

    if (!tracked || tracked.length === 0) {
      return NextResponse.json({ bills: [] })
    }

    const ids = tracked.map((t: { bill_id: string }) => t.bill_id)

    // Fetch bills in one query
    const { data: bills } = await supabase
      .from('bills')
      .select('bill_id, bill_number, title, status, last_action_date, last_action_text, policy_area')
      .in('bill_id', ids)

    if (!bills || bills.length === 0) {
      return NextResponse.json({ bills: [] })
    }

    const result = bills.map((b: any) => ({
      id: b.bill_id,
      number: b.bill_number ?? b.bill_id,
      title: b.title,
      status: b.status ?? 'Unknown',
      lastAction: b.last_action_date
        ? new Date(b.last_action_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '',
      lastActionText: b.last_action_text ?? '',
      category: b.policy_area ?? '',
    }))

    return NextResponse.json({ bills: result })
  } catch (err) {
    console.error('Dashboard tracked-bills API error:', err)
    return NextResponse.json({ error: 'Failed to load tracked bills' }, { status: 500 })
  }
}
