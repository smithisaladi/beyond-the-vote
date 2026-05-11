export function isFinalPassageVote(question: string | null): boolean {
  if (!question) return false;
  const q = question.toLowerCase();
  return (
    q.includes("on passage") ||
    q.includes("on the resolution") ||
    q.includes("on agreeing") ||
    q.includes("on the joint resolution") ||
    q.includes("on the concurrent resolution") ||
    q.includes("on the nomination") ||
    q.startsWith("on passage of the bill")
  );
}
