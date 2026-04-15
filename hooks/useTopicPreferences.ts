'use client'

import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { Topic } from '@/lib/topics'

const LS_KEY = 'btb_topics'

export function useTopicPreferences(user: User | null) {
  const [selectedTopics, setSelectedTopics] = useState<Set<Topic>>(new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (user) {
      const controller = new AbortController()
      fetch('/api/dashboard/topic-preferences', { signal: controller.signal })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.topics) {
            setSelectedTopics(new Set(data.topics as Topic[]))
          }
          setLoaded(true)
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setLoaded(true)
        })
      return () => controller.abort()
    } else {
      try {
        const raw = localStorage.getItem(LS_KEY)
        if (raw) setSelectedTopics(new Set(JSON.parse(raw) as Topic[]))
      } catch {}
      setLoaded(true)
    }
  }, [user])

  const toggle = async (t: Topic) => {
    const next = new Set(selectedTopics)
    const isSelected = next.has(t)
    isSelected ? next.delete(t) : next.add(t)
    setSelectedTopics(next)

    if (user) {
      const supabase = createClient()
      if (isSelected) {
        await supabase.from('topic_preferences').delete().eq('user_id', user.id).eq('topic', t)
      } else {
        await supabase.from('topic_preferences').insert({ user_id: user.id, topic: t })
      }
    } else {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify([...next]))
      } catch {}
    }
  }

  const clearAll = () => {
    setSelectedTopics(new Set())
    if (user) {
      createClient().from('topic_preferences').delete().eq('user_id', user.id)
    } else {
      try { localStorage.removeItem(LS_KEY) } catch {}
    }
  }

  return { selectedTopics, toggle, clearAll, loaded }
}
