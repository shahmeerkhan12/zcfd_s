import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
<<<<<<< HEAD
import { findSuggestions } from '../../shared/api/client'
=======
import { findSuggestions } from '../../shared/api/client.js'
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208

export const searchSuggestions = createAsyncThunk('prompt/search', findSuggestions)

const initialState = {
  query: '',
  suggestions: [],
  status: 'idle',
  error: '',
<<<<<<< HEAD
=======
  requestId: null,
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
}

const promptSlice = createSlice({
  name: 'prompt',
  initialState,
  reducers: {
    setQuery: (state, action) => {
      state.query = action.payload
<<<<<<< HEAD
=======
      if (!action.payload.trim()) {
        state.suggestions = []
        state.status = 'idle'
        state.error = ''
        state.requestId = null
      }
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
    },
    setPromptError: (state, action) => {
      state.error = action.payload
    },
    clearPromptError: (state) => {
      state.error = ''
    },
  },
  extraReducers: (builder) => {
    builder
<<<<<<< HEAD
      .addCase(searchSuggestions.pending, (state) => {
        state.status = 'loading'
        state.error = ''
      })
      .addCase(searchSuggestions.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.suggestions = action.payload.items
        if (action.payload.items.length === 0) {
          state.error = 'No exact matches yet. Try describing what you’re craving another way.'
        }
      })
      .addCase(searchSuggestions.rejected, (state, action) => {
=======
      .addCase(searchSuggestions.pending, (state, action) => {
        state.status = 'loading'
        state.error = ''
        state.suggestions = []
        state.requestId = action.meta.requestId
      })
      .addCase(searchSuggestions.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return
        state.requestId = null
        state.status = 'succeeded'
        state.suggestions = action.payload.items
        if (action.payload.items.length === 0) {
          state.error = 'No match.'
        }
      })
      .addCase(searchSuggestions.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return
        state.requestId = null
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
        state.status = 'failed'
        state.error = action.error.message || 'Could not connect to the server.'
      })
  },
})

export const { setQuery, setPromptError, clearPromptError } = promptSlice.actions
export default promptSlice.reducer
