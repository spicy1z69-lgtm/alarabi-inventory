
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import DesktopAuthGate from './DesktopAuthGate'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesktopAuthGate><App /></DesktopAuthGate>
  </React.StrictMode>,
)
