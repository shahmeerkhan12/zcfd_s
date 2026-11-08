import { useDispatch, useSelector } from 'react-redux'
<<<<<<< HEAD
import { searchSuggestions, setPromptError, setQuery } from './promptSlice'
=======
import { searchSuggestions, setQuery } from './promptSlice'
import { DEMO_LOCATION } from '../../shared/lib/demoLocation'
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208

export function useOrderPrompt() {
  const dispatch = useDispatch()
  const { query, suggestions, status, error } = useSelector((state) => state.prompt)

  function submitPrompt(event) {
    event.preventDefault()
<<<<<<< HEAD
    if (!query.trim()) {
      dispatch(setPromptError('Tell us what you’re craving and we’ll find something for you.'))
      return
    }

    dispatch(searchSuggestions(query.trim()))
=======
    if (!query.trim()) return

    dispatch(searchSuggestions({ query: query.trim(), ...DEMO_LOCATION }))
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
  }

  function updateQuery(value) {
    dispatch(setQuery(value))
  }

<<<<<<< HEAD
  return { query, setQuery: updateQuery, suggestions, loading: status === 'loading', error, submitPrompt }
=======
  return { query, setQuery: updateQuery, suggestions, status, loading: status === 'loading', error, submitPrompt }
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
}
