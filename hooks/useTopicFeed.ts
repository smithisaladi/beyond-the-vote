import { TOPIC_BILLS, type Topic } from '@/lib/topics'

export interface FeedItem {
  topic: Topic
  bill: { number: string; title: string; status: string }
}

export function useTopicFeed(topics: Topic[]): FeedItem[] {
  const feedItems: FeedItem[] = []
  const seen = new Set<string>()
  for (const topic of topics) {
    for (const bill of TOPIC_BILLS[topic] ?? []) {
      if (!seen.has(bill.number) && feedItems.length < 4) {
        seen.add(bill.number)
        feedItems.push({ topic, bill })
      }
    }
  }
  return feedItems
}
