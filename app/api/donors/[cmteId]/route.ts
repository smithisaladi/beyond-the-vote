import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { pacDetail } from '@/lib/queries/pac-detail'
import { apiError } from '@/lib/api-errors'
import { toTitleCase } from '@/lib/format'

export const revalidate = 600

const AI_MODEL = 'claude-haiku-4-5-20251001'

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

  const prompt = `You are a knowledgeable, neutral political analyst. Given the following FEC data about a Political Action Committee (PAC), write an informative analysis in two short paragraphs.

**Paragraph 1 — Background:** Using your own knowledge, describe what this organization is, what industry or cause it represents, and any notable context about its role in politics. If you don't recognize the PAC, describe it based on the name and connected organization.

**Paragraph 2 — Spending analysis:** Summarize the FEC spending data provided below. Note the total amount, how spending breaks down between direct contributions and independent expenditures, and how it is distributed across parties and top recipients.

Rules:
- Be informative and direct. Avoid filler phrases like "based on the data provided."
- Accurately distinguish between direct contributions and independent expenditures.
- You may note partisan patterns (e.g. "overwhelmingly supports Republican candidates") when the data clearly shows it — just state the facts without editorializing about motives.
- Keep each paragraph to 2-3 sentences. Separate paragraphs with a blank line.

PAC Name: ${pac.name}
${pac.connectedOrg ? `Connected Organization: ${pac.connectedOrg}` : ''}
Total spending: $${pac.totalContributions.toLocaleString()}
Spending breakdown: ${spendingBreakdown || 'N/A'}
Number of candidates supported: ${pac.recipientCount}
Party breakdown of recipients: ${partyBreakdown.dem} Democrats, ${partyBreakdown.rep} Republicans, ${partyBreakdown.ind} Independent
Top recipients: ${topRecipients.map((r) => `${r.name} (${r.party}, ${r.state}): $${Number(r.amount).toLocaleString()}`).join('; ')}

Write only the two paragraphs, no headings or labels.`

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    const block = message.content[0]
    if (block.type === 'text') return block.text
    return ''
  } catch (err) {
    console.error('[api/donors/[cmteId]] AI summary generation failed:', err)
    return ''
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cmteId: string }> },
) {
  const { cmteId } = await params

  try {
    const data = await pacDetail(cmteId)
    if (data.length === 0) {
      return apiError('PAC not found', 404)
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
      name: row.cmte_name ?? '',
      connectedOrg: row.connected_org ?? null,
      totalContributions: Number(row.total_contributions),
      recipientCount: Number(row.recipient_count),
      recipients,
    }

    const includeSummary = req.nextUrl.searchParams.get('summary') === '1'

    let summary = ''
    if (includeSummary) {
      summary = await generatePacSummary({
        ...pacData,
        directTotal: Number(row.direct_total),
        ieForTotal: Number(row.ie_for_total),
        ieAgainstTotal: Number(row.ie_against_total),
        recipients: (row.recipients ?? []).map((r: Recipient) => ({
          ...r,
          name: toTitleCase(r.name ?? ''),
        })),
      })
    }

    return NextResponse.json({
      cmteId: row.cmte_id,
      ...pacData,
      directTotal: Number(row.direct_total),
      ieForTotal: Number(row.ie_for_total),
      ieAgainstTotal: Number(row.ie_against_total),
      summary,
    })
  } catch (err) {
    console.error('[api/donors/[cmteId]]', err)
    return apiError('Failed to load PAC details', 500)
  }
}
