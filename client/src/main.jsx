import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import './index.css'
import App from './App.jsx'
import { store } from './app/store'
<<<<<<< HEAD
=======
import { CartProvider } from './app/context/CartContext.jsx'
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
<<<<<<< HEAD
      <App />
=======
      <CartProvider>
        <App />
      </CartProvider>
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
    </Provider>
  </StrictMode>,
)
