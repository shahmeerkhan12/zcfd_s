import test from 'node:test'
import assert from 'node:assert/strict'
import promptReducer, { searchSuggestions, setQuery } from '../src/features/order-by-prompt/promptSlice.js'

const initialState = () => promptReducer(undefined, { type: 'init' })
const pending = (state, id) => promptReducer(state, searchSuggestions.pending(id, { query: 'pizza' }))
const fulfilled = (state, id, items) => promptReducer(state, searchSuggestions.fulfilled({ items }, id, { query: 'pizza' }))

test('clearing a search restores the idle state and removes results and errors', () => {
  let state = promptReducer(initialState(), setQuery('pizza'))
  state = fulfilled(pending(state, 'first'), 'first', [{ id: 'pizza' }])
  assert.equal(state.status, 'succeeded')
  assert.equal(state.suggestions.length, 1)
  state = promptReducer(state, setQuery('  '))
  assert.equal(state.status, 'idle')
  assert.deepEqual(state.suggestions, [])
  assert.equal(state.error, '')

  state = promptReducer(state, setQuery('unknown'))
  state = fulfilled(pending(state, 'second'), 'second', [])
  assert.equal(state.error, 'No match.')
  state = promptReducer(state, setQuery(''))
  assert.equal(state.status, 'idle')
  assert.equal(state.error, '')
})

test('a response or error from a cleared search cannot replace the startup menu', () => {
  let state = promptReducer(initialState(), setQuery('pizza'))
  state = pending(state, 'first')
  state = promptReducer(state, setQuery(''))
  state = fulfilled(state, 'first', [{ id: 'pizza' }])
  state = promptReducer(state, searchSuggestions.rejected(new Error('offline'), 'first', { query: 'pizza' }))
  assert.equal(state.status, 'idle')
  assert.deepEqual(state.suggestions, [])
  assert.equal(state.error, '')
})

test('a stale response cannot override a newer search', () => {
  let state = promptReducer(initialState(), setQuery('pizza'))
  state = pending(state, 'first')
  state = promptReducer(state, setQuery(''))
  state = promptReducer(state, setQuery('pasta'))
  state = pending(state, 'second')
  state = fulfilled(state, 'first', [{ id: 'pizza' }])
  assert.equal(state.status, 'loading')
  state = fulfilled(state, 'second', [{ id: 'pasta' }])
  assert.equal(state.status, 'succeeded')
  assert.deepEqual(state.suggestions, [{ id: 'pasta' }])
})
