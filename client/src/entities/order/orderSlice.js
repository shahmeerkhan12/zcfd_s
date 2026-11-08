import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { createOrder, getOrder } from '../../shared/api/client'
<<<<<<< HEAD
=======
import { searchSuggestions } from '../../features/order-by-prompt/promptSlice'
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208

export const submitOrder = createAsyncThunk('order/submit', createOrder)
export const refreshOrder = createAsyncThunk('order/refresh', getOrder)

const initialState = {
  selectedItem: null,
  current: null,
  status: 'idle',
  error: '',
  trackingError: '',
}

const orderSlice = createSlice({
  name: 'order',
  initialState,
  reducers: {
    selectItem: (state, action) => {
      state.selectedItem = action.payload
    },
    clearOrderError: (state) => {
      state.error = ''
    },
  },
  extraReducers: (builder) => {
    builder
<<<<<<< HEAD
=======
      .addCase(searchSuggestions.fulfilled, (state, action) => {
        if (action.payload.items.length === 0) state.selectedItem = null
      })
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
      .addCase(submitOrder.pending, (state) => {
        state.status = 'placing'
        state.error = ''
      })
      .addCase(submitOrder.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.current = action.payload.order
      })
      .addCase(submitOrder.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.error.message || 'Could not place your order.'
      })
      .addCase(refreshOrder.fulfilled, (state, action) => {
<<<<<<< HEAD
        state.current = action.payload.order
        state.trackingError = ''
      })
      .addCase(refreshOrder.rejected, (state) => {
=======
        if (state.current?.trackingNumber !== action.meta.arg) return
        state.current = action.payload.order
        state.trackingError = ''
      })
      .addCase(refreshOrder.rejected, (state, action) => {
        if (state.current?.trackingNumber !== action.meta.arg) return
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
        state.trackingError = 'Could not refresh the status. Showing the latest available update.'
      })
  },
})

export const { selectItem, clearOrderError } = orderSlice.actions
export default orderSlice.reducer
