import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data } = await supabase
      .from('topic_preferences')
      .select('topic')
      .eq('user_id', user.id)

    return NextResponse.json({ topics: (data ?? []).map((r: { topic: string }) => r.topic) })
  } catch (err) {
    console.error('Dashboard topic-preferences API error:', err)
    return NextResponse.json({ error: 'Failed to load topic preferences' }, { status: 500 })
  }
}
