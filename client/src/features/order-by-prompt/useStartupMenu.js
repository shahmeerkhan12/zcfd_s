import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultMenuItems } from '../../entities/restaurant/model'
import { fetchFeed } from '../../shared/api/client'

const POLL_INTERVAL_MS = 30_000 // 30 seconds

/**
 * useStartupMenu — polls GET /api/restaurants/feed every 30 s.
 *
 * - Uses ETag / 304 so repeat polls with no data change are near-zero cost.
 * - Only triggers a re-render when the server returns new data.
 * - Stops polling while the tab is hidden (visibilitychange), resumes on focus.
 * - Cleans up the interval on unmount.
 *
 * @returns {{ items: MenuItem[], updatedAt: string|null, loading: boolean, error: string|null }}
 */
export function useStartupMenu() {
  const [items, setItems] = useState([])
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Keep etag in a ref so the interval closure always reads the latest value
  // without needing to restart the interval when it changes.
  const etagRef = useRef(null)
  const intervalRef = useRef(null)

  const poll = useCallback(async () => {
    try {
      const data = await fetchFeed(etagRef.current)
      if (data === null) return // 304 — nothing changed, skip re-render
      etagRef.current = data.etag ?? null
      setItems(data.items)
      setUpdatedAt(data.updatedAt)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial fetch immediately
    poll()

    // Start interval
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)

    // Pause when tab is hidden, resume when visible
    function handleVisibility() {
      if (document.hidden) {
        clearInterval(intervalRef.current)
      } else {
        poll() // fetch immediately on tab focus
        intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [poll])

  return { items: items.length ? items : defaultMenuItems, updatedAt, loading, error }
}
