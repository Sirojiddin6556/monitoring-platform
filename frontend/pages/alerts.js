import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
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
  Check
} from 'lucide-react'

function AlertBadge({ severity }) {
  const configs = {
    critical: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', color: '#f87171', label: 'Критично' },
    warning: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24', label: 'Предупреждение' },
    info: { bg: 'rgba(37, 99, 235, 0.1)', border: 'rgba(37, 99, 235, 0.3)', color: '#60a5fa', label: 'Информация' },
    resolved: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', color: '#34d399', label: 'Решено' },
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
      fontWeight: 700
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color }} />
      <span>{c.label}</span>
    </span>
  )
}

function StatBox({ label, value, color, icon: IconComp }) {
  return (
    <div style={{
      background: '#101726',
      border: '1px solid #1e293b',
      borderRadius: 6,
      padding: '14px 16px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {IconComp && <IconComp size={18} style={{ color: '#64748b', marginBottom: 4 }} />}
      <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{label}</div>
    </div>
  )
}

export default function Alerts() {
  const [mounted, setMounted] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [stats, setStats] = useState({ total: 0, active: 0, critical: 0, warning: 0, resolved: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all') // all, active, critical, warning, resolved
  const [alertSearch, setAlertSearch] = useState('')
  const wsRef = useRef(null)
  const router = useRouter()
  const highlightedAlertId = router.query.alertId ? String(router.query.alertId) : null

  const loadAlerts = useCallback(async () => {
    try {
      setError(null)
      const [alertsRes, statsRes] = await Promise.all([
        apiFetch('/api/alerts?limit=100'),
        apiFetch('/api/alerts/stats')
      ])
      setAlerts(alertsRes.alerts || [])
      setStats(statsRes || { total: 0, active: 0, critical: 0, warning: 0, resolved: 0 })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    loadAlerts()
    const interval = setInterval(loadAlerts, 10000)
    return () => clearInterval(interval)
  }, [loadAlerts])

  // WebSocket для моментального получения алертов
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || ''
    const wsToken = localStorage.getItem('token')
    if (!base || !wsToken) return

    const wsUrl = base.replace('http', 'ws') + '/ws?token=' + encodeURIComponent(wsToken)
    try {
      wsRef.current = new WebSocket(wsUrl)
      wsRef.current.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if (msg.alert) {
            loadAlerts()
          }
        } catch {}
      }
    } catch {}

    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [loadAlerts])

  async function resolveAlert(alertId) {
    try {
      await apiFetch(`/api/alerts/${encodeURIComponent(alertId)}/resolve`, { method: 'POST' })
      await loadAlerts()
    } catch {
      setError('Ошибка при подтверждении алерта')
    }
  }

  async function clearResolved() {
    if (!confirm('Удалить все разрешённые алерты из журнала?')) return
    try {
      await apiFetch('/api/alerts', { method: 'DELETE' })
      await loadAlerts()
    } catch {
      setError('Ошибка очистки журнала')
    }
  }

  const filtered = alerts.filter(a => {
    if (filter === 'all') {}
    else if (filter === 'active') { if (!a.is_active) return false }
    else if (filter === 'resolved') { if (a.is_active) return false }
    else { if (a.severity !== filter) return false }

    if (alertSearch.trim()) {
      const q = alertSearch.toLowerCase()
      return (a.title || '').toLowerCase().includes(q) ||
        (a.message || '').toLowerCase().includes(q) ||
        (a.target_name || '').toLowerCase().includes(q) ||
        (a.category || '').toLowerCase().includes(q)
    }
    return true
  })

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
        <div style={{ flex: 1, padding: '24px 32px', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bell size={22} style={{ color: '#2563eb' }} />
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                Центр Оповещений и Алертов
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={loadAlerts}
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
                  fontSize: 12,
                  fontWeight: 500,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8' }}
              >
                <RefreshCw size={13} />
                <span>Обновить</span>
              </button>
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
                  fontSize: 12,
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

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 18 }}>
            <StatBox label="Всего алертов" value={stats.total} color="#f8fafc" icon={ClipboardList} />
            <StatBox label="Активных" value={stats.active} color={stats.active > 0 ? '#f87171' : '#34d399'} icon={Bell} />
            <StatBox label="Критичных" value={stats.critical} color={stats.critical > 0 ? '#f87171' : '#64748b'} icon={AlertTriangle} />
            <StatBox label="Предупреждений" value={stats.warning} color={stats.warning > 0 ? '#fbbf24' : '#64748b'} icon={AlertCircle} />
            <StatBox label="Решённых" value={stats.resolved} color="#34d399" icon={CheckCircle2} />
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {[{ id: 'all', l: 'Все' }, { id: 'active', l: 'Активные' }, { id: 'critical', l: 'Критичные' }, { id: 'warning', l: 'Предупреждения' }, { id: 'resolved', l: 'Решённые' }].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: `1px solid ${filter === f.id ? '#2563eb' : '#1e293b'}`,
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: filter === f.id ? '#2563eb' : '#101726',
                  color: filter === f.id ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.15s'
                }}
              >
                {f.l} {f.id === 'all' ? `(${alerts.length})` : ''}
              </button>
            ))}

            <div style={{ flex: 1 }} />

            <div style={{ position: 'relative', width: 220 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: '#64748b' }} />
              <input
                value={alertSearch}
                onChange={e => setAlertSearch(e.target.value)}
                placeholder="Поиск алертов..."
                style={{
                  padding: '6px 10px 6px 30px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#101726',
                  color: '#f8fafc',
                  fontSize: 12,
                  width: '100%',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {loading && <div style={{ color: '#64748b', fontSize: 13, padding: 20, textAlign: 'center' }}>Загрузка алертов...</div>}
          {error && <div style={{ color: '#f87171', fontSize: 13, padding: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 4, marginBottom: 12 }}>{error}</div>}

          {!loading && filtered.length === 0 && (
            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 6, padding: 40, textAlign: 'center' }}>
              <CheckCircle2 size={40} style={{ color: '#10b981', margin: '0 auto 12px', opacity: 0.8 }} />
              <div style={{ color: '#f8fafc', fontSize: 14, fontWeight: 600 }}>Нет алертов для отображения</div>
              <div style={{ color: '#64748b', fontSize: 11.5, marginTop: 4 }}>Система функционирует стабильно, отклонений от порогов не зафиксировано</div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
            {filtered.map((a, i) => {
              const sevColor = { critical: '#f87171', warning: '#fbbf24', info: '#60a5fa' }[a.severity] || '#94a3b8'
              const isHighlighted = highlightedAlertId && String(a.id) === highlightedAlertId

              return (
                <div
                  id={`alert-${a.id}`}
                  key={a.id || i}
                  style={{
                    background: '#101726',
                    border: `1px solid ${isHighlighted ? '#2563eb' : '#1e293b'}`,
                    borderLeft: `3px solid ${a.is_active ? sevColor : '#10b981'}`,
                    borderRadius: 4,
                    padding: '12px 16px',
                    opacity: a.is_active ? 1 : 0.65,
                    boxShadow: isHighlighted ? '0 0 0 1px #2563eb' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <AlertBadge severity={a.is_active ? a.severity : 'resolved'} />
                        <span style={{ fontSize: 10.5, color: '#60a5fa', background: '#090d16', border: '1px solid #1e293b', padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace' }}>
                          {a.category || 'system'}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{a.target_name || a.target_id || ''}</span>
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f8fafc', marginBottom: 2 }}>{a.title || 'Алерт'}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{a.message || ''}</div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                        <span>Создан: {a.created_at ? new Date(a.created_at).toLocaleString('ru-RU') : '—'}</span>
                        {a.resolved_at && <span>Решён: {new Date(a.resolved_at).toLocaleString('ru-RU')}</span>}
                        {a.metric_key && (
                          <span>{a.metric_key}: {a.metric_value != null ? (typeof a.metric_value === 'number' ? a.metric_value.toFixed(1) : a.metric_value) : '—'} (порог: {a.threshold})</span>
                        )}
                      </div>
                    </div>
                    {a.is_active && (
                      <button
                        onClick={() => resolveAlert(a.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '5px 10px',
                          borderRadius: 4,
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: '#34d399',
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <Check size={12} />
                        <span>Решить</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </ProtectedRoute>
  )
}
