export const queryKeys = {
  bills: {
    all: ['bills'] as const,
    list: (filters: Record<string, unknown>, query: string) =>
      ['bills', 'list', { query, ...filters }] as const,
    detail: (id: string) => ['bills', 'detail', id] as const,
  },
  politicians: {
    all: ['politicians'] as const,
    detail: (id: string) => ['politicians', 'detail', id] as const,
  },
  donors: {
    all: ['donors'] as const,
    list: (query: string) => ['donors', 'list', { query }] as const,
    detail: (cmteId: string) => ['donors', 'detail', cmteId] as const,
    summary: (cmteId: string) => ['donors', 'summary', cmteId] as const,
  },
  dashboard: {
    followed: (userId: string) => ['dashboard', 'followed', userId] as const,
    trackedBills: (userId: string) => ['dashboard', 'tracked-bills', userId] as const,
    trackedBillIds: (userId: string) => ['dashboard', 'tracked-bill-ids', userId] as const,
    topicPreferences: (userId: string | null) => ['dashboard', 'topic-preferences', userId] as const,
    topicBills: (topicKey: string, limit: number) => ['dashboard', 'topic-bills', topicKey, limit] as const,
  },
} as const
