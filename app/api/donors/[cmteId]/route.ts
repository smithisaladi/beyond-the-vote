import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s|[-/])\S/g, (c) => c.toUpperCase())
}

interface Recipient {
  bioguide_id: string
  name: string
  party: string
  state: string
  chamber: string
  amount: number
  direct: number
  ie_for: number
}

async function generatePacSummary(pac: {
  name: string
  connectedOrg: string | null
  totalContributions: number
  directTotal: number
  ieForTotal: number
  ieAgainstTotal: number
  recipientCount: number
  recipients: Recipient[]
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return ''

  const topRecipients = pac.recipients.slice(0, 10)
  const partyBreakdown = pac.recipients.reduce(
    (acc, r) => {
      if (r.party === 'Democrat') acc.dem++
      else if (r.party === 'Republican') acc.rep++
      else acc.ind++
      return acc
    },
    { dem: 0, rep: 0, ind: 0 },
  )

  const spendingBreakdown = [
    pac.directTotal > 0 ? `$${pac.directTotal.toLocaleString()} in direct contributions to campaigns` : null,
    pac.ieForTotal > 0 ? `$${pac.ieForTotal.toLocaleString()} in independent expenditures supporting candidates` : null,
    pac.ieAgainstTotal > 0 ? `$${pac.ieAgainstTotal.toLocaleString()} in independent expenditures opposing candidates` : null,
  ].filter(Boolean).join('; ')

  const prompt = `You are a neutral, factual political data analyst. Given the following data about a Political Action Committee (PAC), write a concise 2-3 sentence summary describing this PAC and how its spending is distributed.

Rules:
- Only state facts that are directly supported by the data provided. Do not speculate about motives, goals, ideology, or political leanings.
- Do not characterize the PAC as leaning toward any party or ideology. Simply report the distribution of spending (e.g. "distributed across X Democrats and Y Republicans").
- Do not use loaded language (e.g. "favors", "targets", "aligned with"). Use neutral terms like "contributed to", "distributed across", "supported".
- Accurately distinguish between direct contributions and independent expenditures. Do not call independent expenditures "contributions" or "donations."
- If a connected organization is listed, briefly note it. Otherwise describe the PAC by name.

PAC Name: ${pac.name}
${pac.connectedOrg ? `Connected Organization: ${pac.connectedOrg}` : ''}
Total spending: $${pac.totalContributions.toLocaleString()}
Spending breakdown: ${spendingBreakdown || 'N/A'}
Number of candidates supported: ${pac.recipientCount}
Party breakdown of recipients: ${partyBreakdown.dem} Democrats, ${partyBreakdown.rep} Republicans, ${partyBreakdown.ind} Independent
Top recipients: ${topRecipients.map((r) => `${r.name} (${r.party}, ${r.state}): $${Number(r.amount).toLocaleString()}`).join('; ')}

Write only the summary, no preamble or labels.`

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const block = message.content[0]
    if (block.type === 'text') return block.text
    return ''
  } catch (err) {
    console.error('AI summary generation failed:', err)
    return ''
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cmteId: string }> },
) {
  const { cmteId } = await params

  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('pac_detail', {
      target_cmte_id: cmteId,
    })

    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'PAC not found' }, { status: 404 })
    }

    const row = data[0]
    const recipients = (row.recipients ?? []).map((r: Recipient) => ({
      bioguideId: r.bioguide_id,
      name: r.name,
      party: r.party,
      state: r.state,
      chamber: r.chamber,
      amount: Number(r.amount),
      direct: Number(r.direct),
      ieFor: Number(r.ie_for),
    }))

    const pacData = {
      name: toTitleCase(row.cmte_name ?? ''),
      connectedOrg: row.connected_org ? toTitleCase(row.connected_org) : null,
      totalContributions: Number(row.total_contributions),
      recipientCount: Number(row.recipient_count),
      recipients,
    }

    const summary = await generatePacSummary({
      ...pacData,
      directTotal: Number(row.direct_total),
      ieForTotal: Number(row.ie_for_total),
      ieAgainstTotal: Number(row.ie_against_total),
      recipients: row.recipients ?? [],
    })

    return NextResponse.json({
      cmteId: row.cmte_id,
      ...pacData,
      directTotal: Number(row.direct_total),
      ieForTotal: Number(row.ie_for_total),
      ieAgainstTotal: Number(row.ie_against_total),
      summary,
    })
  } catch (err) {
    console.error('PAC detail API error:', err)
    return NextResponse.json(
      { error: 'Failed to load PAC details' },
      { status: 500 },
    )
  }
}
