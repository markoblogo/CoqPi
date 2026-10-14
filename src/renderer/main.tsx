import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'
import './conversation.css'

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('flute-preview')) {
  void import('./flute-preview').then(({ CoqPiFlutePreview }) => {
    root.render(<React.StrictMode><CoqPiFlutePreview><App /></CoqPiFlutePreview></React.StrictMode>)
  })
} else {
  root.render(<React.StrictMode><App /></React.StrictMode>)
}
