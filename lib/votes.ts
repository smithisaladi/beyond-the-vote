const FINAL_PASSAGE_PATTERNS = [
  /on passage/i,
  /on agreeing to the conference report/i,
  /on motion to concur/i,
  /on agreeing to the resolution/i,
  /on the joint resolution/i,
  /on the conference report/i,
]

export function isFinalPassageVote(question: string | null): boolean {
  if (!question) return false
  return FINAL_PASSAGE_PATTERNS.some(pattern => pattern.test(question))
}
