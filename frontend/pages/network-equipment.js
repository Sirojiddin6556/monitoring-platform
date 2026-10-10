import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
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
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  Radio,
  SlidersHorizontal,
  ExternalLink,
  Plus,
  Trash2,
  X,
  AlertTriangle
} from 'lucide-react'

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
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

function InterfaceTypeBadge({ name }) {
  const isPhys = name.startsWith('eth') || name.startsWith('ens') || name.startsWith('enp') || name.startsWith('em')
  const isBridge = name.startsWith('br-') || name === 'docker0'
  const isVeth = name.startsWith('veth')

  let label = 'Виртуальный'
  let color = '#94a3b8'
  let bg = '#1e293b'

  if (isPhys) {
    label = 'Физический (NIC)'
    color = '#34d399'
    bg = 'rgba(16, 185, 129, 0.12)'
  } else if (isBridge) {
    label = 'Мост (Bridge)'
    color = '#60a5fa'
    bg = 'rgba(37, 99, 235, 0.12)'
  } else if (isVeth) {
    label = 'Контейнер (veth)'
    color = '#fbbf24'
    bg = 'rgba(245, 158, 11, 0.12)'
  }

  return (
    <span style={{
      padding: '2px 7px',
      borderRadius: 4,
      background: bg,
      border: `1px solid ${color}40`,
      color,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.02em'
    }}>
      {label}
    </span>
  )
}

export default function NetworkEquipment() {
  const [mounted, setMounted] = useState(false)
  const [servers, setServers] = useState([])
  const [interfaces, setInterfaces] = useState([])
  const [customDevices, setCustomDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  
  // Navigation & filters
  const [tab, setTab] = useState('interfaces') // 'interfaces' | 'topology' | 'snmp'
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // 'all', 'physical', 'bridge', 'veth'
  const [serverFilter, setServerFilter] = useState('all')
  
  // Add SNMP modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', ip: '', role: 'switch', vendor: '', location: '', community: 'public' })

  // Load custom SNMP devices from localStorage
  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('network_custom_devices')
      if (saved) {
        try { setCustomDevices(JSON.parse(saved)) } catch {}
      } else {
        // Defaults: infrastructure gateways
        const defaultGateways = [
          { id: 1, name: 'Core Gateway (Шлюз сети 16.0/22)', ip: '192.168.16.1', role: 'router', vendor: 'MikroTik / Cisco', location: 'Серверная SSV', status: 'up' },
          { id: 2, name: 'VMware ESXi Host Management', ip: '192.168.18.222', role: 'hypervisor', vendor: 'VMware ESXi 7.0', location: 'Стойка R1', status: 'up' }
        ]
        setCustomDevices(defaultGateways)
      }
    }
  }, [])

  const loadData = useCallback(async (isBg = false) => {
    if (!isBg) setRefreshing(true)
    try {
      setError(null)
      const serversData = await apiFetch('/api/servers')
      const serversList = Array.isArray(serversData) ? serversData : (serversData?.servers || [])
      setServers(serversList)

      // Fetch details for all servers to collect real network interfaces and traffic stats
      const details = await Promise.all(
        serversList.map(async (s) => {
          try {
            const res = await apiFetch(`/api/servers/${s.id}/detail`)
            return {
              server: s,
              detail: res?.detail || {}
            }
          } catch {
            return { server: s, detail: {} }
          }
        })
      )

      let allIfaces = []
      for (const item of details) {
        const ifaceList = item.detail?.network_interfaces || []
        for (const iface of ifaceList) {
          allIfaces.push({
            ...iface,
            serverName: item.server.name || item.server.id,
            serverId: item.server.id,
            serverIp: item.server.host || item.server.ip || '—',
            status: (iface.errors_in === 0 && iface.errors_out === 0) ? 'up' : 'warning'
          })
        }
      }

      setInterfaces(allIfaces)
    } catch (err) {
      setError(err.message || 'Ошибка загрузки сетевой инфраструктуры')
    } finally {
      setLoading(false)
      if (!isBg) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const t = setInterval(() => loadData(true), 15000)
    return () => clearInterval(t)
  }, [loadData])

  function handleSaveDevice(e) {
    e.preventDefault()
    if (!addForm.name.trim() || !addForm.ip.trim()) return
    const newDev = {
      id: Date.now(),
      name: addForm.name.trim(),
      ip: addForm.ip.trim(),
      role: addForm.role,
      vendor: addForm.vendor.trim() || 'Generic',
      location: addForm.location.trim() || 'Дата-центр',
      status: 'up'
    }
    const updated = [...customDevices, newDev]
    setCustomDevices(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem('network_custom_devices', JSON.stringify(updated))
    }
    setShowAddModal(false)
    setAddForm({ name: '', ip: '', role: 'switch', vendor: '', location: '', community: 'public' })
  }

  function handleDeleteDevice(id) {
    if (!confirm('Удалить сетевое устройство из мониторинга?')) return
    const updated = customDevices.filter(d => d.id !== id)
    setCustomDevices(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem('network_custom_devices', JSON.stringify(updated))
    }
  }

  // Aggregate stats
  const totalInterfaces = interfaces.length
  const physicalCount = interfaces.filter(i => i.name.startsWith('eth') || i.name.startsWith('ens') || i.name.startsWith('enp')).length
  const bridgeCount = interfaces.filter(i => i.name.startsWith('br-') || i.name === 'docker0').length
  
  const totalSpeedInMbps = useMemo(() => {
    return interfaces.reduce((acc, i) => acc + (i.speed_in_mbps || 0), 0)
  }, [interfaces])

  const totalSpeedOutMbps = useMemo(() => {
    return interfaces.reduce((acc, i) => acc + (i.speed_out_mbps || 0), 0)
  }, [interfaces])

  // Filtered interfaces
  const filteredInterfaces = useMemo(() => {
    return interfaces.filter(iface => {
      const isPhys = iface.name.startsWith('eth') || iface.name.startsWith('ens') || iface.name.startsWith('enp')
      const isBridge = iface.name.startsWith('br-') || iface.name === 'docker0'
      const isVeth = iface.name.startsWith('veth')

      if (typeFilter === 'physical' && !isPhys) return false
      if (typeFilter === 'bridge' && !isBridge) return false
      if (typeFilter === 'veth' && !isVeth) return false

      if (serverFilter !== 'all' && (iface.serverId !== serverFilter && iface.serverName !== serverFilter)) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const matchName = (iface.name || '').toLowerCase().includes(q)
        const matchServer = (iface.serverName || '').toLowerCase().includes(q)
        const matchIp = (iface.serverIp || '').toLowerCase().includes(q)
        if (!matchName && !matchServer && !matchIp) return false
      }
      return true
    })
  }, [interfaces, typeFilter, serverFilter, search])

  if (!mounted) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 13 }}>
            <Activity className="animate-spin" size={18} />
            Загрузка сетевой инфраструктуры...
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
                <Network size={20} style={{ color: '#60a5fa' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                    Сетевая Инфраструктура и Оборудование
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
                    <Radio size={11} />
                    Сеть 192.168.16.0/22
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                  Мониторинг физических и виртуальных интерфейсов, пропускной способности каналов и сетевых узлов
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {tab === 'snmp' && (
                <button
                  onClick={() => setShowAddModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 4,
                    border: '1px solid rgba(37, 99, 235, 0.5)',
                    background: '#2563eb',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontSize: 11.5,
                    fontWeight: 600
                  }}
                >
                  <Plus size={13} />
                  <span>Добавить устройство</span>
                </button>
              )}

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
                <span>{refreshing ? 'Опрос...' : 'Обновить'}</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
            <StatBox label="Всего адаптеров" value={totalInterfaces} color="#f8fafc" icon={Network} subtext="в кластере" />
            <StatBox label="Физических NIC" value={physicalCount} color="#34d399" icon={Server} subtext="ens / eth" />
            <StatBox label="Мостов (Bridge)" value={bridgeCount} color="#60a5fa" icon={Layers} subtext="Docker / Kube" />
            <StatBox label="Входящий канал" value={`${totalSpeedInMbps.toFixed(2)} Mb/s`} color="#38bdf8" icon={ArrowDownLeft} subtext="текущая скорость" />
            <StatBox label="Исходящий канал" value={`${totalSpeedOutMbps.toFixed(2)} Mb/s`} color="#818cf8" icon={ArrowUpRight} subtext="текущая скорость" />
          </div>

          {/* Tab Navigation & Toolbar */}
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
            {/* View Mode Tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setTab('interfaces')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 4,
                  border: `1px solid ${tab === 'interfaces' ? '#2563eb' : '#1e293b'}`,
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: tab === 'interfaces' ? '#2563eb' : '#090d16',
                  color: tab === 'interfaces' ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.15s'
                }}
              >
                Интерфейсы серверов ({interfaces.length})
              </button>
              <button
                onClick={() => setTab('topology')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 4,
                  border: `1px solid ${tab === 'topology' ? '#2563eb' : '#1e293b'}`,
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: tab === 'topology' ? '#2563eb' : '#090d16',
                  color: tab === 'topology' ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.15s'
                }}
              >
                Узлы и Топология ({servers.length})
              </button>
              <button
                onClick={() => setTab('snmp')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 4,
                  border: `1px solid ${tab === 'snmp' ? '#2563eb' : '#1e293b'}`,
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: tab === 'snmp' ? '#2563eb' : '#090d16',
                  color: tab === 'snmp' ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.15s'
                }}
              >
                Сетевое оборудование ({customDevices.length})
              </button>
            </div>

            <div style={{ width: 1, height: 22, background: '#1e293b', margin: '0 4px' }} />

            {tab === 'interfaces' && (
              <>
                {/* Interface Type Filter */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { id: 'all', l: 'Все' },
                    { id: 'physical', l: 'Физические' },
                    { id: 'bridge', l: 'Мосты' },
                    { id: 'veth', l: 'Контейнеры' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setTypeFilter(f.id)}
                      style={{
                        padding: '5px 8px',
                        borderRadius: 4,
                        border: `1px solid ${typeFilter === f.id ? '#2563eb' : '#1e293b'}`,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 500,
                        background: typeFilter === f.id ? 'rgba(37, 99, 235, 0.2)' : '#090d16',
                        color: typeFilter === f.id ? '#60a5fa' : '#94a3b8',
                        transition: 'all 0.15s'
                      }}
                    >
                      {f.l}
                    </button>
                  ))}
                </div>

                {/* Server Filter Dropdown */}
                {servers.length > 1 && (
                  <select
                    value={serverFilter}
                    onChange={e => setServerFilter(e.target.value)}
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
                    <option value="all">Все хосты ({servers.length})</option>
                    {servers.map(s => (
                      <option key={s.id} value={s.id}>{s.name || s.id}</option>
                    ))}
                  </select>
                )}

                <div style={{ flex: 1 }} />

                {/* Search */}
                <div style={{ position: 'relative', width: 220 }}>
                  <Search size={13} style={{ position: 'absolute', left: 9, top: 8, color: '#64748b' }} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Поиск по адаптеру, хосту..."
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
              </>
            )}
          </div>

          {/* Loading & Error */}
          {loading && (
            <div style={{ color: '#64748b', fontSize: 13, padding: 30, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Activity size={16} className="animate-spin" />
              <span>Опрос сетевых параметров серверов...</span>
            </div>
          )}
          {error && (
            <div style={{ color: '#f87171', fontSize: 12.5, padding: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 4, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Tab 1: Network Interfaces Table */}
          {!loading && tab === 'interfaces' && (
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
                      <th style={thStyle}>Интерфейс</th>
                      <th style={thStyle}>Тип адаптера</th>
                      <th style={thStyle}>Хост-сервер</th>
                      <th style={thStyle}>Входящий поток (RX)</th>
                      <th style={thStyle}>Исходящий поток (TX)</th>
                      <th style={thStyle}>Общий объём RX</th>
                      <th style={thStyle}>Общий объём TX</th>
                      <th style={thStyle}>Потери (Drops)</th>
                      <th style={thStyle}>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInterfaces.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                          Сетевые интерфейсы не найдены
                        </td>
                      </tr>
                    ) : (
                      filteredInterfaces.map((iface, i) => {
                        const inMbps = iface.speed_in_mbps || 0
                        const outMbps = iface.speed_out_mbps || 0
                        const drops = (iface.drops_in || 0) + (iface.drops_out || 0)

                        return (
                          <tr
                            key={`${iface.serverId}-${iface.name}-${i}`}
                            style={{
                              borderBottom: '1px solid #1e293b',
                              transition: 'background 0.12s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(37, 99, 235, 0.04)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                          >
                            {/* Interface Name */}
                            <td style={tdStyle}>
                              <span style={{ fontWeight: 600, color: '#f8fafc', fontFamily: 'monospace', fontSize: 12.5 }}>
                                {iface.name}
                              </span>
                            </td>

                            {/* Type */}
                            <td style={tdStyle}>
                              <InterfaceTypeBadge name={iface.name} />
                            </td>

                            {/* Server link */}
                            <td style={tdStyle}>
                              <Link
                                href="/servers"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  color: '#60a5fa',
                                  textDecoration: 'none',
                                  fontSize: 11.5
                                }}
                              >
                                <Server size={11} />
                                <span>{iface.serverName}</span>
                              </Link>
                            </td>

                            {/* Speed In */}
                            <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>
                              <span style={{ color: inMbps > 10 ? '#f87171' : (inMbps > 1 ? '#fbbf24' : '#38bdf8'), fontWeight: 600 }}>
                                {inMbps.toFixed(3)} Mb/s
                              </span>
                            </td>

                            {/* Speed Out */}
                            <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>
                              <span style={{ color: outMbps > 10 ? '#f87171' : (outMbps > 1 ? '#fbbf24' : '#818cf8'), fontWeight: 600 }}>
                                {outMbps.toFixed(3)} Mb/s
                              </span>
                            </td>

                            {/* Bytes Recv */}
                            <td style={{ ...tdStyle, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                              {formatBytes(iface.bytes_recv)}
                            </td>

                            {/* Bytes Sent */}
                            <td style={{ ...tdStyle, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                              {formatBytes(iface.bytes_sent)}
                            </td>

                            {/* Drops */}
                            <td style={tdStyle}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: drops > 0 ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                                color: drops > 0 ? '#fbbf24' : '#64748b',
                                fontSize: 11,
                                fontVariantNumeric: 'tabular-nums'
                              }}>
                                {drops > 0 ? `${drops.toLocaleString('ru-RU')} drops` : '0'}
                              </span>
                            </td>

                            {/* Status */}
                            <td style={tdStyle}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#34d399', fontSize: 11, fontWeight: 600 }}>
                                <CheckCircle2 size={12} />
                                <span>Активен</span>
                              </span>
                            </td>

                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 2: Topology and Cluster Nodes */}
          {!loading && tab === 'topology' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {servers.map((s, idx) => {
                const sIfaces = interfaces.filter(i => i.serverId === s.id || i.serverName === s.name)
                const physIface = sIfaces.find(i => i.name.startsWith('ens') || i.name.startsWith('eth')) || {}

                return (
                  <div
                    key={s.id || idx}
                    style={{
                      background: '#101726',
                      border: '1px solid #1e293b',
                      borderRadius: 6,
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Server size={18} style={{ color: '#60a5fa' }} />
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>{s.name || s.id}</span>
                      </div>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#34d399',
                        fontSize: 10.5,
                        fontWeight: 600
                      }}>
                        Online
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5, color: '#94a3b8' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>IP-адрес хоста:</span>
                        <strong style={{ color: '#f8fafc', fontFamily: 'monospace' }}>{s.host || s.ip || '—'}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Основной интерфейс:</span>
                        <span style={{ color: '#60a5fa', fontFamily: 'monospace' }}>{physIface.name || 'ens192'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Подсеть:</span>
                        <span style={{ color: '#cbd5e1' }}>192.168.16.0/22</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Шлюз по умолчанию:</span>
                        <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>192.168.16.1</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Адаптеров на хосте:</span>
                        <span style={{ color: '#f8fafc', fontWeight: 600 }}>{sIfaces.length}</span>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#64748b' }}>Трафик хоста:</span>
                      <span style={{ fontSize: 11, color: '#38bdf8', fontVariantNumeric: 'tabular-nums' }}>
                        ↓ {(sIfaces.reduce((a, b) => a + (b.speed_in_mbps || 0), 0)).toFixed(2)} Mb/s  ↑ {(sIfaces.reduce((a, b) => a + (b.speed_out_mbps || 0), 0)).toFixed(2)} Mb/s
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Tab 3: Custom SNMP / Network Devices */}
          {!loading && tab === 'snmp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {customDevices.length === 0 ? (
                <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 6, padding: 60, textAlign: 'center' }}>
                  <Network size={44} style={{ color: '#64748b', opacity: 0.5, margin: '0 auto 12px' }} />
                  <div style={{ color: '#f8fafc', fontSize: 15, fontWeight: 700 }}>Сетевые устройства не добавлены</div>
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                    Добавьте сетевые коммутаторы, маршрутизаторы или шлюзы для контроля доступности по ICMP/SNMP
                  </div>
                  <button
                    onClick={() => setShowAddModal(true)}
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
                    Добавить устройство
                  </button>
                </div>
              ) : (
                <div style={{
                  background: '#101726',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  overflow: 'hidden'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#090d16', borderBottom: '1px solid #1e293b' }}>
                        <th style={thStyle}>Устройство</th>
                        <th style={thStyle}>IP-адрес</th>
                        <th style={thStyle}>Роль</th>
                        <th style={thStyle}>Вендор / Модель</th>
                        <th style={thStyle}>Размещение</th>
                        <th style={thStyle}>Статус</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customDevices.map(d => (
                        <tr key={d.id} style={{ borderBottom: '1px solid #1e293b' }}>
                          <td style={tdStyle}>
                            <span style={{ fontWeight: 600, color: '#f8fafc' }}>{d.name}</span>
                          </td>
                          <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#60a5fa' }}>
                            {d.ip}
                          </td>
                          <td style={tdStyle}>
                            <span style={{ textTransform: 'capitalize', color: '#cbd5e1' }}>{d.role}</span>
                          </td>
                          <td style={{ ...tdStyle, color: '#94a3b8' }}>
                            {d.vendor}
                          </td>
                          <td style={{ ...tdStyle, color: '#64748b' }}>
                            {d.location}
                          </td>
                          <td style={tdStyle}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#34d399', fontSize: 11, fontWeight: 600 }}>
                              <CheckCircle2 size={12} />
                              <span>Шлюз онлайн</span>
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <button
                              onClick={() => handleDeleteDevice(d.id)}
                              title="Удалить"
                              style={{
                                padding: '4px 8px',
                                borderRadius: 4,
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                background: 'transparent',
                                color: '#f87171',
                                cursor: 'pointer',
                                fontSize: 11
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Add Device Modal */}
          {showAddModal && (
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
                maxWidth: 480,
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
                    <Network size={18} style={{ color: '#60a5fa' }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                      Добавление сетевого оборудования
                    </span>
                  </div>
                  <button
                    onClick={() => setShowAddModal(false)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleSaveDevice}>
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                        Название устройства *
                      </label>
                      <input
                        value={addForm.name}
                        onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                        placeholder="например: Switch-Cisco-Core"
                        style={inputStyle}
                        required
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                          IP-адрес *
                        </label>
                        <input
                          value={addForm.ip}
                          onChange={e => setAddForm({ ...addForm, ip: e.target.value })}
                          placeholder="192.168.16.1"
                          style={inputStyle}
                          required
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                          Тип узла
                        </label>
                        <select
                          value={addForm.role}
                          onChange={e => setAddForm({ ...addForm, role: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="switch">Коммутатор (Switch)</option>
                          <option value="router">Маршрутизатор (Router)</option>
                          <option value="firewall">Межсетевой экран</option>
                          <option value="ap">Точка доступа (Wi-Fi)</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                          Вендор / Модель
                        </label>
                        <input
                          value={addForm.vendor}
                          onChange={e => setAddForm({ ...addForm, vendor: e.target.value })}
                          placeholder="MikroTik CCR2004"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                          Размещение
                        </label>
                        <input
                          value={addForm.location}
                          onChange={e => setAddForm({ ...addForm, location: e.target.value })}
                          placeholder="Серверная 2 эт."
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{
                    padding: '12px 18px',
                    borderTop: '1px solid #1e293b',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 10,
                    background: '#090d16'
                  }}>
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
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
                      Отмена
                    </button>
                    <button
                      type="submit"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 16px',
                        borderRadius: 4,
                        border: 'none',
                        background: '#2563eb',
                        color: '#ffffff',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600
                      }}
                    >
                      Сохранить
                    </button>
                  </div>
                </form>
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

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 4,
  border: '1px solid #1e293b',
  background: '#090d16',
  color: '#f8fafc',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box'
}
