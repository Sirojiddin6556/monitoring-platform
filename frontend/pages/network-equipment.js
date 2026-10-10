import { useEffect, useState, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  Network,
  Server,
  Activity,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  Zap,
} from 'lucide-react'

function StatusBadge({ status }) {
  const isUp = status === 'up' || status === 'running' || status === 'active' || status === 'ok'
  const color = isUp ? '#10b981' : '#ef4444'
  const bg = isUp ? '#10b98115' : '#ef444415'
  const border = isUp ? '#10b98130' : '#ef444430'
  const label = isUp ? 'Online' : 'Offline'
  const Icon = isUp ? CheckCircle2 : XCircle

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 4,
        background: bg,
        border: `1px solid ${border}`,
        color: color,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <Icon size={12} strokeWidth={2.2} />
      {label}
    </span>
  )
}

export default function NetworkEquipment() {
  const [mounted, setMounted] = useState(false)
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadData = useCallback(async () => {
    try {
      const serversData = await apiFetch('/api/servers')
      const serversList = Array.isArray(serversData) ? serversData : (serversData?.servers || [])

      let allEquip = []

      // Read from s.agent_data if available
      for (const s of serversList) {
        const netItems = s.agent_data?.network_equipment || []
        for (const eq of netItems) {
          allEquip.push({
            ...eq,
            serverName: s.name,
            serverId: s.id,
          })
        }
      }

      // Fallback: If not in agent_data, fetch detail for first 10 servers
      if (allEquip.length === 0) {
        const details = await Promise.all(
          serversList.slice(0, 10).map(async (s) => {
            try {
              const res = await apiFetch(`/api/servers/${s.id}/detail`)
              return { serverName: s.name, serverId: s.id, items: res?.detail?.network_equipment || [] }
            } catch {
              return { serverName: s.name, serverId: s.id, items: [] }
            }
          })
        )
        for (const item of details) {
          for (const eq of item.items) {
            allEquip.push({
              ...eq,
              serverName: item.serverName,
              serverId: item.serverId,
            })
          }
        }
      }

      setEquipment(allEquip)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const t = setInterval(loadData, 20000)
    return () => clearInterval(t)
  }, [loadData])

  const total = equipment.length
  const onlineCount = equipment.filter((eq) => eq.status === 'up' || eq.status === 'running' || eq.status === 'active' || eq.status === 'ok').length
  const offlineCount = total - onlineCount
  const validLatencies = equipment.map((eq) => eq.latency_ms).filter((v) => v != null)
  const avgLatency = validLatencies.length
    ? (validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length).toFixed(1)
    : '—'

  const filtered = equipment.filter((eq) => {
    const isUp = eq.status === 'up' || eq.status === 'running' || eq.status === 'active' || eq.status === 'ok'
    if (statusFilter === 'up' && !isUp) return false
    if (statusFilter === 'down' && isUp) return false

    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (eq.name || '').toLowerCase().includes(q) ||
      (eq.ip || '').toLowerCase().includes(q) ||
      (eq.serverName || '').toLowerCase().includes(q)
    )
  })

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
                <Network size={22} color="#2563eb" />
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  Сетевое оборудование и коммутаторы
                </h1>
              </div>
              <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0 0' }}>
                SNMP и ICMP мониторинг коммутаторов, маршрутизаторов и промежуточных сетевых узлов
              </p>
            </div>

            <button
              onClick={loadData}
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
          </div>

          {/* Quick Metrics */}
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
                Всего устройств
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {total}
              </div>
            </div>

            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                В сети (Online)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {onlineCount}
              </div>
            </div>

            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Недоступно (Offline)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: offlineCount > 0 ? '#ef4444' : '#f8fafc', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {offlineCount}
              </div>
            </div>

            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Средняя задержка
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {avgLatency} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>мс</span>
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'all', label: 'Все устройства' },
                { id: 'up', label: 'В сети (Online)' },
                { id: 'down', label: 'Недоступные' },
              ].map((f) => {
                const active = statusFilter === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      border: `1px solid ${active ? '#2563eb' : '#1e293b'}`,
                      background: active ? '#2563eb' : '#101726',
                      color: active ? '#ffffff' : '#94a3b8',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>

            <div style={{ position: 'relative' }}>
              <Search size={12} color="#64748b" style={{ position: 'absolute', left: 10, top: 9 }} />
              <input
                type="text"
                placeholder="Поиск по имени, IP или серверу..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: '6px 12px 6px 30px',
                  background: '#101726',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  color: '#f8fafc',
                  fontSize: 12,
                  outline: 'none',
                  width: 240,
                }}
              />
            </div>
          </div>

          {/* Table Container */}
          <div
            style={{
              background: '#101726',
              border: '1px solid #1e293b',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {loading && equipment.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                Опрос сетевого оборудования...
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                <Network size={32} color="#2563eb" style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc', marginBottom: 4 }}>
                  Сетевые устройства не найдены
                </div>
                <div style={{ fontSize: 13 }}>
                  {search
                    ? 'По вашему поисковому запросу ничего не найдено.'
                    : 'Отслеживаемое сетевое оборудование не настроено. Задайте переменную MONITOR_NET_EQUIP на сервере-агенте.'}
                </div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0d1320', borderBottom: '1px solid #1e293b' }}>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Название устройства
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      IP адрес
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Агент опроса
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Сетевой статус
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Задержка (Latency)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((eq, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        transition: 'background 0.15s',
                      }}
                    >
                      <td style={{ padding: '12px 14px', color: '#f8fafc', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Network size={13} color="#2563eb" />
                          {eq.name}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                        <code style={{ fontSize: 12, color: '#38bdf8' }}>{eq.ip}</code>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 6px',
                            background: '#090d16',
                            border: '1px solid #1e293b',
                            borderRadius: 4,
                            fontSize: 11,
                          }}
                        >
                          <Server size={10} color="#64748b" />
                          {eq.serverName}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusBadge status={eq.status} />
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          fontWeight: 700,
                          color: eq.latency_ms != null && eq.latency_ms < 50 ? '#10b981' : '#f59e0b',
                          fontFeatureSettings: '"tnum"',
                        }}
                      >
                        {eq.latency_ms != null ? `${Number(eq.latency_ms).toFixed(1)} мс` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
