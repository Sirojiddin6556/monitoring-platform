import { useEffect, useState, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import GaugeChart from '../components/GaugeChart'
import Link from 'next/link'
import apiFetch from '../lib/api'
import { toast } from 'sonner'
import { 
  Database, 
  Zap, 
  Archive, 
  RefreshCw, 
  Server, 
  HardDrive, 
  CheckCircle2, 
  Clock, 
  Activity, 
  ShieldCheck, 
  AlertCircle,
  BarChart3,
  Layers,
  ChevronRight
} from 'lucide-react'

function parseNum(val) {
  if (val == null) return null
  const s = String(val).replace(',', '.').trim()
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function isContainerRunning(c) {
  if (!c) return false
  const st = String(c.status || '').toLowerCase()
  const state = String(c.state || '').toLowerCase()
  return st.includes('up') || st.includes('running') || st === 'ok' ||
         state.includes('up') || state.includes('running') || state === 'ok'
}

function StatusBadge({ status }) {
  const s = String(status || '').toLowerCase()
  const isUp = ['ok', 'active', 'running', 'up', 'healthy'].includes(s) || s.includes('running') || s.includes('up')
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 7px',
      borderRadius: 3,
      background: isUp ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
      border: `1px solid ${isUp ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: isUp ? '#10b981' : '#ef4444',
      }}/>
      <span style={{
        fontSize: 10.5,
        color: isUp ? '#34d399' : '#f87171',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        {isUp ? 'ACTIVE' : 'STOPPED'}
      </span>
    </span>
  )
}

function StatCard({ title, value, sub, icon: Icon, color = '#2563eb' }) {
  return (
    <div className="card" style={{ padding: '14px 16px', background: '#101726', border: '1px solid #1e293b' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.1, fontFamily: 'var(--font-mono)' }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ 
          width: 32, 
          height: 32, 
          borderRadius: 4, 
          background: '#162032', 
          border: '1px solid #233148',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: '#94a3b8' 
        }}>
          <Icon size={16} />
        </div>
      </div>
    </div>
  )
}

function getDbType(image = '', name = '') {
  const s = (image + ' ' + name).toLowerCase()
  if (s.includes('postgres') || s.includes('pgsql')) return { type: 'PostgreSQL', color: '#38bdf8' }
  if (s.includes('redis') || s.includes('valkey')) return { type: 'Redis', color: '#fb7185' }
  if (s.includes('mysql')) return { type: 'MySQL', color: '#f59e0b' }
  if (s.includes('mariadb')) return { type: 'MariaDB', color: '#0284c7' }
  if (s.includes('mongo')) return { type: 'MongoDB', color: '#16a34a' }
  if (s.includes('clickhouse')) return { type: 'ClickHouse', color: '#eab308' }
  if (s.includes('elastic') || s.includes('opensearch')) return { type: 'Elasticsearch', color: '#06b6d4' }
  return { type: 'Database', color: '#64748b' }
}

function resolveServerInfo(c, serversList = []) {
  const sid = String(c.server_id || '').trim()
  const sname = String(c.server_name || '').trim()
  
  const matched = serversList.find(s => {
    if (s.id && (s.id === sid || s.id === sname)) return true
    if (s.name && (s.name === sname || s.name === sid)) return true
    if (s.host === '192.168.17.50' && (sname === 'xsilex' || sid === 'xsilex' || sname.includes('monitoring') || sid.includes('monitoring') || sname === '464d713372b7')) return true
    if (s.host === '192.168.17.49' && (sname === 'hrm' || sid === 'hrm' || sname.includes('SSV.HRM'))) return true
    if (s.host === '192.168.17.51' && (sname === 'klaster' || sid === 'klaster')) return true
    return false
  })
  if (matched) {
    return { name: matched.name, host: matched.host, id: matched.id }
  }
  return { name: sname || sid || 'Local host', host: '—', id: sid }
}

export default function Databases() {
  const [databases, setDatabases] = useState([])
  const [telemetry, setTelemetry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const loadData = useCallback(async (isManual = false) => {
    try {
      if (isManual) setLoading(true)

      const [telemetryRes, serversRes, dockerRes] = await Promise.all([
        apiFetch('/api/databases').catch(() => null),
        apiFetch('/api/servers').catch(() => ({ servers: [] })),
        apiFetch('/api/docker/containers').catch(() => ({ containers: [] }))
      ])

      const serversList = serversRes?.servers || []
      const allContainers = dockerRes?.containers || []
      const dbMap = new Map()

      if (telemetryRes) {
        setTelemetry(telemetryRes)
        for (const item of (telemetryRes.databases || [])) {
          const typeInfo = getDbType(item.version || item.type, item.name)
          const key = `${item.host}-${item.port}-${item.name}`
          dbMap.set(key, {
            id: key,
            name: item.name,
            type: item.type,
            color: typeInfo.color,
            serverName: item.server_name || item.host,
            serverHost: item.host,
            serverId: item.server_id || 'Monitoring-platform',
            status: item.status || 'running',
            connections: item.connections,
            size_pretty: item.size_pretty,
            memory_used: item.memory_used,
            cpu_pct: parseNum(item.cpu_pct),
            memory_mb: parseNum(item.memory_mb),
            ports: item.port ? String(item.port) : '—',
            version: item.version,
            source: item.source || 'Engine'
          })
        }
      }

      for (const s of serversList) {
        let detail = null
        try {
          const detRes = await apiFetch(`/api/servers/${s.id}/detail`).catch(() => null)
          detail = detRes?.detail
        } catch(e) {}

        if (detail && detail.databases && Array.isArray(detail.databases)) {
          for (const d of detail.databases) {
            const typeInfo = getDbType(d.type || d.version || '', d.name || '')
            const key = `${s.host || s.id}-${d.name || d.port || 'db'}`
            if (!dbMap.has(key)) {
              dbMap.set(key, {
                id: key,
                name: d.name || `${typeInfo.type} (${s.name || s.id})`,
                type: typeInfo.type,
                color: typeInfo.color,
                serverName: s.name || s.id,
                serverHost: s.host || '—',
                serverId: s.id,
                status: d.status || 'running',
                connections: d.connections ?? d.active_connections ?? null,
                latency_ms: d.latency_ms ?? null,
                cpu_pct: parseNum(d.cpu_percent ?? d.cpu),
                memory_mb: parseNum(d.mem_mb ?? d.memory_mb),
                ports: d.port ? String(d.port) : (typeInfo.type === 'PostgreSQL' ? '5432' : typeInfo.type === 'Redis' ? '6379' : '—'),
                version: d.version || '—',
                source: 'System service',
              })
            }
          }
        }
      }

      for (const c of allContainers) {
        const img = c.image || ''
        const name = c.name || ''
        const low = (img + ' ' + name).toLowerCase()
        const isDb = ['postgres', 'redis', 'mysql', 'mariadb', 'mongo', 'clickhouse', 'timescale', '-db'].some(k => low.includes(k))
        if (isDb) {
          const typeInfo = getDbType(img, name)
          const srv = resolveServerInfo(c, serversList)
          const key = `${srv.host || srv.name}-${name || c.id}`
          if (!dbMap.has(key)) {
            const isUp = isContainerRunning(c)
            dbMap.set(key, {
              id: key,
              name: name || c.id,
              type: typeInfo.type,
              color: typeInfo.color,
              serverName: srv.name,
              serverHost: srv.host,
              serverId: srv.id,
              status: isUp ? 'running' : 'stopped',
              latency_ms: null,
              cpu_pct: parseNum(c.cpu_percent ?? c.cpu),
              memory_mb: parseNum(c.mem_mb ?? c.memory_usage_mb ?? c.mem),
              ports: c.ports || (typeInfo.type === 'PostgreSQL' ? '5432' : typeInfo.type === 'Redis' ? '6379' : '—'),
              image: img || 'docker',
              source: 'Docker container',
            })
          }
        }
      }

      setDatabases(Array.from(dbMap.values()))
      if (isManual) {
        toast.success("Телеметрия баз данных успешно обновлена")
      }
    } catch(e) {
      console.error('Error loading databases:', e)
      if (isManual) toast.error("Ошибка при обновлении телеметрии")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const t = setInterval(loadData, 20000)
    return () => clearInterval(t)
  }, [loadData])

  const filtered = databases.filter(db => {
    if (typeFilter !== 'all' && db.type.toLowerCase() !== typeFilter.toLowerCase()) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (db.name || '').toLowerCase().includes(q) ||
      (db.type || '').toLowerCase().includes(q) ||
      (db.serverName || '').toLowerCase().includes(q) ||
      (db.serverHost || '').toLowerCase().includes(q) ||
      (db.image || '').toLowerCase().includes(q)
    )
  })

  const totalDbs = databases.length
  const runningDbs = databases.filter(d => ['running', 'ok', 'active', 'up', 'healthy'].includes(String(d.status).toLowerCase())).length
  const pgDbs = databases.filter(d => d.type === 'PostgreSQL').length
  const redisDbs = databases.filter(d => d.type === 'Redis').length

  const pgSummary = telemetry?.postgres_summary
  const redisSummary = telemetry?.redis_summary
  const backupSummary = telemetry?.backup_summary

  const availableTypes = ['all', ...new Set(databases.map(d => d.type))]

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <div className="page">
          {/* Strict Enterprise Breadcrumb Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                <span>ИНФРАСТРУКТУРА</span>
                <ChevronRight size={10} />
                <span style={{ color: '#94a3b8' }}>СУБД И ХРАНИЛИЩА</span>
              </div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>
                Базы данных и СУБД
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/executive" className="btn">
                <BarChart3 size={13} style={{ color: '#3b82f6' }} />
                <span>Ситуационный Центр</span>
              </Link>
              <button onClick={() => loadData(true)} className="btn">
                <RefreshCw size={12} className={loading ? 'spin' : ''} />
                <span>Обновить</span>
              </button>
            </div>
          </div>

          {/* Top KPI Cards (Strict Clean Tiles) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
            <StatCard title="Экземпляры СУБД" value={totalDbs} sub="Всего обнаружено" icon={Database} />
            <StatCard title="Активные службы" value={runningDbs} sub={`${runningDbs} из ${totalDbs} в сети`} icon={CheckCircle2} />
            <StatCard
              title="PostgreSQL размер"
              value={pgSummary?.databases?.[0]?.size_pretty || `${pgDbs} узла`}
              sub={pgSummary ? `Соединения: ${pgSummary.active_connections} / ${pgSummary.max_connections}` : 'Основная СУБД'}
              icon={HardDrive}
            />
            <StatCard
              title="Redis память"
              value={redisSummary?.used_memory_human || `${redisDbs} узла`}
              sub={redisSummary ? `${redisSummary.connected_clients} активных сессий` : 'Кэш и очереди'}
              icon={Zap}
            />
          </div>

          {/* DEEP TELEMETRY CARDS (Solid Slate Enterprise Cards) */}
          {telemetry && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: 12,
              marginBottom: 18,
            }}>
              {/* Card 1: PostgreSQL Engine */}
              <div className="card" style={{ padding: '16px 18px', background: '#101726', border: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid #162032', paddingBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Database size={15} style={{ color: '#38bdf8' }} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f1f5f9' }}>PostgreSQL 15 Cluster</div>
                      <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'var(--font-mono)' }}>192.168.17.50:5432</div>
                    </div>
                  </div>
                  <span className="badge badge-success">ONLINE</span>
                </div>

                {pgSummary && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #162032' }}>
                      <GaugeChart 
                        value={pgSummary.total_connections} 
                        max={pgSummary.max_connections} 
                        size={110} 
                        strokeWidth={8} 
                        label="Соединения" 
                        sublabel={`${pgSummary.total_connections}/${pgSummary.max_connections}`} 
                      />
                      <GaugeChart 
                        value={pgSummary.cache_hit_ratio} 
                        max={100} 
                        size={110} 
                        strokeWidth={8} 
                        label="Cache Hit" 
                        color="#10b981" 
                        unit="%" 
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                      {pgSummary.databases?.map((d, idx) => (
                        <div key={idx} style={{ background: '#0a0f1a', border: '1px solid #1e293b', padding: '4px 9px', borderRadius: 4, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#64748b' }}>{d.datname}:</span>
                          <span style={{ color: '#e2e8f0', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{d.size_pretty}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Card 2: Redis Engine */}
              <div className="card" style={{ padding: '16px 18px', background: '#101726', border: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid #162032', paddingBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Zap size={15} style={{ color: '#fb7185' }} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f1f5f9' }}>Redis 7.4 In-Memory</div>
                      <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'var(--font-mono)' }}>192.168.17.50:6379</div>
                    </div>
                  </div>
                  <span className="badge badge-success">ONLINE</span>
                </div>

                {redisSummary && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #162032' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>RAM Память</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>{redisSummary.used_memory_human}</div>
                        <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>Пик: {redisSummary.used_memory_peak_human}</div>
                      </div>
                      <GaugeChart 
                        value={redisSummary.connected_clients} 
                        max={100} 
                        size={110} 
                        strokeWidth={8} 
                        label="Клиенты" 
                        color="#38bdf8" 
                        unit="" 
                      />
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Activity size={12} style={{ color: '#3b82f6' }} />
                      <span>{redisSummary.role || 'Кэш сессий & Брокер Celery'}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Card 3: Backups */}
              <div className="card" style={{ padding: '16px 18px', background: '#101726', border: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid #162032', paddingBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Archive size={15} style={{ color: '#10b981' }} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f1f5f9' }}>Резервное копирование</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>pg_dump • Daily snapshot</div>
                    </div>
                  </div>
                  <span className="badge badge-success">SCHEDULED</span>
                </div>

                {backupSummary && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ background: '#0a0f1a', padding: '9px 12px', borderRadius: 4, border: '1px solid #1e293b' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Свежий архив:</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-mono)' }}>{backupSummary.size_mb ? `${backupSummary.size_mb} MB` : 'Готов'}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 3, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {backupSummary.latest_file || 'monitoring_daily.sql.gz'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
                      <span>Расписание: 03:00 UTC</span>
                      <span>Срок хранения: 14 суток</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Controls: Search & Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <input
                className="input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по имени, хосту, типу..."
              />
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {availableTypes.map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 4,
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: typeFilter === t ? '#2563eb' : '#101726',
                    color: typeFilter === t ? '#fff' : '#94a3b8',
                    border: '1px solid',
                    borderColor: typeFilter === t ? '#1d4ed8' : '#1e293b',
                    transition: 'all 0.1s',
                  }}
                >
                  {t === 'all' ? 'Все СУБД' : t}
                </button>
              ))}
            </div>
          </div>

          {/* Clean Classical Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Экземпляр / Имя</th>
                  <th>Тип</th>
                  <th>Сервер / Хост</th>
                  <th>Порт</th>
                  <th>Статус</th>
                  <th>Объём / Память</th>
                  <th>Источник</th>
                </tr>
              </thead>
              <tbody>
                {loading && databases.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                      Загрузка реестра СУБД...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                      Экземпляров не найдено
                    </td>
                  </tr>
                ) : (
                  filtered.map((d, i) => (
                    <tr key={d.id || i}>
                      <td>
                        <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{d.name}</span>
                      </td>
                      <td>
                        <span className="badge badge-accent">
                          {d.type}
                        </span>
                      </td>
                      <td>
                        <div style={{ color: '#cbd5e1' }}>{d.serverName}</div>
                        <div style={{ fontSize: 10.5, color: '#64748b', fontFamily: 'var(--font-mono)' }}>{d.serverHost}</div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: '#93c5fd' }}>
                        {d.ports}
                      </td>
                      <td>
                        <StatusBadge status={d.status} />
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: '#f1f5f9' }}>
                        {d.size_pretty || d.memory_used || (d.memory_mb ? `${d.memory_mb} MB` : '—')}
                      </td>
                      <td style={{ color: '#64748b', fontSize: 11.5 }}>
                        {d.source}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
