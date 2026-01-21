import { useState, useEffect } from 'react'
import { nanoid } from 'nanoid'

const VISITOR_ID_KEY = 'civic-pulse-visitor-id'

export function useVisitorId(): string | null {
  const [visitorId, setVisitorId] = useState<string | null>(null)

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return

    let id = localStorage.getItem(VISITOR_ID_KEY)
    if (!id) {
      id = nanoid()
      localStorage.setItem(VISITOR_ID_KEY, id)
    }
    setVisitorId(id)
  }, [])

  return visitorId
}
