const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_CHARS = 8000

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS)
}

async function callEmbeddingsAPI(input: string | string[]): Promise<{ embedding: number[]; index: number }[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI embeddings API error ${res.status}: ${body}`)
  }

  const json = await res.json()
  return json.data as { embedding: number[]; index: number }[]
}

export async function getEmbedding(text: string): Promise<number[]> {
  const cleaned = cleanText(text)
  const data = await callEmbeddingsAPI(cleaned)
  return data[0].embedding
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const cleaned = texts.map(cleanText)
  const data = await callEmbeddingsAPI(cleaned)
  // OpenAI doesn't guarantee order — sort by index before returning
  return data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding)
}
