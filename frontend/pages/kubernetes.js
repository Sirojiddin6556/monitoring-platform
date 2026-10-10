import { useEffect, useState, useMemo } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  Boxes,
  Server,
  Layers,
  Folder,
  RefreshCw,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowRight
} from 'lucide-react'

function StatusBadge({ status }) {
  const isOk = status === 'Ready' || status === 'Running' || status === 'Active' || status === 'Succeeded'
  const isPending = status === 'Pending' || status === 'Terminating'
  const color = isOk ? '#10b981' : isPending ? '#f59e0b' : '#ef4444'
  const bg = isOk ? '#10b98118' : isPending ? '#f59e0b18' : '#ef444418'
  const border = isOk ? '#10b98135' : isPending ? '#f59e0b35' : '#ef444435'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 7px',
        borderRadius: 4,
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {status || 'Unknown'}
    </span>
  )
}

function StatBox({ label, value, color = '#2563eb', icon: Icon }) {
  return (
    <div
      style={{
        background: '#101726',
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
          {label}
        </span>
        {Icon && <Icon size={14} style={{ color, opacity: 0.8 }} />}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  )
}

export default function Kubernetes() {
  const [mounted, setMounted] = useState(false)
  const [clusters, setClusters] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('pods')
  const [search, setSearch] = useState('')
  const [nsFilter, setNsFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', api_url: '', token: '' })
  const [addError, setAddError] = useState(null)
  const [addLoading, setAddLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadClusters = async () => {
    try {
      setError(null)
      const d = await apiFetch('/api/kubernetes/clusters')
      const cls = d.clusters || []
      setClusters(cls)
      if (cls.length > 0 && !selected) {
        setSelected(cls[0])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMounted(true)
    loadClusters()
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setAddError(null)
    if (!addForm.name.trim() || !addForm.api_url.trim()) {
      setAddError('Имя и API URL обязательны')
      return
    }
    setAddLoading(true)
    try {
      const res = await apiFetch('/api/kubernetes/clusters', {
        method: 'POST',
        body: JSON.stringify(addForm),
      })
      if (res.detail) {
        setAddError(res.detail)
        return
      }
      setAddForm({ name: '', api_url: '', token: '' })
      setShowAdd(false)
      await loadClusters()
    } catch (err) {
      setAddError(err.message || 'Ошибка добавления кластера')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Удалить данный кластер из мониторинга?')) return
    try {
      await apiFetch(`/api/kubernetes/clusters/${id}`, { method: 'DELETE' })
      if (selected?.id === id) setSelected(null)
      await loadClusters()
    } catch (err) {
      setError('Ошибка удаления кластера')
    }
  }

  async function handleRefresh(id) {
    setRefreshing(true)
    try {
      await apiFetch(`/api/kubernetes/clusters/${id}/refresh`, { method: 'POST' })
      await loadClusters()
    } catch (err) {
      setError('Ошибка обновления данных кластера')
    } finally {
      setRefreshing(false)
    }
  }

  const sel = selected ? clusters.find((c) => c.id === selected.id) : null
  const pods = sel?.pods || []
  const nodes = sel?.nodes || []
  const deployments = sel?.deployments || []
  const namespaces = sel?.namespaces || []
  const stats = sel?.stats || {}

  const allNs = useMemo(() => [...new Set(pods.map((p) => p.namespace))].sort(), [pods])

  const filteredPods = useMemo(() => {
    return pods.filter((p) => {
      if (nsFilter !== 'all' && p.namespace !== nsFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          (p.name || '').toLowerCase().includes(q) ||
          (p.namespace || '').toLowerCase().includes(q) ||
          (p.node || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [pods, nsFilter, search])

  const filteredDeployments = useMemo(() => {
    return deployments.filter((d) => {
      if (nsFilter !== 'all' && d.namespace !== nsFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          (d.name || '').toLowerCase().includes(q) ||
          (d.namespace || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [deployments, nsFilter, search])

  const TABS = [
    { id: 'pods', label: 'Поды', icon: Boxes, count: pods.length },
    { id: 'deployments', label: 'Деплойменты', icon: Layers, count: deployments.length },
    { id: 'nodes', label: 'Ноды', icon: Server, count: nodes.length },
    { id: 'namespaces', label: 'Неймспейсы', icon: Folder, count: namespaces.length },
  ]

  if (!mounted) return null

  return (
    <ProtectedRoute requiredRole="admin">
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 7, borderRadius: 6, background: '#2563eb18', color: '#38bdf8' }}>
                  <Boxes size={20} />
                </div>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                  Kubernetes
                </h1>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Инспекция нод, деплойментов, подов и неймспейсов кластерной инфраструктуры
              </div>
            </div>

            <button
              onClick={() => setShowAdd(!showAdd)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 6,
                border: '1px solid #1e293b',
                background: showAdd ? '#1e293b' : '#2563eb',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={13} />
              {showAdd ? 'Отмена' : 'Добавить кластер'}
            </button>
          </div>

          {showAdd && (
            <form
              onSubmit={handleAdd}
              style={{
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: 16,
                marginBottom: 20,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Название кластера</label>
                <input
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="prod-k8s"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>API URL</label>
                <input
                  value={addForm.api_url}
                  onChange={(e) => setAddForm({ ...addForm, api_url: e.target.value })}
                  placeholder="https://192.168.17.50:6443"
                  style={{ ...inputStyle, width: 260 }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Bearer Token</label>
                <input
                  value={addForm.token}
                  onChange={(e) => setAddForm({ ...addForm, token: e.target.value })}
                  placeholder="опционально"
                  type="password"
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                disabled={addLoading}
                style={{
                  padding: '7px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {addLoading ? 'Сохранение...' : 'Сохранить'}
              </button>
              {addError && <div style={{ color: '#ef4444', fontSize: 11, width: '100%' }}>{addError}</div>}
            </form>
          )}

          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              Загрузка данных кластеров...
            </div>
          ) : clusters.length === 0 && !showAdd ? (
            <div
              style={{
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: 60,
                textAlign: 'center',
              }}
            >
              <div style={{ padding: 12, borderRadius: 10, background: '#2563eb15', color: '#38bdf8', display: 'inline-block', marginBottom: 12 }}>
                <Boxes size={32} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc', marginBottom: 6 }}>
                Кластеры Kubernetes не подключены
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                Добавьте адрес kube-apiserver и токен доступа для визуализации ресурсов
              </div>
              <button
                onClick={() => setShowAdd(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                + Добавить первый кластер
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
              {/* Cluster List */}
              <div
                style={{
                  background: '#101726',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  padding: 12,
                  height: 'fit-content',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8, padding: '4px 6px' }}>
                  Кластеры ({clusters.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {clusters.map((c) => {
                    const isSelected = selected?.id === c.id
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelected(c)
                          setActiveTab('pods')
                          setSearch('')
                          setNsFilter('all')
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: isSelected ? '#1e293b' : 'transparent',
                          border: isSelected ? '1px solid #3b82f640' : '1px solid transparent',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.api_url}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRefresh(c.id)
                            }}
                            title="Обновить"
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                          >
                            <RefreshCw size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(c.id)
                            }}
                            title="Удалить"
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Cluster Detail */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {sel && (
                  <>
                    {/* Header + Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                      <StatBox label="Всего подов" value={stats.total_pods || 0} color="#2563eb" icon={Boxes} />
                      <StatBox label="Запущено" value={stats.running_pods || 0} color="#10b981" icon={CheckCircle2} />
                      <StatBox label="В ожидании" value={stats.pending_pods || 0} color="#f59e0b" icon={Clock} />
                      <StatBox label="Сбои" value={stats.failed_pods || 0} color="#ef4444" icon={XCircle} />
                      <StatBox label="Нод" value={stats.total_nodes || 0} color="#8b5cf6" icon={Server} />
                      <StatBox label="Ready ноды" value={stats.ready_nodes || 0} color="#10b981" icon={CheckCircle2} />
                      <StatBox label="Деплойменты" value={stats.total_deployments || 0} color="#38bdf8" icon={Layers} />
                      <StatBox label="Неймспейсы" value={stats.total_namespaces || 0} color="#64748b" icon={Folder} />
                    </div>

                    {/* Filter and Tab bar */}
                    <div
                      style={{
                        background: '#101726',
                        border: '1px solid #1e293b',
                        borderRadius: 8,
                        padding: '10px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 6 }}>
                        {TABS.map((t) => {
                          const Icon = t.icon
                          const isActive = activeTab === t.id
                          return (
                            <button
                              key={t.id}
                              onClick={() => {
                                setActiveTab(t.id)
                                setSearch('')
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 12px',
                                borderRadius: 4,
                                border: isActive ? '1px solid #2563eb' : '1px solid #1e293b',
                                background: isActive ? '#2563eb18' : '#090d16',
                                color: isActive ? '#38bdf8' : '#64748b',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              <Icon size={13} />
                              {t.label} ({t.count})
                            </button>
                          )
                        })}
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {activeTab === 'pods' && allNs.length > 0 && (
                          <select
                            value={nsFilter}
                            onChange={(e) => setNsFilter(e.target.value)}
                            style={{
                              padding: '5px 8px',
                              background: '#090d16',
                              border: '1px solid #1e293b',
                              borderRadius: 4,
                              color: '#f8fafc',
                              fontSize: 12,
                              outline: 'none',
                            }}
                          >
                            <option value="all">Все namespace</option>
                            {allNs.map((ns) => (
                              <option key={ns} value={ns}>{ns}</option>
                            ))}
                          </select>
                        )}

                        <div style={{ position: 'relative', width: 180 }}>
                          <Search size={12} style={{ position: 'absolute', left: 8, top: 8, color: '#64748b' }} />
                          <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Фильтр..."
                            style={{
                              width: '100%',
                              padding: '5px 8px 5px 26px',
                              background: '#090d16',
                              border: '1px solid #1e293b',
                              borderRadius: 4,
                              color: '#f8fafc',
                              fontSize: 12,
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Tab Content */}
                    <div
                      style={{
                        background: '#101726',
                        border: '1px solid #1e293b',
                        borderRadius: 8,
                        overflow: 'hidden',
                      }}
                    >
                      {activeTab === 'pods' && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#090d16', borderBottom: '1px solid #1e293b', color: '#64748b', textAlign: 'left' }}>
                                <th style={thStyle}>Pod</th>
                                <th style={thStyle}>Namespace</th>
                                <th style={thStyle}>Статус</th>
                                <th style={thStyle}>Node</th>
                                <th style={thStyle}>IP</th>
                                <th style={thStyle}>Рестарты</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredPods.length === 0 ? (
                                <tr>
                                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                                    Поды не найдены
                                  </td>
                                </tr>
                              ) : (
                                filteredPods.map((p, i) => (
                                  <tr key={i} style={{ borderBottom: '1px solid #1e293b20' }}>
                                    <td style={{ ...tdStyle, fontWeight: 600, color: '#f8fafc' }}>{p.name}</td>
                                    <td style={tdStyle}><span style={badgeStyle}>{p.namespace}</span></td>
                                    <td style={tdStyle}><StatusBadge status={p.status} /></td>
                                    <td style={{ ...tdStyle, color: '#94a3b8' }}>{p.node || '—'}</td>
                                    <td style={{ ...tdStyle, color: '#94a3b8', fontFeatureSettings: '"tnum"' }}>{p.ip || '—'}</td>
                                    <td style={{ ...tdStyle, color: p.restarts > 0 ? '#f59e0b' : '#64748b', fontFeatureSettings: '"tnum"' }}>
                                      {p.restarts || 0}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {activeTab === 'deployments' && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#090d16', borderBottom: '1px solid #1e293b', color: '#64748b', textAlign: 'left' }}>
                                <th style={thStyle}>Deployment</th>
                                <th style={thStyle}>Namespace</th>
                                <th style={thStyle}>Реплики</th>
                                <th style={thStyle}>Ready</th>
                                <th style={thStyle}>Available</th>
                                <th style={thStyle}>Updated</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredDeployments.length === 0 ? (
                                <tr>
                                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                                    Деплойменты не найдены
                                  </td>
                                </tr>
                              ) : (
                                filteredDeployments.map((d, i) => (
                                  <tr key={i} style={{ borderBottom: '1px solid #1e293b20' }}>
                                    <td style={{ ...tdStyle, fontWeight: 600, color: '#f8fafc' }}>{d.name}</td>
                                    <td style={tdStyle}><span style={badgeStyle}>{d.namespace}</span></td>
                                    <td style={{ ...tdStyle, fontFeatureSettings: '"tnum"' }}>{d.replicas || 0}</td>
                                    <td style={{ ...tdStyle, color: d.ready === d.replicas ? '#10b981' : '#f59e0b', fontFeatureSettings: '"tnum"' }}>
                                      {d.ready || 0} / {d.replicas || 0}
                                    </td>
                                    <td style={{ ...tdStyle, color: '#38bdf8', fontFeatureSettings: '"tnum"' }}>{d.available || 0}</td>
                                    <td style={{ ...tdStyle, color: '#94a3b8', fontFeatureSettings: '"tnum"' }}>{d.updated || 0}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {activeTab === 'nodes' && (
                        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                          {nodes.length === 0 ? (
                            <div style={{ padding: 32, textAlign: 'center', color: '#64748b', width: '100%' }}>
                              Данные нод отсутствуют
                            </div>
                          ) : (
                            nodes.map((n, i) => (
                              <div
                                key={i}
                                style={{
                                  background: '#090d16',
                                  border: '1px solid #1e293b',
                                  borderRadius: 6,
                                  padding: 12,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>{n.name}</span>
                                  <StatusBadge status={n.status} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                                  <div><span style={{ color: '#64748b' }}>CPU:</span> <span style={{ color: '#94a3b8' }}>{n.cpu}</span></div>
                                  <div><span style={{ color: '#64748b' }}>RAM:</span> <span style={{ color: '#94a3b8' }}>{n.memory}</span></div>
                                  <div><span style={{ color: '#64748b' }}>Поды:</span> <span style={{ color: '#94a3b8' }}>{n.pods_capacity}</span></div>
                                  <div><span style={{ color: '#64748b' }}>Runtime:</span> <span style={{ color: '#94a3b8' }}>{n.runtime}</span></div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {activeTab === 'namespaces' && (
                        <div style={{ padding: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {namespaces.length === 0 ? (
                            <div style={{ padding: 32, textAlign: 'center', color: '#64748b', width: '100%' }}>
                              Неймспейсы не обнаружены
                            </div>
                          ) : (
                            namespaces.map((ns, i) => (
                              <div
                                key={i}
                                style={{
                                  padding: '8px 14px',
                                  background: '#090d16',
                                  border: '1px solid #1e293b',
                                  borderRadius: 6,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                }}
                              >
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#f8fafc' }}>{ns.name}</span>
                                <span style={{ fontSize: 10, color: '#10b981', background: '#10b98115', padding: '1px 5px', borderRadius: 3 }}>
                                  {ns.status || 'Active'}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  )
}

const thStyle = { padding: '10px 14px', fontWeight: 600 }
const tdStyle = { padding: '10px 14px' }
const badgeStyle = { padding: '2px 6px', background: '#1e293b', borderRadius: 3, fontSize: 11, color: '#94a3b8' }
const inputStyle = {
  padding: '7px 10px',
  borderRadius: 4,
  border: '1px solid #1e293b',
  background: '#090d16',
  color: '#f8fafc',
  fontSize: 12,
  outline: 'none',
}
