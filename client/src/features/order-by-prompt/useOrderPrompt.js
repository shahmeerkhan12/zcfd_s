import { useDispatch, useSelector } from 'react-redux'
import { searchSuggestions, setQuery } from './promptSlice'
import { DEMO_LOCATION } from '../../shared/lib/demoLocation'

export function useOrderPrompt() {
  const dispatch = useDispatch()
  const { query, suggestions, status, error } = useSelector((state) => state.prompt)

  function submitPrompt(event) {
    event.preventDefault()
    if (!query.trim()) return

    dispatch(searchSuggestions({ query: query.trim(), ...DEMO_LOCATION }))
  }

  function updateQuery(value) {
    dispatch(setQuery(value))
  }

  return { query, setQuery: updateQuery, suggestions, status, loading: status === 'loading', error, submitPrompt }
}
