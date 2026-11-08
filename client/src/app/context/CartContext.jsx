import { useCallback, useMemo, useRef, useState } from 'react'
import { CartContext } from './CartContext.js'
import { readCart, writeCart } from './cartStorage.js'

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try {
      return { items: readCart(window.localStorage), error: '' }
    } catch {
      return { items: [], error: 'Could not load your saved cart. Check your browser storage settings.' }
    }
  })
  const itemsRef = useRef(cart.items)

  const updateItems = useCallback((items) => {
    itemsRef.current = items
    try {
      writeCart(window.localStorage, items)
      setCart({ items, error: '' })
    } catch {
      setCart({ items, error: 'Could not save your cart. It may be lost when you reload; check your browser storage settings.' })
    }
  }, [])

  const addItem = useCallback((item) => {
    if (!itemsRef.current.some((cartItem) => cartItem.id === item.id)) {
      updateItems([...itemsRef.current, item])
    }
  }, [updateItems])
  const removeItem = useCallback((id) => {
    updateItems(itemsRef.current.filter((item) => item.id !== id))
  }, [updateItems])
  const value = useMemo(() => ({ items: cart.items, storageError: cart.error, addItem, removeItem }), [cart.items, cart.error, addItem, removeItem])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
