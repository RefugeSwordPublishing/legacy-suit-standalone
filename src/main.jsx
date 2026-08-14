import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { registerServiceWorker } from '@/lib/push'
import { logError } from '@/lib/errorLog'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// Capture uncaught errors and unhandled promise rejections into the error log.
window.addEventListener('error', (e) => { logError('window.error', e?.error || e?.message, { line: e?.lineno, col: e?.colno, file: e?.filename }) })
window.addEventListener('unhandledrejection', (e) => { logError('unhandledrejection', e?.reason) })

// Register the service worker (push + offline app shell; no-op if unsupported). Push permission is
// only requested later, when the user opts in from the notifications screen.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    registerServiceWorker()
    // Tell the SW to cache the assets this page loaded, so a cold offline start has the JS/CSS it
    // needs (the SW isn't controlling this first load, so it can't intercept these requests itself).
    navigator.serviceWorker.ready.then((reg) => {
      const warm = () => {
        const urls = new Set()
        document.querySelectorAll('script[src], link[href]').forEach((el) => {
          const u = el.src || el.href
          if (u && u.startsWith(location.origin)) urls.add(u)
        })
        try {
          performance.getEntriesByType('resource').forEach((e) => {
            if (e.name.startsWith(location.origin) && /\.(js|mjs|css|woff2?|ttf|png|svg|jpe?g|webp|ico)(\?|$)/i.test(e.name)) urls.add(e.name)
          })
        } catch { /* performance API unavailable */ }
        const target = reg.active || navigator.serviceWorker.controller
        if (target) target.postMessage({ type: 'cache-assets', urls: [...urls] })
      }
      // Wait a beat so lazily-loaded chunks and fonts land in the resource list too.
      setTimeout(warm, 3000)
    }).catch(() => {})
  })
}
