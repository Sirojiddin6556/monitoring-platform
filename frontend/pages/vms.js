import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  Layers,
  Server,
  Cpu,
  HardDrive,
  RefreshCw,
  Trash2,
  Plus,
  Search,
  Activity,
  Play,
  Pause,
  Sliders,
  Radio,
  CheckCircle2,
  XCircle,
  ExternalLink,
  X,
  AlertTriangle,
  Info,
  Clock,
  ShieldAlert,
  ArrowUpDown
} from 'lucide-react'

function StatBox({ label, value, color, icon: IconComp, subtext }) {
  return (
    <div style={{
      background: '#101726',
      border: '1px solid #1e293b',
      borderRadius: 6,
      padding: '12px 16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center'
    }}>
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

function StateDot({ state }) {
  const s = (state || '').toLowerCase()
  const isRunning = s === 'running' || s === 'started' || s === 'on' || s === 'online'
  const isPaused = s === 'paused' || s === 'suspended' || s === 'saved'
  
  const color = isRunning ? '#34d399' : (isPaused ? '#fbbf24' : '#f87171')
  const bg = isRunning ? 'rgba(16, 185, 129, 0.12)' : (isPaused ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)')
  const border = isRunning ? 'rgba(16, 185, 129, 0.35)' : (isPaused ? 'rgba(245, 158, 11, 0.35)' : 'rgba(239, 68, 68, 0.35)')
  const label = isRunning ? 'Работает' : (isPaused ? 'Пауза' : 'Остановлена')

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 8px',
      borderRadius: 4,
      background: bg,
      border: `1px solid ${border}`,
      color,
      fontSize: 10.5,
      fontWeight: 600,
      textTransform: 'uppercase'
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: isRunning ? `0 0 6px ${color}` : 'none' }} />
      <span>{label}</span>
    </span>
  )
}

function TypeBadge({ type }) {
  const cfg = {
    hyperv: { bg: 'rgba(0, 120, 212, 0.15)', border: 'rgba(0, 120, 212, 0.35)', color: '#60a5fa', label: 'Hyper-V' },
    proxmox: { bg: 'rgba(229, 101, 0, 0.15)', border: 'rgba(229, 101, 0, 0.35)', color: '#fb923c', label: 'Proxmox' },
    vmware: { bg: 'rgba(132, 204, 22, 0.15)', border: 'rgba(132, 204, 22, 0.35)', color: '#a3e635', label: 'VMware ESXi' },
    virtualbox: { bg: 'rgba(129, 140, 248, 0.15)', border: 'rgba(129, 140, 248, 0.35)', color: '#818cf8', label: 'VirtualBox' },
    qemu: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)', color: '#fbbf24', label: 'QEMU/KVM' },
    lxc: { bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.35)', color: '#22d3ee', label: 'LXC' },
  }
  const c = cfg[(type || '').toLowerCase()] || { bg: '#1e293b', border: '#334155', color: '#94a3b8', label: type || 'VM' }
  return (
    <span style={{
      padding: '2px 7px',
      borderRadius: 4,
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.color,
      fontSize: 10,
      fontWeight: 700,
      fontFamily: 'monospace'
    }}>
      {c.label}
    </span>
  )
}

function formatUptime(sec) {
  if (!sec) return '—'
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}д ${h}ч`
  if (h > 0) return `${h}ч ${m}м`
  return `${m}м`
}

function ProgressBar({ value, max = 100, color = '#2563eb' }) {
  const pct = Math.min(Math.max(0, value), 100)
  return (
    <div style={{ width: '100%', height: 5, background: '#1e293b', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s ease' }} />
    </div>
  )
}

function findMatchedServer(vm, servers) {
  if (!vm?.ip_address || !servers?.length) return null
  return servers.find(s => s.host === vm.ip_address || s.id === vm.ip_address || s.ip === vm.ip_address)
}

export default function VMs() {
  const [mounted, setMounted] = useState(false)
  const [vms, setVms] = useState([])
  const [stats, setStats] = useState({ total: 0, running: 0, stopped: 0, paused: 0 })
  const [hypervisors, setHypervisors] = useState([])
  const [servers, setServers] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  
  // Tabs & filters
  const [tab, setTab] = useState('vms') // 'vms' | 'hypervisors'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all, running, stopped
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  
  // Add hypervisor modal
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', hv_type: 'vmware', api_url: '', username: '', password: '', token: '', server_id: '' })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState(null)

  const loadData = useCallback(async (isBg = false) => {
    if (!isBg) setRefreshing(true)
    try {
      setError(null)
      const [vmData, hvData, srvData] = await Promise.all([
        apiFetch('/api/vm/all'),
        apiFetch('/api/vm/hypervisors'),
        apiFetch('/api/servers').catch(() => ({ servers: [] })),
      ])
      setVms(vmData.vms || [])
      setStats(vmData.stats || { total: 0, running: 0, stopped: 0, paused: 0 })
      setHypervisors(hvData.hypervisors || [])
      setServers(srvData.servers || [])
    } catch (err) {
      setError(err.message || 'Ошибка загрузки виртуальных машин')
    } finally {
      setLoading(false)
      if (!isBg) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    loadData()
    const t = setInterval(() => loadData(true), 15000)
    return () => clearInterval(t)
  }, [loadData])

  async function handleAdd(e) {
    e.preventDefault()
    setAddError(null)
    if (!addForm.name.trim()) { setAddError('Имя гипервизора обязательно'); return }
    setAddLoading(true)
    try {
      await apiFetch('/api/vm/hypervisors', { method: 'POST', body: JSON.stringify(addForm) })
      setAddForm({ name: '', hv_type: 'vmware', api_url: '', username: '', password: '', token: '', server_id: '' })
      setShowAdd(false)
      await loadData()
    } catch (err) {
      setAddError(err.message || 'Ошибка добавления гипервизора')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleDeleteHv(id) {
    if (!confirm('Удалить подключение к гипервизору?')) return
    try {
      await apiFetch(`/api/vm/hypervisors/${id}`, { method: 'DELETE' })
      await loadData()
    } catch (err) {
      alert('Ошибка при удалении: ' + (err.message || ''))
    }
  }

  async function handleRefreshHv(id) {
    try {
      await apiFetch(`/api/vm/hypervisors/${id}/refresh`, { method: 'POST' })
      await loadData()
    } catch (err) {
      alert('Ошибка обновления статуса: ' + (err.message || ''))
    }
  }

  // Filtered and sorted VMs
  const filteredVms = useMemo(() => {
    let list = vms.filter(vm => {
      const isRunning = (vm.state || '').toLowerCase() === 'running'
      if (statusFilter === 'running' && !isRunning) return false
      if (statusFilter === 'stopped' && isRunning) return false
      if (sourceFilter !== 'all' && (vm.source_name !== sourceFilter && vm.source !== sourceFilter)) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const matchName = (vm.name || '').toLowerCase().includes(q)
        const matchIp = (vm.ip_address || '').toLowerCase().includes(q)
        const matchOs = (vm.os || '').toLowerCase().includes(q)
        const matchSrc = (vm.source_name || '').toLowerCase().includes(q)
        if (!matchName && !matchIp && !matchOs && !matchSrc) return false
      }
      return true
    })

    list.sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'cpu_desc') return (b.cpu_usage || 0) - (a.cpu_usage || 0)
      if (sortBy === 'ram_desc') return (b.ram_mb || 0) - (a.ram_mb || 0)
      if (sortBy === 'disk_desc') return (b.disk_gb || 0) - (a.disk_gb || 0)
      return 0
    })

    return list
  }, [vms, statusFilter, sourceFilter, search, sortBy])

  if (!mounted) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 13 }}>
            <Activity className="animate-spin" size={18} />
            Загрузка виртуальных машин...
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
                <Layers size={20} style={{ color: '#60a5fa' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                    Виртуализация и Гипервизоры
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
                  Мониторинг VMware ESXi, Proxmox VE, Hyper-V и виртуальных машин кластера
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setShowAdd(true)}
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
                  fontWeight: 600,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#1d4ed8' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#2563eb' }}
              >
                <Plus size={13} />
                <span>Добавить гипервизор</span>
              </button>

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

          {/* Stats Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
            <StatBox label="Всего ВМ" value={stats.total} color="#f8fafc" icon={Layers} subtext="в пуле" />
            <StatBox label="Работают" value={stats.running} color="#34d399" icon={Play} subtext="онлайн" />
            <StatBox label="Остановлены" value={stats.stopped} color={stats.stopped > 0 ? '#f87171' : '#64748b'} icon={XCircle} subtext="питание выкл." />
            <StatBox label="Пауза / Сохр." value={stats.paused} color={stats.paused > 0 ? '#fbbf24' : '#64748b'} icon={Pause} subtext="приостановлены" />
            <StatBox label="Гипервизоров" value={hypervisors.length} color="#60a5fa" icon={Server} subtext="подключено" />
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
                onClick={() => setTab('vms')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 4,
                  border: `1px solid ${tab === 'vms' ? '#2563eb' : '#1e293b'}`,
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: tab === 'vms' ? '#2563eb' : '#090d16',
                  color: tab === 'vms' ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.15s'
                }}
              >
                Виртуальные машины ({vms.length})
              </button>
              <button
                onClick={() => setTab('hypervisors')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 4,
                  border: `1px solid ${tab === 'hypervisors' ? '#2563eb' : '#1e293b'}`,
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: tab === 'hypervisors' ? '#2563eb' : '#090d16',
                  color: tab === 'hypervisors' ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.15s'
                }}
              >
                Гипервизоры хостов ({hypervisors.length})
              </button>
            </div>

            <div style={{ width: 1, height: 22, background: '#1e293b', margin: '0 4px' }} />

            {tab === 'vms' && (
              <>
                {/* State filters */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { id: 'all', l: 'Все' },
                    { id: 'running', l: 'Работают' },
                    { id: 'stopped', l: 'Остановлены' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setStatusFilter(f.id)}
                      style={{
                        padding: '5px 8px',
                        borderRadius: 4,
                        border: `1px solid ${statusFilter === f.id ? '#2563eb' : '#1e293b'}`,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 500,
                        background: statusFilter === f.id ? 'rgba(37, 99, 235, 0.2)' : '#090d16',
                        color: statusFilter === f.id ? '#60a5fa' : '#94a3b8',
                        transition: 'all 0.15s'
                      }}
                    >
                      {f.l}
                    </button>
                  ))}
                </div>

                {/* Hypervisor Source filter */}
                {hypervisors.length > 1 && (
                  <select
                    value={sourceFilter}
                    onChange={e => setSourceFilter(e.target.value)}
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
                    <option value="all">Все гипервизоры</option>
                    {hypervisors.map(h => (
                      <option key={h.id} value={h.name}>{h.name}</option>
                    ))}
                  </select>
                )}

                {/* Sort selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ArrowUpDown size={12} style={{ color: '#64748b' }} />
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
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
                    <option value="name">По имени (А-Я)</option>
                    <option value="cpu_desc">По нагрузке CPU (убыв.)</option>
                    <option value="ram_desc">По выделенной RAM (убыв.)</option>
                    <option value="disk_desc">По диску (убыв.)</option>
                  </select>
                </div>

                <div style={{ flex: 1 }} />

                {/* Search */}
                <div style={{ position: 'relative', width: 220 }}>
                  <Search size={13} style={{ position: 'absolute', left: 9, top: 8, color: '#64748b' }} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Поиск по ВМ, IP, ОС..."
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
              <span>Загрузка виртуальных ресурсов...</span>
            </div>
          )}
          {error && (
            <div style={{ color: '#f87171', fontSize: 12.5, padding: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 4, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Tab 1: Virtual Machines List */}
          {!loading && tab === 'vms' && (
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
                      <th style={thStyle}>Виртуальная машина</th>
                      <th style={thStyle}>Статус</th>
                      <th style={thStyle}>Платформа</th>
                      <th style={thStyle}>IP-адрес / Агент</th>
                      <th style={thStyle}>CPU (Ядра / %)</th>
                      <th style={thStyle}>RAM Память</th>
                      <th style={thStyle}>Хранилище</th>
                      <th style={thStyle}>Аптайм</th>
                      <th style={thStyle}>Гипервизор</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVms.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                          ВМ не обнаружены по заданным параметрам поиска
                        </td>
                      </tr>
                    ) : (
                      filteredVms.map((vm, i) => {
                        const matchedServer = findMatchedServer(vm, servers)
                        const cpuPct = vm.cpu_usage ?? 0
                        const cpuColor = cpuPct > 70 ? '#f87171' : (cpuPct > 30 ? '#fbbf24' : '#34d399')
                        
                        const ramMb = vm.ram_mb ?? 0
                        const ramUsedMb = vm.ram_used_mb ?? 0
                        const ramPct = ramMb > 0 ? (ramUsedMb / ramMb) * 100 : 0

                        return (
                          <tr
                            key={vm.vmid || i}
                            style={{
                              borderBottom: '1px solid #1e293b',
                              transition: 'background 0.12s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(37, 99, 235, 0.04)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                          >
                            {/* VM Name & OS */}
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: 12.5 }}>
                                  {vm.name || '—'}
                                </span>
                                {vm.os && (
                                  <span style={{ fontSize: 10.5, color: '#64748b' }}>
                                    {vm.os}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Status */}
                            <td style={tdStyle}>
                              <StateDot state={vm.state} />
                            </td>

                            {/* Platform Badge */}
                            <td style={tdStyle}>
                              <TypeBadge type={vm.type || vm.source} />
                            </td>

                            {/* IP & Matched Agent Server */}
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>
                                  {vm.ip_address || '—'}
                                </span>
                                {matchedServer ? (
                                  <Link
                                    href={`/servers?id=${matchedServer.id}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      fontSize: 10.5,
                                      color: '#60a5fa',
                                      textDecoration: 'none'
                                    }}
                                  >
                                    <Server size={10} />
                                    <span>Агент: {matchedServer.name}</span>
                                    <ExternalLink size={9} />
                                  </Link>
                                ) : (
                                  <span style={{ fontSize: 10, color: '#64748b' }}>Агент не сопоставлен</span>
                                )}
                              </div>
                            </td>

                            {/* CPU */}
                            <td style={{ ...tdStyle, width: 140 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                                <span style={{ color: '#cbd5e1' }}>{vm.cpu_count ?? 1} vCPU</span>
                                <span style={{ color: cpuColor, fontWeight: 600 }}>{cpuPct.toFixed(1)}%</span>
                              </div>
                              <ProgressBar value={cpuPct} max={100} color={cpuColor} />
                            </td>

                            {/* RAM */}
                            <td style={{ ...tdStyle, width: 150 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                                <span style={{ color: '#f8fafc', fontWeight: 600 }}>
                                  {ramMb >= 1024 ? `${(ramMb / 1024).toFixed(0)} GB` : `${ramMb} MB`}
                                </span>
                                {ramUsedMb > 0 && (
                                  <span style={{ color: '#64748b' }}>
                                    исп: {ramUsedMb >= 1024 ? `${(ramUsedMb / 1024).toFixed(1)}G` : `${ramUsedMb}M`}
                                  </span>
                                )}
                              </div>
                              {ramUsedMb > 0 && <ProgressBar value={ramPct} max={100} color="#60a5fa" />}
                            </td>

                            {/* Disk */}
                            <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>
                              {vm.disk_gb != null ? (
                                <span style={{ color: '#cbd5e1' }}>
                                  {vm.disk_gb >= 1000 ? `${(vm.disk_gb / 1024).toFixed(1)} TB` : `${vm.disk_gb.toFixed(0)} GB`}
                                </span>
                              ) : '—'}
                            </td>

                            {/* Uptime */}
                            <td style={{ ...tdStyle, color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
                              {formatUptime(vm.uptime)}
                            </td>

                            {/* Source Hypervisor */}
                            <td style={tdStyle}>
                              <span style={{
                                padding: '2px 6px',
                                background: '#090d16',
                                border: '1px solid #1e293b',
                                borderRadius: 4,
                                color: '#94a3b8',
                                fontSize: 11
                              }}>
                                {vm.source_name || vm.source || '—'}
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

          {/* Tab 2: Hypervisors Overview & Host Hardware */}
          {!loading && tab === 'hypervisors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {hypervisors.length === 0 ? (
                <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 6, padding: 60, textAlign: 'center' }}>
                  <Server size={44} style={{ color: '#64748b', opacity: 0.5, margin: '0 auto 12px' }} />
                  <div style={{ color: '#f8fafc', fontSize: 15, fontWeight: 700 }}>Гипервизоры не подключены</div>
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                    Добавьте подключение к VMware ESXi, Proxmox VE или хосту Hyper-V для мониторинга кластера
                  </div>
                  <button
                    onClick={() => setShowAdd(true)}
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
                    Подключить гипервизор
                  </button>
                </div>
              ) : (
                hypervisors.map(h => {
                  const hs = h.host_stats || {}
                  const cpuPct = hs.cpu_pct ?? 0
                  const ramPct = hs.ram_pct ?? 0
                  const diskPct = hs.disk_pct ?? 0

                  return (
                    <div
                      key={h.id}
                      style={{
                        background: '#101726',
                        border: '1px solid #1e293b',
                        borderRadius: 6,
                        padding: '16px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14
                      }}
                    >
                      {/* Hypervisor Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <TypeBadge type={h.hv_type} />
                          <span style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{h.name}</span>
                          <StateDot state={h.last_status} />
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => handleRefreshHv(h.id)}
                            title="Опросить гипервизор"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '5px 10px',
                              borderRadius: 4,
                              border: '1px solid #1e293b',
                              background: '#090d16',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              fontSize: 11.5,
                              fontWeight: 500
                            }}
                          >
                            <RefreshCw size={12} />
                            <span>Опросить</span>
                          </button>
                          <button
                            onClick={() => handleDeleteHv(h.id)}
                            title="Удалить гипервизор"
                            style={{
                              padding: '5px 8px',
                              borderRadius: 4,
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              background: 'transparent',
                              color: '#f87171',
                              cursor: 'pointer',
                              fontSize: 11.5
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Info Pills */}
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#94a3b8', flexWrap: 'wrap' }}>
                        {h.api_url && <span>API URL: <code style={{ color: '#60a5fa' }}>{h.api_url}</code></span>}
                        {h.server_id && <span>Агент хоста: <code>{h.server_id}</code></span>}
                        <span>Всего ВМ: <strong style={{ color: '#f8fafc' }}>{h.stats?.total || 0}</strong></span>
                        <span style={{ color: '#34d399' }}>● {h.stats?.running || 0} онлайн</span>
                        <span style={{ color: '#64748b' }}>○ {h.stats?.stopped || 0} выкл</span>
                        {h.last_check && (
                          <span style={{ color: '#64748b' }}>
                            Обновлено: {new Date(h.last_check).toLocaleString('ru-RU')}
                          </span>
                        )}
                      </div>

                      {/* Host Hardware Resource Gauges */}
                      {hs.cpu_cores > 0 && (
                        <div style={{
                          background: '#090d16',
                          borderRadius: 6,
                          padding: '14px 18px',
                          border: '1px solid #1e293b'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 11.5, color: '#94a3b8' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontWeight: 600 }}>
                              <Server size={14} style={{ color: '#60a5fa' }} />
                              <span>Хост: {hs.model}</span>
                            </div>
                            <span style={{ color: '#a3e635', fontFamily: 'monospace' }}>{hs.version}</span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                            {/* Host CPU */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                                <span style={{ color: '#64748b' }}>CPU ({hs.cpu_cores} ядер)</span>
                                <span style={{ color: cpuPct > 70 ? '#f87171' : '#34d399', fontWeight: 700 }}>
                                  {cpuPct.toFixed(1)}%
                                </span>
                              </div>
                              <ProgressBar value={cpuPct} max={100} color={cpuPct > 70 ? '#f87171' : '#34d399'} />
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
                                {hs.cpu_mhz_used} / {hs.cpu_mhz_total} MHz
                              </div>
                            </div>

                            {/* Host RAM */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                                <span style={{ color: '#64748b' }}>Оперативная память</span>
                                <span style={{ color: ramPct > 80 ? '#f87171' : '#60a5fa', fontWeight: 700 }}>
                                  {ramPct.toFixed(1)}%
                                </span>
                              </div>
                              <ProgressBar value={ramPct} max={100} color={ramPct > 80 ? '#f87171' : '#60a5fa'} />
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
                                {(hs.ram_mb_used / 1024).toFixed(1)} GB / {(hs.ram_mb_total / 1024).toFixed(1)} GB
                              </div>
                            </div>

                            {/* Host Storage */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                                <span style={{ color: '#64748b' }}>Хранилище Datastore</span>
                                <span style={{ color: diskPct > 85 ? '#f87171' : '#a78bfa', fontWeight: 700 }}>
                                  {diskPct.toFixed(1)}%
                                </span>
                              </div>
                              <ProgressBar value={diskPct} max={100} color={diskPct > 85 ? '#f87171' : '#a78bfa'} />
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
                                {hs.disk_gb_used ? `${hs.disk_gb_used.toFixed(0)} GB` : '—'} / {hs.disk_gb_total ? `${hs.disk_gb_total.toFixed(0)} GB` : '—'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Add Hypervisor Modal */}
          {showAdd && (
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
                maxWidth: 520,
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
                    <Server size={18} style={{ color: '#60a5fa' }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                      Подключение нового гипервизора
                    </span>
                  </div>
                  <button
                    onClick={() => setShowAdd(false)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleAdd}>
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                        Название подключения *
                      </label>
                      <input
                        value={addForm.name}
                        onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                        placeholder="например: ESXi-Cluster-1"
                        style={inputStyle}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                        Тип гипервизора
                      </label>
                      <select
                        value={addForm.hv_type}
                        onChange={e => setAddForm({ ...addForm, hv_type: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="vmware">VMware ESXi / vCenter</option>
                        <option value="proxmox">Proxmox VE</option>
                        <option value="hyperv">Microsoft Hyper-V</option>
                      </select>
                    </div>

                    {addForm.hv_type === 'hyperv' ? (
                      <div>
                        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                          Server ID (установленный агент Windows)
                        </label>
                        <input
                          value={addForm.server_id}
                          onChange={e => setAddForm({ ...addForm, server_id: e.target.value })}
                          placeholder="win-server-id"
                          style={inputStyle}
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                            API URL хоста
                          </label>
                          <input
                            value={addForm.api_url}
                            onChange={e => setAddForm({ ...addForm, api_url: e.target.value })}
                            placeholder={addForm.hv_type === 'proxmox' ? 'https://192.168.1.10:8006' : 'https://192.168.18.222'}
                            style={inputStyle}
                          />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                              Пользователь
                            </label>
                            <input
                              value={addForm.username}
                              onChange={e => setAddForm({ ...addForm, username: e.target.value })}
                              placeholder={addForm.hv_type === 'proxmox' ? 'root@pam' : 'root'}
                              style={inputStyle}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                              Пароль
                            </label>
                            <input
                              type="password"
                              value={addForm.password}
                              onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                              style={inputStyle}
                            />
                          </div>
                        </div>

                        {addForm.hv_type === 'proxmox' && (
                          <div>
                            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 5 }}>
                              API Token (опционально)
                            </label>
                            <input
                              value={addForm.token}
                              onChange={e => setAddForm({ ...addForm, token: e.target.value })}
                              placeholder="user@pam!tokenid=uuid"
                              style={inputStyle}
                            />
                          </div>
                        )}
                      </>
                    )}

                    {addError && (
                      <div style={{ color: '#f87171', fontSize: 12, padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 4 }}>
                        {addError}
                      </div>
                    )}
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
                      onClick={() => setShowAdd(false)}
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
                      disabled={addLoading}
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
                        fontWeight: 600,
                        opacity: addLoading ? 0.7 : 1
                      }}
                    >
                      {addLoading ? <Activity size={13} className="animate-spin" /> : <Plus size={13} />}
                      <span>{addLoading ? 'Подключение...' : 'Подключить'}</span>
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
