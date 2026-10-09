import '../styles/global.css'
import Head from 'next/head'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import CommandPalette from '../components/CommandPalette'
import apiFetch from '../lib/api'
import { playAlertSound } from '../components/SoundAlert'

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)

  // Global Ctrl+K / Cmd+K shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Background health & dynamic title poller
  useEffect(() => {
    // Only check if logged in and not on auth pages
    if (router.pathname.startsWith('/auth') || router.pathname === '/noc') return

    const checkHealth = async () => {
      try {
        const token = localStorage.getItem('token')
        if (!token) return

        const res = await apiFetch('/api/alerts?limit=10').catch(() => null)
        if (res) {
          const firing = (res.alerts || res || []).filter(a => a.status === 'firing')
          const count = firing.length

          // If new alert appeared, sound the alert
          if (count > alertCount && alertCount > 0) {
            playAlertSound('critical')
          }
          setAlertCount(count)

          // Update dynamic tab title
          if (count > 0) {
            document.title = `🔴 (${count}) Внимание! | Мониторинг`
          } else {
            document.title = '🟢 Мониторинг | Все системы в норме'
          }
        }
      } catch (err) {
        // silent fail on network or auth errors
      }
    }

    checkHealth()
    const timer = setInterval(checkHealth, 30000)
    return () => clearInterval(timer)
  }, [router.pathname, alertCount])

  return (
    <>
      <Head>
        <title>🟢 Мониторинг | Инфраструктура</title>
        <meta name="description" content="Платформа комплексного мониторинга серверов, баз данных и виртуализации" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#07071a" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <Component {...pageProps} />

      {/* Global Quick Search (Ctrl+K) */}
      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}
