import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Search,
  RefreshCw,
  Trash2,
  Activity,
  Check,
  CheckCheck,
  Flame,
  Volume2,
  VolumeX,
  ExternalLink,
  Filter,
  ShieldAlert,
  Clock,
  X,
  Info,
  Layers,
  Server,
  Globe,
  Database,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react'

// Web Audio API Synthesizer - works everywhere without external audio files
function playAudioAlert(type = 'critical') {
  if (typeof window === 'undefined') return
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    if (ctx.state === 'suspended') {
      ctx.resume()
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    const now = ctx.currentTime
    if (type === 'critical') {
      // High urgency dual-tone alarm
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(659.25, now) // E5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15) // A5
      osc.frequency.setValueAtTime(659.25, now + 0.2)
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.35)
      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
      osc.start(now)
      osc.stop(now + 0.45)
    } else {
      // Soft warm notification chime
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, now) // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18) // A5
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      osc.start(now)
      osc.stop(now + 0.35)
    }
  } catch (e) {
    console.warn('Audio alert error:', e)
  }
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffSec < 60) return 'только что'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} мин назад`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours} ч назад`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} д назад`
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatDuration(startStr, endStr) {
  if (!startStr) return null
  const start = new Date(startStr).getTime()
  const end = endStr ? new Date(endStr).getTime() : Date.now()
  if (isNaN(start) || isNaN(end)) return null
  const diffMin = Math.max(0, Math.floor((end - start) / 60000))
  if (diffMin < 1) return '< 1 мин'
  if (diffMin < 60) return `${diffMin} мин`
  const hours = Math.floor(diffMin / 60)
  const remMin = diffMin % 60
  if (hours < 24) return remMin > 0 ? `${hours}ч ${remMin}м` : `${hours}ч`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return `${days}д ${remHours}ч`
}

function AlertBadge({ severity }) {
  const configs = {
    critical: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.35)', color: '#f87171', label: 'Критично', dot: '#ef4444' },
    warning: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)', color: '#fbbf24', label: 'Предупреждение', dot: '#f59e0b' },
    info: { bg: 'rgba(37, 99, 235, 0.12)', border: 'rgba(37, 99, 235, 0.35)', color: '#60a5fa', label: 'Информация', dot: '#3b82f6' },
    resolved: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', color: '#34d399', label: 'Решено', dot: '#10b981' },
  }
  const c = configs[severity] || configs.info

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 8px',
      borderRadius: 4,
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.color,
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: '0.02em',
      textTransform: 'uppercase'
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, boxShadow: severity === 'critical' ? '0 0 6px #ef4444' : 'none' }} />
      <span>{c.label}</span>
    </span>
  )
}

function StatBox({ label, value, color, icon: IconComp, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#101726',
        border: `1px solid ${active ? '#2563eb' : '#1e293b'}`,
        borderRadius: 6,
        padding: '12px 14px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        boxShadow: active ? '0 0 0 1px #2563eb' : 'none',
        position: 'relative',
        overflow: 'hidden'
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.borderColor = '#334155'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.borderColor = '#1e293b'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {IconComp && <IconComp size={15} style={{ color: active ? '#60a5fa' : '#64748b' }} />}
        <span style={{ fontSize: 11, color: active ? '#94a3b8' : '#64748b', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

export default function Alerts() {
  const [mounted, setMounted] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [stats, setStats] = useState({ total: 0, active: 0, critical: 0, warning: 0, resolved: 0 })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  
  // Filters & Search
  const [filter, setFilter] = useState('all') // all, active, critical, warning, resolved
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [targetTypeFilter, setTargetTypeFilter] = useState('all')
  const [limit, setLimit] = useState(100)
  const [alertSearch, setAlertSearch] = useState('')
  
  // Multi-selection
  const [selectedIds, setSelectedIds] = useState([])
  
  // Sound Alerts
  const [soundEnabled, setSoundEnabled] = useState(true)
  const soundEnabledRef = useRef(true)
  const knownActiveAlertIdsRef = useRef(new Set())
  const hasInitializedAlertsRef = useRef(false)
  
  // Incident Modal
  const [incidentModal, setIncidentModal] = useState({
    open: false,
    title: '',
    severity: 'critical',
    target_type: '',
    target_id: '',
    target_name: '',
    description: '',
    alert_ids: [],
    loading: false
  })

  const wsRef = useRef(null)
  const router = useRouter()
  const highlightedAlertId = router.query.alertId ? String(router.query.alertId) : null

  // Sound preference load
  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      const savedSound = localStorage.getItem('alerts_sound_enabled')
      if (savedSound !== null) {
        const val = savedSound === 'true'
        setSoundEnabled(val)
        soundEnabledRef.current = val
      }
    }
  }, [])

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev))
    }, 4000)
  }, [])

  const toggleSound = () => {
    const nextVal = !soundEnabled
    setSoundEnabled(nextVal)
    soundEnabledRef.current = nextVal
    if (typeof window !== 'undefined') {
      localStorage.setItem('alerts_sound_enabled', String(nextVal))
    }
    if (nextVal) {
      playAudioAlert('info')
      showToast('Звуковые оповещения включены', 'info')
    } else {
      showToast('Звуковые оповещения отключены', 'info')
    }
  }

  const testSound = () => {
    playAudioAlert('critical')
    showToast('Тест звукового оповещения (критический алерт)', 'info')
  }

  const loadAlerts = useCallback(async (isBackground = false) => {
    if (!isBackground) setRefreshing(true)
    try {
      setError(null)
      const [alertsRes, statsRes] = await Promise.all([
        apiFetch(`/api/alerts?limit=${limit}`),
        apiFetch('/api/alerts/stats')
      ])
      const incomingAlerts = alertsRes.alerts || []
      setAlerts(incomingAlerts)
      setStats(statsRes || { total: 0, active: 0, critical: 0, warning: 0, resolved: 0 })

      // Check for newly triggered active alerts and play chime
      const currentActiveIds = new Set(incomingAlerts.filter(a => a.is_active).map(a => a.id))
      if (hasInitializedAlertsRef.current && soundEnabledRef.current) {
        const newActiveAlerts = incomingAlerts.filter(a => a.is_active && !knownActiveAlertIdsRef.current.has(a.id))
        if (newActiveAlerts.length > 0) {
          const hasCritical = newActiveAlerts.some(a => a.severity === 'critical')
          playAudioAlert(hasCritical ? 'critical' : 'warning')
          showToast(`Получено новых алертов: ${newActiveAlerts.length}`, hasCritical ? 'error' : 'info')
        }
      }
      knownActiveAlertIdsRef.current = currentActiveIds
      hasInitializedAlertsRef.current = true
    } catch (err) {
      setError(err.message || 'Ошибка загрузки алертов')
    } finally {
      setLoading(false)
      if (!isBackground) setRefreshing(false)
    }
  }, [limit, showToast])

  useEffect(() => {
    loadAlerts()
    const interval = setInterval(() => loadAlerts(true), 10000)
    return () => clearInterval(interval)
  }, [loadAlerts])

  // WebSocket for instant notification
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || ''
    const wsToken = localStorage.getItem('token')
    if (!base || !wsToken) return

    const wsUrl = base.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(wsToken)
    let ws = null
    try {
      ws = new WebSocket(wsUrl)
      wsRef.current = ws
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if (msg.alert) {
            loadAlerts(true)
          }
        } catch {}
      }
    } catch {}

    return () => {
      if (ws) ws.close()
    }
  }, [loadAlerts])

  // Scroll to highlighted alert
  useEffect(() => {
    if (highlightedAlertId && alerts.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`alert-${highlightedAlertId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 300)
    }
  }, [highlightedAlertId, alerts])

  // Categories list derived dynamically from existing alerts
  const availableCategories = useMemo(() => {
    const cats = new Set()
    alerts.forEach(a => { if (a.category) cats.add(a.category) })
    return Array.from(cats).sort()
  }, [alerts])

  // Target types derived from alerts
  const availableTargetTypes = useMemo(() => {
    const types = new Set()
    alerts.forEach(a => { if (a.target_type) types.add(a.target_type) })
    return Array.from(types).sort()
  }, [alerts])

  // Actions
  async function resolveAlert(alertId, e) {
    if (e) e.stopPropagation()
    try {
      await apiFetch(`/api/alerts/${encodeURIComponent(alertId)}/resolve`, { method: 'POST' })
      showToast('Алерт успешно разрешён', 'success')
      setSelectedIds(prev => prev.filter(id => id !== alertId))
      await loadAlerts(true)
    } catch (err) {
      setError('Ошибка при подтверждении алерта: ' + (err.message || ''))
    }
  }

  async function resolveBulk() {
    if (selectedIds.length === 0) return
    try {
      const res = await apiFetch('/api/alerts/bulk-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_ids: selectedIds })
      })
      showToast(res.message || `Разрешено алертов: ${selectedIds.length}`, 'success')
      setSelectedIds([])
      await loadAlerts(true)
    } catch (err) {
      setError('Ошибка массового разрешения: ' + (err.message || ''))
    }
  }

  async function resolveAllActive() {
    if (stats.active === 0) {
      showToast('Нет активных алертов для разрешения', 'info')
      return
    }
    if (!confirm(`Вы действительно хотите разрешить все активные алерты (${stats.active})?`)) return
    try {
      const res = await apiFetch('/api/alerts/resolve-all', { method: 'POST' })
      showToast(res.message || 'Все активные алерты разрешены', 'success')
      setSelectedIds([])
      await loadAlerts(true)
    } catch (err) {
      setError('Ошибка при разрешении всех алертов: ' + (err.message || ''))
    }
  }

  async function clearResolved() {
    if (stats.resolved === 0) {
      showToast('Нет решённых алертов для очистки', 'info')
      return
    }
    if (!confirm(`Удалить все решённые алерты (${stats.resolved}) из истории базы данных?`)) return
    try {
      const res = await apiFetch('/api/alerts', { method: 'DELETE' })
      showToast(res.message || 'История решённых алертов очищена', 'success')
      setSelectedIds([])
      await loadAlerts(true)
    } catch (err) {
      setError('Ошибка очистки журнала: ' + (err.message || ''))
    }
  }

  // Open Incident Creation Modal
  function openIncidentModalForAlert(alert, e) {
    if (e) e.stopPropagation()
    setIncidentModal({
      open: true,
      title: alert.title || `Сбой на ${alert.target_name || alert.target_type}`,
      severity: alert.severity === 'critical' ? 'critical' : (alert.severity === 'warning' ? 'warning' : 'info'),
      target_type: alert.target_type || 'server',
      target_id: alert.target_id || '',
      target_name: alert.target_name || '',
      description: `Алерт ID: #${alert.id}\nКатегория: ${alert.category || 'system'}\nОбъект: ${alert.target_name || alert.target_id}\nМетрика: ${alert.metric_key || '—'} = ${alert.metric_value != null ? alert.metric_value : '—'} (порог: ${alert.threshold || '—'})\nСообщение: ${alert.message || '—'}\nВремя фиксации: ${alert.created_at ? new Date(alert.created_at).toLocaleString('ru-RU') : '—'}`,
      alert_ids: [alert.id],
      loading: false
    })
  }

  function openIncidentModalForSelected() {
    if (selectedIds.length === 0) return
    const selAlerts = alerts.filter(a => selectedIds.includes(a.id))
    const first = selAlerts[0] || {}
    const hasCritical = selAlerts.some(a => a.severity === 'critical')
    
    const descLines = selAlerts.map(a => 
      `• [#${a.id}] [${a.severity}] ${a.target_name || a.target_id}: ${a.title} (${a.message || ''})`
    ).join('\n')

    setIncidentModal({
      open: true,
      title: `Групповой инцидент: сбой на объектах (${selAlerts.length} алертов)`,
      severity: hasCritical ? 'critical' : 'warning',
      target_type: first.target_type || 'server',
      target_id: first.target_id || '',
      target_name: first.target_name || '',
      description: `Групповой инцидент, сформированный из ${selAlerts.length} алертов:\n\n${descLines}`,
      alert_ids: selectedIds,
      loading: false
    })
  }

  async function submitIncident() {
    if (!incidentModal.title.trim()) {
      alert('Укажите название инцидента')
      return
    }
    setIncidentModal(prev => ({ ...prev, loading: true }))
    try {
      const payload = {
        title: incidentModal.title.trim(),
        description: incidentModal.description,
        severity: incidentModal.severity,
        target_type: incidentModal.target_type || null,
        target_id: incidentModal.target_id ? String(incidentModal.target_id) : null,
        alert_ids: incidentModal.alert_ids
      }
      const res = await apiFetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      showToast(`Инцидент #${res.id} успешно создан!`, 'success')
      setIncidentModal(prev => ({ ...prev, open: false, loading: false }))
      // Offer navigation
      if (confirm(`Инцидент #${res.id} создан. Перейти в раздел Инциденты?`)) {
        router.push(`/incidents?id=${res.id}`)
      }
    } catch (err) {
      alert('Ошибка при создании инцидента: ' + (err.message || ''))
      setIncidentModal(prev => ({ ...prev, loading: false }))
    }
  }

  // Filtered alerts
  const filtered = useMemo(() => {
    return alerts.filter(a => {
      // Tab filter
      if (filter === 'active') { if (!a.is_active) return false }
      else if (filter === 'resolved') { if (a.is_active) return false }
      else if (filter === 'critical') { if (a.severity !== 'critical' || !a.is_active) return false }
      else if (filter === 'warning') { if (a.severity !== 'warning' || !a.is_active) return false }

      // Category filter
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false

      // Target Type filter
      if (targetTypeFilter !== 'all' && a.target_type !== targetTypeFilter) return false

      // Search query
      if (alertSearch.trim()) {
        const q = alertSearch.toLowerCase()
        const matchTitle = (a.title || '').toLowerCase().includes(q)
        const matchMsg = (a.message || '').toLowerCase().includes(q)
        const matchTarget = (a.target_name || '').toLowerCase().includes(q)
        const matchTargetId = String(a.target_id || '').toLowerCase().includes(q)
        const matchCat = (a.category || '').toLowerCase().includes(q)
        const matchKey = (a.metric_key || '').toLowerCase().includes(q)
        if (!matchTitle && !matchMsg && !matchTarget && !matchTargetId && !matchCat && !matchKey) {
          return false
        }
      }
      return true
    })
  }, [alerts, filter, categoryFilter, targetTypeFilter, alertSearch])

  // Select all visible active alerts
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const idsToSelect = filtered.filter(a => a.is_active).map(a => a.id)
      setSelectedIds(idsToSelect)
    } else {
      setSelectedIds([])
    }
  }

  const toggleSelectOne = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const allVisibleActiveSelected = useMemo(() => {
    const activeVisible = filtered.filter(a => a.is_active)
    if (activeVisible.length === 0) return false
    return activeVisible.every(a => selectedIds.includes(a.id))
  }, [filtered, selectedIds])

  const getTargetUrl = (targetType, targetId) => {
    if (!targetType) return null
    if (targetType === 'server') return '/servers'
    if (targetType === 'website') return '/websites'
    if (targetType === 'database') return '/databases'
    if (targetType === 'docker') return '/docker'
    if (targetType === 'k8s') return '/kubernetes'
    return null
  }

  const getTargetIcon = (targetType) => {
    if (targetType === 'server') return Server
    if (targetType === 'website') return Globe
    if (targetType === 'database') return Database
    return Layers
  }

  if (!mounted) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 13 }}>
            <Activity className="animate-spin" size={18} />
            Загрузка журнала алертов...
          </div>
        </div>
      </div>
    )
  }

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: '20px 28px', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
          
          {/* Toast Notification */}
          {toast && (
            <div style={{
              position: 'fixed',
              top: 20,
              right: 28,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 6,
              background: toast.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : (toast.type === 'info' ? 'rgba(37, 99, 235, 0.95)' : 'rgba(16, 185, 129, 0.95)'),
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 600,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.2)',
              animation: 'slideIn 0.2s ease-out'
            }}>
              {toast.type === 'error' ? <AlertOctagon size={16} /> : (toast.type === 'info' ? <Info size={16} /> : <CheckCircle2 size={16} />)}
              <span>{toast.message}</span>
              <button
                onClick={() => setToast(null)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', padding: 0, marginLeft: 8 }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: stats.critical > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                border: `1px solid ${stats.critical > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(37, 99, 235, 0.3)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Bell size={20} style={{ color: stats.critical > 0 ? '#f87171' : '#60a5fa' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                    Центр Оповещений и Алертов
                  </h1>
                  {stats.active > 0 ? (
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#f87171',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                      {stats.active} активн.
                    </span>
                  ) : (
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#34d399',
                      fontSize: 11,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <CheckCircle2 size={12} />
                      Норма
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                  Мониторинг порогов в реальном времени, автоматическая фиксация инцидентов и аудит сбоев
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Sound Toggle */}
              <button
                onClick={toggleSound}
                title={soundEnabled ? 'Звук включен (кликните чтобы заглушить)' : 'Звук выключен (кликните чтобы включить)'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: `1px solid ${soundEnabled ? 'rgba(37, 99, 235, 0.4)' : '#1e293b'}`,
                  background: soundEnabled ? 'rgba(37, 99, 235, 0.1)' : '#101726',
                  color: soundEnabled ? '#60a5fa' : '#64748b',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 600,
                  transition: 'all 0.15s'
                }}
              >
                {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                <span>{soundEnabled ? 'Звук: ВКЛ' : 'Звук: ВЫКЛ'}</span>
              </button>

              <button
                onClick={testSound}
                title="Проверить звучание оповещения"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#101726',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 500,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8' }}
              >
                Тест
              </button>

              {/* Resolve All Active */}
              {stats.active > 0 && (
                <button
                  onClick={resolveAllActive}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 4,
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    background: 'rgba(16, 185, 129, 0.12)',
                    color: '#34d399',
                    cursor: 'pointer',
                    fontSize: 11.5,
                    fontWeight: 600,
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.22)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)' }}
                >
                  <CheckCheck size={13} />
                  <span>Решить все ({stats.active})</span>
                </button>
              )}

              {/* Refresh */}
              <button
                onClick={() => loadAlerts(false)}
                disabled={refreshing}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#101726',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 500,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8' }}
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                <span>{refreshing ? 'Обновление...' : 'Обновить'}</span>
              </button>

              {/* Clear Resolved */}
              <button
                onClick={clearResolved}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  background: 'rgba(239, 68, 68, 0.08)',
                  color: '#f87171',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 500,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)' }}
              >
                <Trash2 size={13} />
                <span>Очистить решённые</span>
              </button>
            </div>
          </div>

          {/* Interactive Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
            <StatBox
              label="Всего алертов"
              value={stats.total}
              color="#f8fafc"
              icon={ClipboardList}
              active={filter === 'all'}
              onClick={() => setFilter('all')}
            />
            <StatBox
              label="Активных"
              value={stats.active}
              color={stats.active > 0 ? '#f87171' : '#34d399'}
              icon={Bell}
              active={filter === 'active'}
              onClick={() => setFilter('active')}
            />
            <StatBox
              label="Критичных"
              value={stats.critical}
              color={stats.critical > 0 ? '#f87171' : '#64748b'}
              icon={AlertTriangle}
              active={filter === 'critical'}
              onClick={() => setFilter('critical')}
            />
            <StatBox
              label="Предупреждений"
              value={stats.warning}
              color={stats.warning > 0 ? '#fbbf24' : '#64748b'}
              icon={AlertCircle}
              active={filter === 'warning'}
              onClick={() => setFilter('warning')}
            />
            <StatBox
              label="Решённых"
              value={stats.resolved}
              color="#34d399"
              icon={CheckCircle2}
              active={filter === 'resolved'}
              onClick={() => setFilter('resolved')}
            />
          </div>

          {/* Filter Bar & Bulk Actions */}
          <div style={{
            display: 'flex',
            gap: 8,
            marginBottom: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            background: '#101726',
            border: '1px solid #1e293b',
            borderRadius: 6,
            padding: '8px 12px'
          }}>
            {/* Status Tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { id: 'all', l: 'Все', count: stats.total },
                { id: 'active', l: 'Активные', count: stats.active },
                { id: 'critical', l: 'Критичные', count: stats.critical },
                { id: 'warning', l: 'Предупреждения', count: stats.warning },
                { id: 'resolved', l: 'Решённые', count: stats.resolved }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 4,
                    border: `1px solid ${filter === f.id ? '#2563eb' : '#1e293b'}`,
                    cursor: 'pointer',
                    fontSize: 11.5,
                    fontWeight: 600,
                    background: filter === f.id ? '#2563eb' : '#090d16',
                    color: filter === f.id ? '#ffffff' : '#94a3b8',
                    transition: 'all 0.15s',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span>{f.l}</span>
                  <span style={{
                    fontSize: 10,
                    padding: '1px 5px',
                    borderRadius: 8,
                    background: filter === f.id ? 'rgba(255,255,255,0.2)' : '#1e293b',
                    color: filter === f.id ? '#fff' : '#64748b'
                  }}>
                    {f.count}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 22, background: '#1e293b', margin: '0 4px' }} />

            {/* Category Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={13} style={{ color: '#64748b' }} />
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#090d16',
                  color: categoryFilter !== 'all' ? '#60a5fa' : '#94a3b8',
                  fontSize: 11.5,
                  fontWeight: 500,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">Все категории</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Target Type Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                value={targetTypeFilter}
                onChange={e => setTargetTypeFilter(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#090d16',
                  color: targetTypeFilter !== 'all' ? '#60a5fa' : '#94a3b8',
                  fontSize: 11.5,
                  fontWeight: 500,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">Все объекты</option>
                <option value="server">Серверы (server)</option>
                <option value="website">Веб-сайты (website)</option>
                <option value="database">Базы данных (database)</option>
                <option value="docker">Контейнеры (docker)</option>
                <option value="k8s">Кластеры (k8s)</option>
              </select>
            </div>

            {/* Limit Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>Лимит:</span>
              <select
                value={limit}
                onChange={e => setLimit(Number(e.target.value))}
                style={{
                  padding: '5px 8px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#090d16',
                  color: '#94a3b8',
                  fontSize: 11.5,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
            </div>

            <div style={{ flex: 1 }} />

            {/* Search Input */}
            <div style={{ position: 'relative', width: 230 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: 8, color: '#64748b' }} />
              <input
                value={alertSearch}
                onChange={e => setAlertSearch(e.target.value)}
                placeholder="Поиск по названию, метрике..."
                style={{
                  padding: '5px 10px 5px 28px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#090d16',
                  color: '#f8fafc',
                  fontSize: 11.5,
                  width: '100%',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {alertSearch && (
                <button
                  onClick={() => setAlertSearch('')}
                  style={{ position: 'absolute', right: 8, top: 7, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Bulk Selection Actions Bar */}
          {selectedIds.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 14px',
              borderRadius: 6,
              background: 'rgba(37, 99, 235, 0.12)',
              border: '1px solid rgba(37, 99, 235, 0.35)',
              marginBottom: 10,
              animation: 'fadeIn 0.15s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa' }}>
                  Выбрано алертов: {selectedIds.length}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  (из {filtered.length} видимых)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={resolveBulk}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    borderRadius: 4,
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    background: '#10b981',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontSize: 11.5,
                    fontWeight: 600,
                    transition: 'all 0.15s'
                  }}
                >
                  <CheckCheck size={13} />
                  <span>Решить выбранные ({selectedIds.length})</span>
                </button>

                <button
                  onClick={openIncidentModalForSelected}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    borderRadius: 4,
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#f87171',
                    cursor: 'pointer',
                    fontSize: 11.5,
                    fontWeight: 600,
                    transition: 'all 0.15s'
                  }}
                >
                  <Flame size={13} />
                  <span>Создать инцидент по выбранным</span>
                </button>

                <button
                  onClick={() => setSelectedIds([])}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 10px',
                    borderRadius: 4,
                    border: '1px solid #1e293b',
                    background: '#101726',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: 11.5,
                    fontWeight: 500
                  }}
                >
                  <X size={12} />
                  <span>Снять выбор</span>
                </button>
              </div>
            </div>
          )}

          {/* Loading & Errors */}
          {loading && (
            <div style={{ color: '#64748b', fontSize: 13, padding: 30, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Activity size={16} className="animate-spin" />
              <span>Загрузка списка алертов...</span>
            </div>
          )}
          {error && (
            <div style={{ color: '#f87171', fontSize: 12.5, padding: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 4, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Empty State */}
          {!loading && filtered.length === 0 && (
            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 6, padding: '48px 20px', textAlign: 'center', margin: 'auto 0' }}>
              <CheckCircle2 size={44} style={{ color: '#10b981', margin: '0 auto 14px', opacity: 0.85 }} />
              <div style={{ color: '#f8fafc', fontSize: 15, fontWeight: 700 }}>Нет алертов для отображения</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 4, maxWidth: 420, margin: '6px auto 0' }}>
                {filter === 'active' || filter === 'critical' || filter === 'warning'
                  ? 'Все активные алерты устранены. Все сервисы и параметры находятся в пределах допустимых порогов.'
                  : 'По выбранным критериям поиска и фильтрации алертов не обнаружено.'}
              </div>
              {(categoryFilter !== 'all' || targetTypeFilter !== 'all' || alertSearch) && (
                <button
                  onClick={() => { setCategoryFilter('all'); setTargetTypeFilter('all'); setAlertSearch(''); setFilter('all') }}
                  style={{
                    marginTop: 14,
                    padding: '6px 14px',
                    borderRadius: 4,
                    border: '1px solid #2563eb',
                    background: 'rgba(37, 99, 235, 0.15)',
                    color: '#60a5fa',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  Сбросить все фильтры
                </button>
              )}
            </div>
          )}

          {/* Alert Cards List */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {/* Table / List Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '40px 140px 1fr 200px 180px',
                padding: '8px 14px',
                fontSize: 11,
                fontWeight: 600,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                borderBottom: '1px solid #1e293b',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allVisibleActiveSelected}
                    onChange={handleSelectAll}
                    title="Выбрать все активные на странице"
                    style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                  />
                </div>
                <div>Статус / Уровень</div>
                <div>Объект и Описание события</div>
                <div>Метрика и Порог</div>
                <div style={{ textAlign: 'right' }}>Действия</div>
              </div>

              {/* Rows Container */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0, overflowY: 'auto', paddingTop: 6, paddingRight: 4 }}>
                {filtered.map((a, i) => {
                  const sevColor = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' }[a.severity] || '#94a3b8'
                  const isHighlighted = highlightedAlertId && String(a.id) === highlightedAlertId
                  const isSelected = selectedIds.includes(a.id)
                  const TargetIcon = getTargetIcon(a.target_type)
                  const targetUrl = getTargetUrl(a.target_type, a.target_id)
                  const durationText = formatDuration(a.created_at, a.resolved_at)

                  return (
                    <div
                      id={`alert-${a.id}`}
                      key={a.id || i}
                      style={{
                        background: isSelected ? 'rgba(37, 99, 235, 0.08)' : '#101726',
                        border: `1px solid ${isSelected ? '#2563eb' : (isHighlighted ? '#3b82f6' : '#1e293b')}`,
                        borderLeft: `4px solid ${a.is_active ? sevColor : '#10b981'}`,
                        borderRadius: 5,
                        padding: '10px 14px',
                        display: 'grid',
                        gridTemplateColumns: '40px 140px 1fr 200px 180px',
                        alignItems: 'center',
                        gap: 12,
                        opacity: a.is_active ? 1 : 0.72,
                        boxShadow: isHighlighted ? '0 0 0 2px rgba(37, 99, 235, 0.4)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {a.is_active ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(a.id)}
                            style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                          />
                        ) : (
                          <span style={{ width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={13} style={{ color: '#10b981', opacity: 0.6 }} />
                          </span>
                        )}
                      </div>

                      {/* Severity & Status */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <AlertBadge severity={a.is_active ? a.severity : 'resolved'} />
                        <span style={{
                          fontSize: 10,
                          color: '#60a5fa',
                          background: '#090d16',
                          border: '1px solid #1e293b',
                          padding: '1px 6px',
                          borderRadius: 3,
                          fontFamily: 'monospace',
                          width: 'fit-content'
                        }}>
                          {a.category || 'system'}
                        </span>
                      </div>

                      {/* Target, Title & Message */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {targetUrl ? (
                            <Link
                              href={targetUrl}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11.5,
                                fontWeight: 600,
                                color: '#93c5fd',
                                textDecoration: 'none',
                                background: 'rgba(37, 99, 235, 0.1)',
                                border: '1px solid rgba(37, 99, 235, 0.25)',
                                padding: '1px 6px',
                                borderRadius: 3
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                            >
                              <TargetIcon size={11} />
                              <span>{a.target_name || a.target_id || 'Объект'}</span>
                              <ExternalLink size={9} style={{ opacity: 0.7 }} />
                            </Link>
                          ) : (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11.5,
                              fontWeight: 600,
                              color: '#94a3b8',
                              background: '#090d16',
                              border: '1px solid #1e293b',
                              padding: '1px 6px',
                              borderRadius: 3
                            }}>
                              <TargetIcon size={11} />
                              <span>{a.target_name || a.target_id || 'Объект'}</span>
                            </span>
                          )}

                          <span style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {a.title || 'Алерт'}
                          </span>
                        </div>

                        {a.message && (
                          <div style={{ fontSize: 11.5, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {a.message}
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                          <span title={a.created_at ? new Date(a.created_at).toLocaleString('ru-RU') : ''}>
                            Создан: {formatRelativeTime(a.created_at)}
                          </span>
                          {durationText && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: a.is_active ? '#f87171' : '#64748b' }}>
                              <Clock size={10} />
                              <span>{a.is_active ? `Длится ${durationText}` : `Длился ${durationText}`}</span>
                            </span>
                          )}
                          {a.resolved_at && (
                            <span title={new Date(a.resolved_at).toLocaleString('ru-RU')}>
                              Решён: {formatRelativeTime(a.resolved_at)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Metric & Threshold Details */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                        {a.metric_key ? (
                          <>
                            <div style={{ color: '#cbd5e1', fontWeight: 600 }}>
                              <span style={{ color: '#64748b', marginRight: 4 }}>Метрика:</span>
                              {a.metric_key}
                            </div>
                            <div style={{ color: '#94a3b8' }}>
                              Значение: <strong style={{ color: a.is_active ? sevColor : '#34d399' }}>
                                {a.metric_value != null ? (typeof a.metric_value === 'number' ? a.metric_value.toFixed(1) : a.metric_value) : '—'}
                              </strong>
                              {a.threshold && <span style={{ color: '#64748b', marginLeft: 4 }}>(порог: {a.threshold})</span>}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: '#64748b' }}>Параметры не указаны</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        {a.is_active && (
                          <>
                            {/* Incident creation button */}
                            <button
                              onClick={(e) => openIncidentModalForAlert(a, e)}
                              title="Создать официальный инцидент из этого алерта"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 8px',
                                borderRadius: 4,
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#f87171',
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)' }}
                            >
                              <Flame size={12} />
                              <span>Инцидент</span>
                            </button>

                            {/* Resolve button */}
                            <button
                              onClick={(e) => resolveAlert(a.id, e)}
                              title="Пометить алерт как решённый"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 10px',
                                borderRadius: 4,
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                background: 'rgba(16, 185, 129, 0.12)',
                                color: '#34d399',
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)' }}
                            >
                              <Check size={12} />
                              <span>Решить</span>
                            </button>
                          </>
                        )}
                        {!a.is_active && (
                          <span style={{ fontSize: 11, color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={12} />
                            <span>Устранён</span>
                          </span>
                        )}
                      </div>

                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Modal: Create Incident from Alert */}
          {incidentModal.open && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(3px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20
            }}>
              <div style={{
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                width: '100%',
                maxWidth: 580,
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                {/* Modal Header */}
                <div style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(239, 68, 68, 0.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Flame size={18} style={{ color: '#ef4444' }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                      Создание инцидента из алерта
                    </span>
                  </div>
                  <button
                    onClick={() => setIncidentModal(prev => ({ ...prev, open: false }))}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '75vh', overflowY: 'auto' }}>
                  {/* Title */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                      Название инцидента *
                    </label>
                    <input
                      value={incidentModal.title}
                      onChange={e => setIncidentModal(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Краткое описание проблемы"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 4,
                        border: '1px solid #1e293b',
                        background: '#090d16',
                        color: '#f8fafc',
                        fontSize: 12.5,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Severity & Target Info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                        Критичность инцидента
                      </label>
                      <select
                        value={incidentModal.severity}
                        onChange={e => setIncidentModal(prev => ({ ...prev, severity: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 4,
                          border: '1px solid #1e293b',
                          background: '#090d16',
                          color: '#f8fafc',
                          fontSize: 12,
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      >
                        <option value="critical">Критический (Critical)</option>
                        <option value="warning">Предупреждение (Warning)</option>
                        <option value="info">Информационный (Info)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                        Связанный объект
                      </label>
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: 4,
                        border: '1px solid #1e293b',
                        background: '#090d16',
                        color: '#cbd5e1',
                        fontSize: 12,
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        [{incidentModal.target_type || 'server'}] {incidentModal.target_name || incidentModal.target_id || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Attached Alerts list */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                      Связанные алерты ({incidentModal.alert_ids.length})
                    </label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {incidentModal.alert_ids.map(id => (
                        <span key={id} style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'rgba(37, 99, 235, 0.15)',
                          border: '1px solid rgba(37, 99, 235, 0.3)',
                          color: '#60a5fa',
                          fontSize: 11,
                          fontWeight: 600
                        }}>
                          Алерт #{id}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                      Описание и контекст инцидента
                    </label>
                    <textarea
                      rows={5}
                      value={incidentModal.description}
                      onChange={e => setIncidentModal(prev => ({ ...prev, description: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 4,
                        border: '1px solid #1e293b',
                        background: '#090d16',
                        color: '#f8fafc',
                        fontSize: 12,
                        lineHeight: 1.5,
                        outline: 'none',
                        boxSizing: 'border-box',
                        fontFamily: 'monospace',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>

                {/* Modal Footer */}
                <div style={{
                  padding: '14px 20px',
                  borderTop: '1px solid #1e293b',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  background: '#090d16'
                }}>
                  <button
                    onClick={() => setIncidentModal(prev => ({ ...prev, open: false }))}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 4,
                      border: '1px solid #1e293b',
                      background: '#101726',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 500
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    onClick={submitIncident}
                    disabled={incidentModal.loading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 16px',
                      borderRadius: 4,
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      background: '#ef4444',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      opacity: incidentModal.loading ? 0.7 : 1
                    }}
                  >
                    {incidentModal.loading ? <Activity size={13} className="animate-spin" /> : <Flame size={13} />}
                    <span>{incidentModal.loading ? 'Создание...' : 'Создать инцидент'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </ProtectedRoute>
  )
}
