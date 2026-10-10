import { useEffect, useState, useMemo, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  Boxes,
  Play,
  Square,
  Server,
  Search,
  RefreshCw,
  Activity,
  Layers
} from 'lucide-react'

function StatusBadge({ status }) {
  const colors = { running: '#34d399', exited: '#f87171', paused: '#fbbf24', created: '#94a3b8', restarting: '#fb923c' }
  const bgColors = { running: 'rgba(16, 185, 129, 0.1)', exited: 'rgba(239, 68, 68, 0.1)', paused: 'rgba(245, 158, 11, 0.1)', created: 'rgba(148, 163, 184, 0.1)', restarting: 'rgba(249, 115, 22, 0.1)' }
  const labels = { running: 'Running', exited: 'Exited', paused: 'Paused', created: 'Created', restarting: 'Restarting' }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 6px',
      borderRadius: 4,
      background: bgColors[status] || 'rgba(148, 163, 184, 0.1)',
      border: `1px solid ${colors[status] || '#64748b'}40`,
      color: colors[status] || '#94a3b8',
      fontSize: 11,
      fontWeight: 600
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors[status] || '#94a3b8' }} />
      <span>{labels[status] || status || '—'}</span>
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
      <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{label}</div>
    </div>
  )
}

export default function Docker() {
  const [mounted, setMounted] = useState(false)
  const [containers, setContainers] = useState([])
  const [stats, setStats] = useState({ total: 0, running: 0, stopped: 0, servers_with_docker: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [serverFilter, setServerFilter] = useState('all')

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [cRes, sRes] = await Promise.all([
        apiFetch('/api/docker/containers'),
        apiFetch('/api/docker/stats')
      ])
      setContainers(cRes.containers || [])
      setStats(sRes || { total: 0, running: 0, stopped: 0, servers_with_docker: 0 })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    loadData()
    const iv = setInterval(loadData, 15000)
    return () => clearInterval(iv)
  }, [loadData])

  const servers = useMemo(() => {
    const map = {}
    containers.forEach(c => { map[c.server_id] = c.server_name || c.server_id })
    return Object.entries(map).map(([id, name]) => ({ id, name }))
  }, [containers])

  const filtered = useMemo(() => {
    return containers.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (serverFilter !== 'all' && c.server_id !== serverFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (c.name || '').toLowerCase().includes(q) || (c.image || '').toLowerCase().includes(q) || (c.server_name || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [containers, search, statusFilter, serverFilter])

  if (!mounted) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 13 }}>
            <Activity className="animate-spin" size={18} />
            Загрузка сервисов Docker...
          </div>
        </div>
      </div>
    )
  }

  return (
    <ProtectedRoute requiredRole="admin">
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Boxes size={22} style={{ color: '#2563eb' }} />
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                Docker Контейнеры и Микросервисы
              </h1>
            </div>
            <button
              onClick={loadData}
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
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatBox label="Всего контейнеров" value={stats.total} color="#60a5fa" icon={Boxes} />
            <StatBox label="Запущенных" value={stats.running} color="#34d399" icon={Play} />
            <StatBox label="Остановленных" value={stats.stopped} color={stats.stopped > 0 ? '#f87171' : '#64748b'} icon={Square} />
            <StatBox label="Серверов с Docker" value={stats.servers_with_docker} color="#2563eb" icon={Server} />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: 240 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#64748b' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по имени, образу..."
                style={{
                  padding: '7px 10px 7px 30px',
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

            <div style={{ display: 'flex', gap: 4 }}>
              {[{ id: 'all', l: 'Все' }, { id: 'running', l: 'Запущенные' }, { id: 'exited', l: 'Остановленные' }].map(f => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 4,
                    border: `1px solid ${statusFilter === f.id ? '#2563eb' : '#1e293b'}`,
                    cursor: 'pointer',
                    fontSize: 11.5,
                    fontWeight: 600,
                    background: statusFilter === f.id ? '#2563eb' : '#101726',
                    color: statusFilter === f.id ? '#ffffff' : '#94a3b8',
                    transition: 'all 0.15s'
                  }}
                >
                  {f.l}
                </button>
              ))}
            </div>

            {servers.length > 1 && (
              <select
                value={serverFilter}
                onChange={e => setServerFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#101726',
                  color: '#f8fafc',
                  fontSize: 12,
                  outline: 'none'
                }}
              >
                <option value="all">Все серверы</option>
                {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}

            {search && <span style={{ fontSize: 11.5, color: '#64748b' }}>Найдено: {filtered.length}</span>}
          </div>

          {loading && <div style={{ color: '#64748b', fontSize: 13, padding: 20, textAlign: 'center' }}>Загрузка...</div>}
          {error && <div style={{ color: '#f87171', fontSize: 13, padding: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 4, marginBottom: 12 }}>{error}</div>}

          {!loading && containers.length === 0 && (
            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 6, padding: 60, textAlign: 'center' }}>
              <Boxes size={48} style={{ color: '#64748b', opacity: 0.4, margin: '0 auto 16px' }} />
              <div style={{ color: '#f8fafc', fontSize: 15, fontWeight: 600 }}>Docker контейнеры не обнаружены</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>Мониторинг Docker работает через агенты, установленные на серверах</div>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 6, padding: 14, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    <th style={thStyle}>Контейнер</th>
                    <th style={thStyle}>Образ (Image)</th>
                    <th style={thStyle}>Статус</th>
                    <th style={thStyle}>CPU %</th>
                    <th style={thStyle}>RAM MB</th>
                    <th style={thStyle}>RAM %</th>
                    <th style={thStyle}>Рестарты</th>
                    <th style={thStyle}>Сервер</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={tdStyle}><span style={{ fontWeight: 600, color: '#f8fafc', fontFamily: 'monospace' }}>{c.name || '—'}</span></td>
                      <td style={{ ...tdStyle, color: '#94a3b8', fontSize: 11, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                        {c.image || '—'}
                      </td>
                      <td style={tdStyle}><StatusBadge status={c.status} /></td>
                      <td style={{ ...tdStyle, color: c.cpu_percent > 50 ? '#f87171' : c.cpu_percent > 20 ? '#fbbf24' : '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                        {c.cpu_percent != null ? c.cpu_percent.toFixed(1) + '%' : '—'}
                      </td>
                      <td style={{ ...tdStyle, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                        {c.mem_mb != null ? c.mem_mb.toFixed(0) : '—'}
                      </td>
                      <td style={{ ...tdStyle, color: c.mem_percent > 80 ? '#f87171' : c.mem_percent > 50 ? '#fbbf24' : '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                        {c.mem_percent != null ? c.mem_percent.toFixed(1) + '%' : '—'}
                      </td>
                      <td style={{ ...tdStyle, color: c.restarts > 0 ? '#fbbf24' : '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                        {c.restarts ?? '0'}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 11 }}>
                        <span style={{ padding: '2px 6px', background: '#090d16', border: '1px solid #1e293b', borderRadius: 4, color: '#60a5fa' }}>
                          {c.server_name || c.server_id}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    </ProtectedRoute>
  )
}

const thStyle = { textAlign: 'left', padding: '8px 10px', color: '#64748b', borderBottom: '1px solid #1e293b', fontSize: 11, fontWeight: 600 }
const tdStyle = { padding: '9px 10px', color: '#f8fafc' }
