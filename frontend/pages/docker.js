import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  Boxes,
  Play,
  Square,
  Server,
  RefreshCw,
  Search,
  Activity,
  Cpu,
  Layers,
  ArrowUpDown,
  ExternalLink,
  Info,
  X,
  AlertTriangle,
  RotateCcw
} from 'lucide-react'

function StatusBadge({ status }) {
  const isRunning = (status || '').toLowerCase() === 'running'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 4,
        background: isRunning ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
        border: `1px solid ${isRunning ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
        color: isRunning ? '#34d399' : '#f87171',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.02em'
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: isRunning ? '#10b981' : '#ef4444',
          boxShadow: isRunning ? '0 0 6px rgba(16, 185, 129, 0.6)' : 'none'
        }}
      />
      <span>{isRunning ? 'Запущен' : 'Остановлен'}</span>
    </span>
  )
}

function StatBox({ label, value, color, icon: IconComp, subtext }) {
  return (
    <div
      style={{
        background: '#101726',
        border: '1px solid #1e293b',
        borderRadius: 6,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {IconComp && <IconComp size={15} style={{ color: '#64748b' }} />}
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#f8fafc', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {subtext && <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 3 }}>{subtext}</div>}
    </div>
  )
}

function ProgressBar({ value, max = 100, color = '#2563eb' }) {
  const pct = Math.min(Math.max(0, value), 100)
  return (
    <div style={{ width: '100%', height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s ease' }} />
    </div>
  )
}

export default function Docker() {
  const [mounted, setMounted] = useState(false)
  const [containers, setContainers] = useState([])
  const [stats, setStats] = useState({ total: 0, running: 0, stopped: 0, servers_with_docker: 0 })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  
  // Filters & sorting
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all, running, exited
  const [serverFilter, setServerFilter] = useState('all')
  const [sortBy, setSortBy] = useState('cpu_desc') // cpu_desc, mem_desc, name_asc, restarts_desc
  
  // Modal for inspection
  const [selectedContainer, setSelectedContainer] = useState(null)

  const loadData = useCallback(async (isBg = false) => {
    if (!isBg) setRefreshing(true)
    try {
      setError(null)
      const [cRes, sRes] = await Promise.all([
        apiFetch('/api/docker/containers'),
        apiFetch('/api/docker/stats')
      ])
      setContainers(cRes.containers || [])
      setStats(sRes || { total: 0, running: 0, stopped: 0, servers_with_docker: 0 })
    } catch (err) {
      setError(err.message || 'Ошибка загрузки данных Docker')
    } finally {
      setLoading(false)
      if (!isBg) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    loadData()
    const interval = setInterval(() => loadData(true), 10000)
    return () => clearInterval(interval)
  }, [loadData])

  // Unique servers from containers
  const servers = useMemo(() => {
    const map = new Map()
    containers.forEach(c => {
      const id = c.server_id || 'unknown'
      const name = c.server_name || id
      if (!map.has(id)) {
        map.set(id, { id, name })
      }
    })
    return Array.from(map.values())
  }, [containers])

  // Total RAM usage across all containers
  const totalMemMb = useMemo(() => {
    return containers.reduce((acc, c) => acc + (c.mem_mb || 0), 0)
  }, [containers])

  // Filtered and sorted containers
  const filtered = useMemo(() => {
    let list = containers.filter(c => {
      if (statusFilter === 'running' && (c.status || '').toLowerCase() !== 'running') return false
      if (statusFilter === 'exited' && (c.status || '').toLowerCase() === 'running') return false
      if (serverFilter !== 'all' && (c.server_id !== serverFilter && c.server_name !== serverFilter)) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchName = (c.name || '').toLowerCase().includes(q)
        const matchImage = (c.image || '').toLowerCase().includes(q)
        const matchServer = (c.server_name || c.server_id || '').toLowerCase().includes(q)
        const matchId = (c.id || '').toLowerCase().includes(q)
        if (!matchName && !matchImage && !matchServer && !matchId) return false
      }
      return true
    })

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'cpu_desc') return (b.cpu_percent || 0) - (a.cpu_percent || 0)
      if (sortBy === 'mem_desc') return (b.mem_mb || 0) - (a.mem_mb || 0)
      if (sortBy === 'restarts_desc') return (b.restarts || 0) - (a.restarts || 0)
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '')
      return 0
    })

    return list
  }, [containers, statusFilter, serverFilter, search, sortBy])

  if (!mounted) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 13 }}>
            <Activity className="animate-spin" size={18} />
            Загрузка Docker контейнеров...
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
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(37, 99, 235, 0.15)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Boxes size={20} style={{ color: '#60a5fa' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                    Docker Контейнеры и Сервисы
                  </h1>
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
                    <Play size={10} />
                    {stats.running} онлайн
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                  Распределённый мониторинг контейнеров, потребления ресурсов и устойчивости сервисов
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => loadData(false)}
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
            </div>
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
            <StatBox label="Всего контейнеров" value={stats.total} color="#f8fafc" icon={Boxes} subtext="в кластере" />
            <StatBox label="Запущенных" value={stats.running} color="#34d399" icon={Play} subtext="активны" />
            <StatBox label="Остановленных" value={stats.stopped} color={stats.stopped > 0 ? '#f87171' : '#64748b'} icon={Square} subtext={stats.stopped > 0 ? 'требуют внимания' : 'нет сбоев'} />
            <StatBox label="Серверов с Docker" value={stats.servers_with_docker} color="#60a5fa" icon={Server} subtext="узлы с агентами" />
            <StatBox label="Суммарная RAM" value={totalMemMb > 1024 ? `${(totalMemMb / 1024).toFixed(1)} GB` : `${totalMemMb.toFixed(0)} MB`} color="#818cf8" icon={Layers} subtext="потребление" />
          </div>

          {/* Filter Bar */}
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
                { id: 'all', l: 'Все' },
                { id: 'running', l: 'Запущенные' },
                { id: 'exited', l: 'Остановленные' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 4,
                    border: `1px solid ${statusFilter === f.id ? '#2563eb' : '#1e293b'}`,
                    cursor: 'pointer',
                    fontSize: 11.5,
                    fontWeight: 600,
                    background: statusFilter === f.id ? '#2563eb' : '#090d16',
                    color: statusFilter === f.id ? '#ffffff' : '#94a3b8',
                    transition: 'all 0.15s'
                  }}
                >
                  {f.l}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 22, background: '#1e293b', margin: '0 4px' }} />

            {/* Server Filter Dropdown */}
            {servers.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Server size={13} style={{ color: '#64748b' }} />
                <select
                  value={serverFilter}
                  onChange={e => setServerFilter(e.target.value)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 4,
                    border: '1px solid #1e293b',
                    background: '#090d16',
                    color: serverFilter !== 'all' ? '#60a5fa' : '#94a3b8',
                    fontSize: 11.5,
                    fontWeight: 500,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">Все серверы ({servers.length})</option>
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowUpDown size={13} style={{ color: '#64748b' }} />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#090d16',
                  color: '#94a3b8',
                  fontSize: 11.5,
                  fontWeight: 500,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="cpu_desc">Сортировка: По CPU % (убыв.)</option>
                <option value="mem_desc">Сортировка: По RAM MB (убыв.)</option>
                <option value="restarts_desc">Сортировка: По рестартам (убыв.)</option>
                <option value="name_asc">Сортировка: По имени (А-Я)</option>
              </select>
            </div>

            <div style={{ flex: 1 }} />

            {/* Live Search */}
            <div style={{ position: 'relative', width: 240 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: 8, color: '#64748b' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по имени, образу..."
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
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 8, top: 7, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Loading & Errors */}
          {loading && (
            <div style={{ color: '#64748b', fontSize: 13, padding: 30, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Activity size={16} className="animate-spin" />
              <span>Загрузка данных Docker...</span>
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
              <Boxes size={44} style={{ color: '#64748b', margin: '0 auto 14px', opacity: 0.6 }} />
              <div style={{ color: '#f8fafc', fontSize: 15, fontWeight: 700 }}>Контейнеры не найдены</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 4, maxWidth: 420, margin: '6px auto 0' }}>
                {containers.length === 0
                  ? 'Мониторинг Docker собирается агентами, установленными на серверах. Убедитесь, что демон Docker запущен на целевых хостах.'
                  : 'По выбранным критериям поиска контейнеров не обнаружено.'}
              </div>
              {(statusFilter !== 'all' || serverFilter !== 'all' || search) && (
                <button
                  onClick={() => { setStatusFilter('all'); setServerFilter('all'); setSearch('') }}
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
                  Сбросить фильтры
                </button>
              )}
            </div>
          )}

          {/* Table Container */}
          {!loading && filtered.length > 0 && (
            <div style={{
              background: '#101726',
              border: '1px solid #1e293b',
              borderRadius: 6,
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden'
            }}>
              <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#090d16', borderBottom: '1px solid #1e293b', position: 'sticky', top: 0, zIndex: 10 }}>
                      <th style={thStyle}>Контейнер</th>
                      <th style={thStyle}>Образ (Image)</th>
                      <th style={thStyle}>Статус</th>
                      <th style={thStyle}>CPU Нагрузка</th>
                      <th style={thStyle}>RAM Потребление</th>
                      <th style={thStyle}>Рестарты</th>
                      <th style={thStyle}>Хост-сервер</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => {
                      const cpuVal = c.cpu_percent != null ? Number(c.cpu_percent) : 0
                      const cpuColor = cpuVal > 60 ? '#f87171' : (cpuVal > 25 ? '#fbbf24' : '#34d399')
                      
                      const memVal = c.mem_percent != null ? Number(c.mem_percent) : 0
                      const memColor = memVal > 75 ? '#f87171' : (memVal > 40 ? '#fbbf24' : '#60a5fa')

                      return (
                        <tr
                          key={c.id || i}
                          style={{
                            borderBottom: '1px solid #1e293b',
                            transition: 'background 0.12s'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(37, 99, 235, 0.04)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          {/* Name & Short ID */}
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 600, color: '#f8fafc', fontFamily: 'monospace', fontSize: 12.5 }}>
                                {c.name || '—'}
                              </span>
                              {c.id && (
                                <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
                                  {String(c.id).slice(0, 12)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Image */}
                          <td style={{ ...tdStyle, maxWidth: 220 }}>
                            <span
                              title={c.image || ''}
                              style={{
                                display: 'inline-block',
                                color: '#94a3b8',
                                fontSize: 11,
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontFamily: 'monospace',
                                background: '#090d16',
                                border: '1px solid #1e293b',
                                padding: '2px 6px',
                                borderRadius: 3
                              }}
                            >
                              {c.image || '—'}
                            </span>
                          </td>

                          {/* Status */}
                          <td style={tdStyle}>
                            <StatusBadge status={c.status} />
                          </td>

                          {/* CPU */}
                          <td style={{ ...tdStyle, width: 140 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                              <span style={{ color: cpuColor, fontWeight: 700 }}>
                                {c.cpu_percent != null ? `${cpuVal.toFixed(1)}%` : '—'}
                              </span>
                            </div>
                            <ProgressBar value={cpuVal} max={100} color={cpuColor} />
                          </td>

                          {/* RAM */}
                          <td style={{ ...tdStyle, width: 160 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                              <span style={{ color: '#f8fafc', fontWeight: 600 }}>
                                {c.mem_mb != null ? `${c.mem_mb.toFixed(0)} MB` : '—'}
                              </span>
                              <span style={{ color: memColor }}>
                                {c.mem_percent != null ? `${memVal.toFixed(1)}%` : ''}
                              </span>
                            </div>
                            <ProgressBar value={memVal} max={100} color={memColor} />
                          </td>

                          {/* Restarts */}
                          <td style={tdStyle}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: (c.restarts || 0) > 0 ? 'rgba(245, 158, 11, 0.15)' : '#090d16',
                              border: `1px solid ${(c.restarts || 0) > 0 ? 'rgba(245, 158, 11, 0.35)' : '#1e293b'}`,
                              color: (c.restarts || 0) > 0 ? '#fbbf24' : '#64748b',
                              fontSize: 11,
                              fontWeight: 600,
                              fontVariantNumeric: 'tabular-nums'
                            }}>
                              {c.restarts ?? 0}
                            </span>
                          </td>

                          {/* Server link */}
                          <td style={tdStyle}>
                            <Link
                              href="/servers"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 6px',
                                background: 'rgba(37, 99, 235, 0.1)',
                                border: '1px solid rgba(37, 99, 235, 0.25)',
                                borderRadius: 4,
                                color: '#93c5fd',
                                fontSize: 11,
                                fontWeight: 500,
                                textDecoration: 'none'
                              }}
                            >
                              <Server size={10} />
                              <span>{c.server_name || c.server_id || 'Сервер'}</span>
                            </Link>
                          </td>

                          {/* Action Button */}
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <button
                              onClick={() => setSelectedContainer(c)}
                              title="Подробные параметры контейнера"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 8px',
                                borderRadius: 4,
                                border: '1px solid #1e293b',
                                background: '#090d16',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 500,
                                transition: 'all 0.15s'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#fff' }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8' }}
                            >
                              <Info size={12} />
                              <span>Детали</span>
                            </button>
                          </td>

                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Container Inspection Modal */}
          {selectedContainer && (
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
                maxWidth: 540,
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '14px 18px',
                  borderBottom: '1px solid #1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(37, 99, 235, 0.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Boxes size={18} style={{ color: '#60a5fa' }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>
                      {selectedContainer.name}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedContainer(null)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 6 }}>
                    <span style={{ color: '#64748b' }}>Имя:</span>
                    <strong style={{ color: '#f8fafc', fontFamily: 'monospace' }}>{selectedContainer.name}</strong>

                    <span style={{ color: '#64748b' }}>Container ID:</span>
                    <span style={{ color: '#94a3b8', fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedContainer.id || '—'}</span>

                    <span style={{ color: '#64748b' }}>Образ (Image):</span>
                    <span style={{ color: '#60a5fa', fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedContainer.image || '—'}</span>

                    <span style={{ color: '#64748b' }}>Статус:</span>
                    <div><StatusBadge status={selectedContainer.status} /></div>

                    <span style={{ color: '#64748b' }}>Хост-сервер:</span>
                    <span style={{ color: '#cbd5e1' }}>{selectedContainer.server_name || selectedContainer.server_id}</span>

                    <span style={{ color: '#64748b' }}>Нагрузка CPU:</span>
                    <span style={{ color: '#34d399', fontWeight: 600 }}>{selectedContainer.cpu_percent != null ? `${selectedContainer.cpu_percent.toFixed(2)}%` : '—'}</span>

                    <span style={{ color: '#64748b' }}>Использование RAM:</span>
                    <span style={{ color: '#f8fafc', fontWeight: 600 }}>
                      {selectedContainer.mem_mb != null ? `${selectedContainer.mem_mb.toFixed(1)} MB` : '—'}
                      {selectedContainer.mem_percent != null ? ` (${selectedContainer.mem_percent.toFixed(1)}%)` : ''}
                    </span>

                    <span style={{ color: '#64748b' }}>Рестарты:</span>
                    <span style={{ color: (selectedContainer.restarts || 0) > 0 ? '#fbbf24' : '#64748b' }}>{selectedContainer.restarts ?? 0}</span>
                  </div>
                </div>

                <div style={{
                  padding: '12px 18px',
                  borderTop: '1px solid #1e293b',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  background: '#090d16'
                }}>
                  <button
                    onClick={() => setSelectedContainer(null)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 4,
                      border: '1px solid #1e293b',
                      background: '#101726',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 500
                    }}
                  >
                    Закрыть
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

const thStyle = {
  textAlign: 'left',
  padding: '10px 12px',
  color: '#64748b',
  borderBottom: '1px solid #1e293b',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em'
}

const tdStyle = {
  padding: '10px 12px',
  color: '#f8fafc',
  verticalAlign: 'middle'
}
