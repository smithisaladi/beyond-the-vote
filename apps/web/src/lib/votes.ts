export function isFinalPassageVote(question: string | null): boolean {
  if (!question) return false;
  const q = question.toLowerCase();
  return q.includes("on passage") || q.includes("on the resolution") || q.includes("on agreeing");
}
