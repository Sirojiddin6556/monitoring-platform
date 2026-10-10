import { useEffect, useState, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import TimeRangeFilter from '../components/TimeRangeFilter'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import apiFetch from '../lib/api'
import {
  Globe,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Clock,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Radio,
  Server,
  X,
} from 'lucide-react'

const PROTO_CONFIGS = [
  { key: 'http', label: 'HTTP', color: '#38bdf8' },
  { key: 'https', label: 'HTTPS', color: '#10b981' },
  { key: 'icmp', label: 'ICMP Ping', color: '#818cf8' },
  { key: 'tcp_443', label: 'TCP 443', color: '#f59e0b' },
]

const PRESET_MS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
}

function effectiveRange(range) {
  if (!range || range.preset === 'all') return { from: null, to: null }
  if (range.preset === 'custom') return { from: range.from, to: range.to }
  const ms = PRESET_MS[range.preset]
  return ms ? { from: Date.now() - ms, to: Date.now() } : { from: range.from, to: range.to }
}

function StatusIndicator({ status, size = 8 }) {
  const isUp = status === 'up' || status === 'ok'
  const isDegraded = status === 'degraded'
  const color = isUp ? '#10b981' : isDegraded ? '#f59e0b' : status === 'down' ? '#ef4444' : '#64748b'

  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: isUp ? '0 0 6px rgba(16, 185, 129, 0.4)' : status === 'down' ? '0 0 6px rgba(239, 68, 68, 0.4)' : 'none',
        flexShrink: 0,
      }}
    />
  )
}

function StatusBadge({ status }) {
  const isUp = status === 'up' || status === 'ok'
  const isDegraded = status === 'degraded'
  const color = isUp ? '#10b981' : isDegraded ? '#f59e0b' : status === 'down' ? '#ef4444' : '#64748b'
  const bg = isUp ? '#10b98115' : isDegraded ? '#f59e0b15' : status === 'down' ? '#ef444415' : '#64748b15'
  const border = isUp ? '#10b98130' : isDegraded ? '#f59e0b30' : status === 'down' ? '#ef444430' : '#64748b30'
  const label = isUp ? 'Online' : isDegraded ? 'Degraded' : status === 'down' ? 'Offline' : 'Unknown'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 4,
        background: bg,
        border: `1px solid ${border}`,
        color: color,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <StatusIndicator status={status} size={6} />
      {label}
    </span>
  )
}

export default function Websites() {
  const [mounted, setMounted] = useState(false)
  const [sites, setSites] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const wsRef = useRef(null)

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ id: '', name: '', url: '' })
  const [addError, setAddError] = useState(null)
  const [addLoading, setAddLoading] = useState(false)

  const [siteSearch, setSiteSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [slaMap, setSlaMap] = useState({})
  const [protoHistory, setProtoHistory] = useState({})
  const [protoLoading, setProtoLoading] = useState(false)
  const [timeRange, setTimeRange] = useState({ from: null, to: null, preset: 'all' })

  const selectedRef = useRef(null)
  const timeRangeRef = useRef({ from: null, to: null, preset: 'all' })
  const protoIntervalRef = useRef(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  useEffect(() => {
    timeRangeRef.current = timeRange
  }, [timeRange])

  // Protocol History
  async function fetchProtoHistory(siteId, range) {
    if (!siteId) return
    setProtoLoading(true)
    try {
      const { from, to } = effectiveRange(range ?? timeRangeRef.current)
      const params = new URLSearchParams({ limit: '200' })
      if (from) params.set('from_ts', String(Math.floor(from / 1000)))
      if (to) params.set('to_ts', String(Math.floor(to / 1000)))
      const data = await apiFetch(`/api/websites/${siteId}/protocol-probes?${params}`)
      const protos = data.protocols || {}
      setProtoHistory({
        http: protos.http || [],
        https: protos.https || [],
        icmp: protos.icmp || [],
        tcp_443: protos.tcp_443 || [],
      })
    } catch {
      setProtoHistory({})
    } finally {
      setProtoLoading(false)
    }
  }

  useEffect(() => {
    if (protoIntervalRef.current) clearInterval(protoIntervalRef.current)
    if (!selected?.id) {
      setProtoHistory({})
      return
    }

    fetchProtoHistory(selected.id, timeRange)

    protoIntervalRef.current = setInterval(() => {
      const id = selectedRef.current?.id
      if (id) fetchProtoHistory(id, timeRangeRef.current)
    }, 60000)

    return () => clearInterval(protoIntervalRef.current)
  }, [selected?.id, timeRange])

  // Load sites and SLA summary
  const loadSites = async () => {
    setError(null)
    try {
      const [d, slaRes] = await Promise.all([
        apiFetch('/api/websites'),
        apiFetch('/api/sla/summary').catch(() => ({ summary: [] })),
      ])
      const fetchedSites = d.websites || []
      setSites(fetchedSites)
      const map = {}
      for (const item of slaRes.summary || []) {
        if (item.target_type === 'website') map[item.target_id] = item
      }
      setSlaMap(map)

      if (fetchedSites.length > 0 && !selectedRef.current) {
        setSelected(fetchedSites[0])
      } else if (selectedRef.current) {
        const found = fetchedSites.find((s) => s.id === selectedRef.current.id)
        if (found) setSelected(found)
      }
    } catch {
      setError('Ошибка при загрузке списка веб-сайтов')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSites()
    const iv = setInterval(loadSites, 30000)
    return () => clearInterval(iv)
  }, [])

  // WebSockets for Real-time probes
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || ''
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const wsUrl = base.replace('http', 'ws') + '/ws' + (token ? `?token=${token}` : '')
    try {
      wsRef.current = new WebSocket(wsUrl)
      wsRef.current.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if (msg.probe) {
            const pl = msg.probe.payload || msg.probe
            setSites((prev) =>
              prev.map((s) => {
                const hit = (pl.website_id && s.id === pl.website_id) || (pl.target && s.url === pl.target)
                return hit ? { ...s, last_probe: pl } : s
              })
            )
            if (selectedRef.current && ((pl.website_id && selectedRef.current.id === pl.website_id) || (pl.target && selectedRef.current.url === pl.target))) {
              setSelected((prev) => ({ ...prev, last_probe: pl }))
            }
          }
        } catch {}
      }
    } catch {}
    return () => {
      wsRef.current?.close()
    }
  }, [])

  async function handleAddSite(e) {
    e.preventDefault()
    setAddError(null)
    if (!addForm.id.trim() || !addForm.name.trim() || !addForm.url.trim()) {
      setAddError('Все поля обязательны для заполнения')
      return
    }
    setAddLoading(true)
    try {
      await apiFetch('/api/websites', {
        method: 'POST',
        body: JSON.stringify({
          id: addForm.id.trim(),
          name: addForm.name.trim(),
          url: addForm.url.trim(),
        }),
      })
      setAddForm({ id: '', name: '', url: '' })
      setShowAdd(false)
      await loadSites()
    } catch (err) {
      setAddError(err.message || 'Ошибка создания сайта')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleDeleteSite(siteId) {
    if (!confirm(`Удалить сайт ${siteId} из мониторинга?`)) return
    try {
      await apiFetch(`/api/websites/${siteId}`, { method: 'DELETE' })
      if (selected?.id === siteId) setSelected(null)
      await loadSites()
    } catch {
      setError('Ошибка удаления сайта')
    }
  }

  const filteredSites = sites.filter((s) => {
    const status = s.last_probe?.status || 'unknown'
    if (statusFilter === 'up' && status !== 'up' && status !== 'ok') return false
    if (statusFilter === 'down' && (status === 'up' || status === 'ok')) return false
    if (siteSearch.trim()) {
      const q = siteSearch.toLowerCase()
      return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.url || '').toLowerCase().includes(q) ||
        (s.id || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  // Quick stats
  const totalSites = sites.length
  const upSites = sites.filter((s) => s.last_probe?.status === 'up' || s.last_probe?.status === 'ok').length
  const downSites = sites.filter((s) => s.last_probe?.status === 'down').length
  const avgResponse =
    sites.length > 0
      ? (
          sites.reduce((acc, s) => acc + (Number(s.last_probe?.response_time) || 0), 0) /
          (sites.filter((s) => s.last_probe?.response_time != null).length || 1)
        ).toFixed(0)
      : '—'

  const fmtTime = (isoStr) => {
    if (!mounted || !isoStr) return ''
    try {
      return new Date(isoStr).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return isoStr
    }
  }

  const fmtDateTime = (isoStr) => {
    if (!mounted || !isoStr) return ''
    try {
      return new Date(isoStr).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return isoStr
    }
  }

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '24px 32px', overflow: 'auto', boxSizing: 'border-box' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Globe size={22} color="#2563eb" />
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  Мониторинг веб-сайтов и URL
                </h1>
              </div>
              <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0 0' }}>
                Синтетический пробинг по протоколам HTTP, HTTPS, ICMP Ping, TCP и аудит SSL сертификатов
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={loadSites}
                title="Обновить"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 6,
                  border: '1px solid #1e293b',
                  background: '#101726',
                  color: '#94a3b8',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} />
                Обновить
              </button>
              <button
                onClick={() => setShowAdd(!showAdd)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                }}
              >
                <Plus size={14} />
                {showAdd ? 'Отмена' : 'Добавить сайт'}
              </button>
            </div>
          </div>

          {/* Stat Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Всего сайтов
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {totalSites}
              </div>
            </div>

            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                В сети (Online)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {upSites}
              </div>
            </div>

            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Недоступно (Down)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: downSites > 0 ? '#ef4444' : '#f8fafc', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {downSites}
              </div>
            </div>

            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Средний отклик
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {avgResponse} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>мс</span>
              </div>
            </div>
          </div>

          {/* Add Site Modal/Drawer */}
          {showAdd && (
            <div
              style={{
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>
                  Добавить новый веб-ресурс в мониторинг
                </h4>
                <button
                  onClick={() => setShowAdd(false)}
                  style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              {addError && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: '#ef444415',
                    border: '1px solid #ef444430',
                    borderRadius: 6,
                    color: '#ef4444',
                    fontSize: 12,
                    marginBottom: 12,
                  }}
                >
                  {addError}
                </div>
              )}

              <form
                onSubmit={handleAddSite}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr)) 120px',
                  gap: 12,
                  alignItems: 'end',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                    ID объекта *
                  </label>
                  <input
                    type="text"
                    placeholder="site-crm-prod"
                    value={addForm.id}
                    onChange={(e) => setAddForm({ ...addForm, id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      background: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: 6,
                      color: '#f8fafc',
                      fontSize: 12,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                    Название ресурса *
                  </label>
                  <input
                    type="text"
                    placeholder="Корпоративная CRM"
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      background: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: 6,
                      color: '#f8fafc',
                      fontSize: 12,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                    URL адрес *
                  </label>
                  <input
                    type="text"
                    placeholder="https://crm.company.com"
                    value={addForm.url}
                    onChange={(e) => setAddForm({ ...addForm, url: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      background: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: 6,
                      color: '#f8fafc',
                      fontSize: 12,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={addLoading}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: addLoading ? 'not-allowed' : 'pointer',
                    height: 33,
                  }}
                >
                  {addLoading ? '...' : 'Добавить'}
                </button>
              </form>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: '#ef444415',
                border: '1px solid #ef444430',
                borderRadius: 6,
                color: '#ef4444',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {/* Two-Column Master-Detail Layout */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* Left Column: Website List */}
            <div
              style={{
                width: 320,
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Search & Status Filter */}
              <div style={{ padding: 12, borderBottom: '1px solid #1e293b', background: '#0d1320' }}>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Search size={12} color="#64748b" style={{ position: 'absolute', left: 8, top: 9 }} />
                  <input
                    type="text"
                    placeholder="Поиск по названию или URL..."
                    value={siteSearch}
                    onChange={(e) => setSiteSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 8px 5px 26px',
                      background: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: 4,
                      color: '#f8fafc',
                      fontSize: 11,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { id: 'all', label: 'Все' },
                    { id: 'up', label: 'Online' },
                    { id: 'down', label: 'Offline' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setStatusFilter(f.id)}
                      style={{
                        flex: 1,
                        padding: '4px 0',
                        borderRadius: 4,
                        border: 'none',
                        background: statusFilter === f.id ? '#2563eb' : '#090d16',
                        color: statusFilter === f.id ? '#ffffff' : '#94a3b8',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items List */}
              <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                    Загрузка сайтов...
                  </div>
                ) : filteredSites.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                    Сайты не найдены
                  </div>
                ) : (
                  filteredSites.map((s) => {
                    const isSelected = selected?.id === s.id
                    const status = s.last_probe?.status || 'unknown'
                    const rt = s.last_probe?.response_time
                    const sla = slaMap[s.id]?.uptime_30d

                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelected(s)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderBottom: '1px solid #1e293b',
                          background: isSelected ? '#151d2f' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <StatusIndicator status={status} size={8} />
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: isSelected ? 600 : 500,
                                color: isSelected ? '#ffffff' : '#cbd5e1',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {s.name}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: '#64748b',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {s.url}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
                          {rt != null && (
                            <span style={{ fontSize: 11, color: '#94a3b8', fontFeatureSettings: '"tnum"' }}>
                              {Number(rt).toFixed(0)} мс
                            </span>
                          )}
                          {sla != null && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: sla >= 99.9 ? '#10b981' : sla >= 99.0 ? '#f59e0b' : '#ef4444',
                                fontFeatureSettings: '"tnum"',
                              }}
                            >
                              {sla.toFixed(1)}%
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteSite(s.id)
                            }}
                            title="Удалить сайт"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#64748b',
                              cursor: 'pointer',
                              padding: 2,
                              display: 'flex',
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Right Column: Site Detail, Protocols, SLA & SSL */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {selected ? (
                <>
                  {/* Selected Site Header */}
                  <div
                    style={{
                      background: '#101726',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>
                          {selected.name}
                        </h2>
                        <StatusBadge status={selected.last_probe?.status || 'unknown'} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                        <span>{selected.url}</span>
                        <a
                          href={selected.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#2563eb', display: 'flex', alignItems: 'center' }}
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>

                    <TimeRangeFilter onChange={setTimeRange} accent="#2563eb" />
                  </div>

                  {/* Protocol Response Time Charts */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                    {PROTO_CONFIGS.map((proto) => {
                      const history = protoHistory[proto.key] || []
                      const isEmpty = history.length === 0
                      const rts = history.map((h) => h.rt).filter((v) => v != null)
                      const minRt = rts.length ? Math.min(...rts) : null
                      const maxRt = rts.length ? Math.max(...rts) : null
                      const avg = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null
                      const lastVal = rts.length ? rts[rts.length - 1] : null

                      return (
                        <div
                          key={proto.key}
                          style={{
                            background: '#101726',
                            border: '1px solid #1e293b',
                            borderRadius: 8,
                            padding: '14px 16px',
                          }}
                        >
                          {/* Protocol Card Header */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 10,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: 8,
                                  height: 8,
                                  borderRadius: 2,
                                  backgroundColor: proto.color,
                                }}
                              />
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>
                                {proto.label}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {lastVal != null && (
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: proto.color,
                                    fontFeatureSettings: '"tnum"',
                                  }}
                                >
                                  {lastVal} мс
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Stats summary */}
                          {!isEmpty && avg != null && (
                            <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11 }}>
                              <span style={{ color: '#64748b' }}>
                                min:{' '}
                                <strong style={{ color: '#cbd5e1', fontFeatureSettings: '"tnum"' }}>
                                  {minRt} мс
                                </strong>
                              </span>
                              <span style={{ color: '#64748b' }}>
                                avg:{' '}
                                <strong style={{ color: '#cbd5e1', fontFeatureSettings: '"tnum"' }}>
                                  {avg} мс
                                </strong>
                              </span>
                              <span style={{ color: '#64748b' }}>
                                max:{' '}
                                <strong style={{ color: '#cbd5e1', fontFeatureSettings: '"tnum"' }}>
                                  {maxRt} мс
                                </strong>
                              </span>
                            </div>
                          )}

                          {/* Chart */}
                          <div style={{ height: 110, width: '100%' }}>
                            {isEmpty ? (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  height: '100%',
                                  color: '#64748b',
                                  fontSize: 11,
                                }}
                              >
                                {protoLoading ? 'Загрузка метрик...' : 'Нет данных за выбранный интервал'}
                              </div>
                            ) : (
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={history} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                                  <defs>
                                    <linearGradient id={`grad-${proto.key}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor={proto.color} stopOpacity={0.35} />
                                      <stop offset="100%" stopColor={proto.color} stopOpacity={0.02} />
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" strokeOpacity={0.5} />
                                  <XAxis
                                    dataKey="time"
                                    tick={{ fill: '#64748b', fontSize: 9 }}
                                    interval="preserveStartEnd"
                                    tickFormatter={fmtTime}
                                  />
                                  <YAxis
                                    tick={{ fill: '#64748b', fontSize: 9 }}
                                    unit=" мс"
                                    width={44}
                                  />
                                  <Tooltip
                                    contentStyle={{
                                      background: '#090d16',
                                      border: '1px solid #1e293b',
                                      borderRadius: 6,
                                      fontSize: 11,
                                    }}
                                    formatter={(v) => (v != null ? [`${v} мс`, proto.label] : ['—', proto.label])}
                                    labelFormatter={fmtDateTime}
                                  />
                                  <Area
                                    type="monotone"
                                    dataKey="rt"
                                    stroke={proto.color}
                                    strokeWidth={1.5}
                                    fill={`url(#grad-${proto.key})`}
                                    isAnimationActive={false}
                                    connectNulls={false}
                                    dot={false}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Uptime and SSL Cards in 2 columns */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                    {/* SLA Uptime Card */}
                    <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: 16 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#64748b',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginBottom: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Clock size={12} />
                        Доступность по соглашению (SLA Uptime)
                      </div>

                      {slaMap[selected.id] ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                          {[
                            ['24 часа', 'uptime_24h'],
                            ['7 дней', 'uptime_7d'],
                            ['30 дней', 'uptime_30d'],
                          ].map(([label, key]) => {
                            const pct = slaMap[selected.id][key]
                            const color =
                              pct == null ? '#64748b' : pct >= 99.9 ? '#10b981' : pct >= 99.0 ? '#f59e0b' : '#ef4444'
                            return (
                              <div
                                key={key}
                                style={{
                                  textAlign: 'center',
                                  padding: '10px 6px',
                                  background: '#090d16',
                                  borderRadius: 6,
                                  border: '1px solid #1e293b',
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color,
                                    fontFeatureSettings: '"tnum"',
                                  }}
                                >
                                  {pct != null ? `${pct.toFixed(2)}%` : '—'}
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
                                  {label}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                          Данные SLA рассчитываются или недоступны
                        </div>
                      )}
                    </div>

                    {/* SSL Card */}
                    <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: 16 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#64748b',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginBottom: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Lock size={12} />
                        Сертификат безопасности SSL / TLS
                      </div>

                      {selected.ssl ? (
                        <div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                            <div>
                              <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Статус</span>
                              <span
                                style={{
                                  color: selected.ssl.valid ? '#10b981' : '#ef4444',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                {selected.ssl.valid ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                                {selected.ssl.valid ? 'Действителен' : 'Недействителен'}
                              </span>
                            </div>

                            <div>
                              <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Срок действия</span>
                              <span
                                style={{
                                  color:
                                    selected.ssl.days_left < 30
                                      ? selected.ssl.days_left < 7
                                        ? '#ef4444'
                                        : '#f59e0b'
                                      : '#10b981',
                                  fontWeight: 600,
                                  fontFeatureSettings: '"tnum"',
                                }}
                              >
                                {selected.ssl.days_left != null ? `${selected.ssl.days_left} дней` : '—'}
                              </span>
                            </div>

                            <div>
                              <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Издатель (CA)</span>
                              <span style={{ color: '#cbd5e1' }}>{selected.ssl.issuer || '—'}</span>
                            </div>

                            <div>
                              <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Истекает</span>
                              <span style={{ color: '#cbd5e1' }}>{selected.ssl.expires || '—'}</span>
                            </div>
                          </div>

                          {selected.ssl.days_left != null && selected.ssl.days_left < 30 && (
                            <div
                              style={{
                                marginTop: 10,
                                padding: '6px 10px',
                                borderRadius: 4,
                                border: `1px solid ${selected.ssl.days_left < 7 ? '#ef444440' : '#f59e0b40'}`,
                                background: selected.ssl.days_left < 7 ? '#ef444415' : '#f59e0b15',
                                fontSize: 11,
                                color: selected.ssl.days_left < 7 ? '#ef4444' : '#f59e0b',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <AlertTriangle size={13} />
                              {selected.ssl.days_left < 7
                                ? 'Сертификат истекает менее чем через 7 дней!'
                                : 'Сертификат истекает менее чем через 30 дней.'}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                          SSL-сертификат не настроен или информация еще не получена
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    background: '#101726',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: 40,
                    textAlign: 'center',
                    color: '#64748b',
                  }}
                >
                  <Globe size={32} color="#2563eb" style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc', marginBottom: 4 }}>
                    Выберите сайт для просмотра
                  </div>
                  <div style={{ fontSize: 13 }}>
                    Выберите веб-ресурс из списка слева для отображения метрик доступности, графиков протоколов и сертификатов SSL.
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
