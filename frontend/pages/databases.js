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
  Layers
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
      gap: 6,
      padding: '3px 9px',
      borderRadius: 12,
      background: isUp ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      border: `1px solid ${isUp ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
    }}>
      <span style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: isUp ? '#22c55e' : '#ef4444',
        boxShadow: isUp ? '0 0 6px rgba(34,197,94,0.6)' : 'none',
      }}/>
      <span style={{
        fontSize: 11,
        color: isUp ? '#4ade80' : '#ef4444',
        fontWeight: 600,
      }}>
        {isUp ? 'Работает' : 'Остановлен'}
      </span>
    </span>
  )
}

function StatCard({ title, value, sub, icon: Icon, color = '#6366f1' }) {
  return (
    <div className="card" style={{ padding: '14px 16px', background: '#0a0d1f', border: '1px solid #1a1e38' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: '#8892a8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: '#6272a4', marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ 
          width: 36, 
          height: 36, 
          borderRadius: 8, 
          background: `${color}15`, 
          border: `1px solid ${color}30`,
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color 
        }}>
          <Icon size={18} />
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
  return { type: 'База данных', color: '#6366f1' }
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
  return { name: sname || sid || 'Локальный хост', host: '—', id: sid }
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
            source: item.source || 'Служба СУБД'
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
                source: 'Системный сервис',
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
              source: 'Docker Контейнер',
            })
          }
        }
      }

      setDatabases(Array.from(dbMap.values()))
      if (isManual) {
        toast.success("Данные телеметрии СУБД успешно обновлены")
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
        <div className="page" style={{ maxWidth: '100%', padding: '24px 30px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#e2e4f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Database size={22} style={{ color: '#6366f1' }} />
                Базы данных и СУБД
              </h1>
              <div style={{ fontSize: 12, color: '#8892a8', marginTop: 4 }}>
                Глубокий мониторинг PostgreSQL, кэша Redis, бэкапов и СУБД по всей инфраструктуре
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/executive" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 6,
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.25)',
                color: '#a5b4fc',
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 600,
              }}>
                <BarChart3 size={14} />
                <span>Ситуационный Центр</span>
              </Link>
              <button
                onClick={() => loadData(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 6,
                  background: '#0d0d24',
                  border: '1px solid #1c1c3e',
                  color: '#d6deea',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  transition: 'background 0.15s',
                }}
              >
                <RefreshCw size={13} className={loading ? 'spin' : ''} />
                <span>Обновить</span>
              </button>
            </div>
          </div>

          {/* Top KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard title="Всего СУБД" value={totalDbs} sub="Экземпляров в системе" icon={Database} color="#6366f1" />
            <StatCard title="Активных" value={runningDbs} sub={`${runningDbs} из ${totalDbs} работают`} icon={CheckCircle2} color="#22c55e" />
            <StatCard
              title="PostgreSQL"
              value={pgSummary?.databases?.[0]?.size_pretty || `${pgDbs} кластера`}
              sub={pgSummary ? `Соединений: ${pgSummary.active_connections} / ${pgSummary.max_connections}` : 'Реляционные БД'}
              icon={HardDrive}
              color="#38bdf8"
            />
            <StatCard
              title="Redis In-Memory"
              value={redisSummary?.used_memory_human || `${redisDbs} ноды`}
              sub={redisSummary ? `${redisSummary.connected_clients} клиентов • Порт 6379` : 'Кэш и брокер'}
              icon={Zap}
              color="#fb7185"
            />
          </div>

          {/* DEEP TELEMETRY & GAUGES */}
          {telemetry && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}>
              {/* Card 1: PostgreSQL Deep Engine Stats */}
              <div className="card" style={{ padding: '20px 22px', background: 'linear-gradient(180deg, #0b1120 0%, #070a14 100%)', border: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                      <Database size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>PostgreSQL 15 Cluster</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>192.168.17.50:5432 • Главная СУБД платформы</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
                    ONLINE
                  </span>
                </div>

                {pgSummary && (
                  <div>
                    {/* Gauges row */}
                    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '12px 0 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <GaugeChart 
                        value={pgSummary.total_connections} 
                        max={pgSummary.max_connections} 
                        size={120} 
                        strokeWidth={10} 
                        label="Нагрузка" 
                        sublabel={`${pgSummary.total_connections}/${pgSummary.max_connections} conns`} 
                      />
                      <GaugeChart 
                        value={pgSummary.cache_hit_ratio} 
                        max={100} 
                        size={120} 
                        strokeWidth={10} 
                        label="Cache Hit" 
                        color="#22c55e" 
                        unit="%" 
                      />
                    </div>

                    {/* DB Sizes Pill */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      {pgSummary.databases?.map((d, idx) => (
                        <div key={idx} style={{ background: '#111827', border: '1px solid #1f2937', padding: '6px 12px', borderRadius: 6, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#94a3b8' }}>БД {d.datname}:</span>
                          <span style={{ color: '#38bdf8', fontWeight: 700 }}>{d.size_pretty}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Card 2: Redis In-Memory Engine */}
              <div className="card" style={{ padding: '20px 22px', background: 'linear-gradient(180deg, #190e1c 0%, #0c060e 100%)', border: '1px solid #371828' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(251, 113, 133, 0.12)', border: '1px solid rgba(251, 113, 133, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fb7185' }}>
                      <Zap size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Redis 7.4 In-Memory</div>
                      <div style={{ fontSize: 11, color: '#a1a1aa' }}>192.168.17.50:6379 • Доступен по сети</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
                    ONLINE
                  </span>
                </div>

                {redisSummary && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '12px 0 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Использование RAM</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#fb7185' }}>{redisSummary.used_memory_human}</div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Пик: {redisSummary.used_memory_peak_human}</div>
                      </div>
                      <GaugeChart 
                        value={redisSummary.connected_clients} 
                        max={100} 
                        size={120} 
                        strokeWidth={10} 
                        label="Клиенты" 
                        color="#38bdf8" 
                        unit="" 
                      />
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Activity size={13} style={{ color: '#fb7185' }} />
                      <span>{redisSummary.role || 'Кэш сессий & Брокер Celery'}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Card 3: Automated Backups & Disaster Recovery */}
              <div className="card" style={{ padding: '20px 22px', background: 'linear-gradient(180deg, #0d1a16 0%, #060e0c 100%)', border: '1px solid #143828' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ade80' }}>
                      <Archive size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Резервные копии (Бэкапы)</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>pg_dump | gzip -9 • Cron 03:00</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
                    АКТИВЕН
                  </span>
                </div>

                {backupSummary && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>Свежий дамп:</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>{backupSummary.size_mb ? `${backupSummary.size_mb} MB` : 'Готов'}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {backupSummary.latest_file || 'monitoring_daily.sql.gz'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#8892a8', padding: '0 4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} style={{ color: '#6366f1' }} />
                        03:00 Ежедневно
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ShieldCheck size={12} style={{ color: '#22c55e' }} />
                        Хранение 14 дней
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Controls: Search & Type filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по имени, хосту, типу, контейнеру..."
                style={{
                  width: '100%',
                  padding: '8px 14px',
                  background: '#07071a',
                  border: '1px solid #1c1c3e',
                  borderRadius: 6,
                  color: '#e2e4f0',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {availableTypes.map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: typeFilter === t ? '#6366f1' : '#07071a',
                    color: typeFilter === t ? '#fff' : '#8892a8',
                    border: '1px solid',
                    borderColor: typeFilter === t ? '#6366f1' : '#1c1c3e',
                    transition: 'all 0.15s',
                  }}
                >
                  {t === 'all' ? 'Все СУБД' : t}
                </button>
              ))}
            </div>
          </div>

          {/* Databases Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', background: '#07071a', border: '1px solid #1c1c3e' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1c1c3e', color: '#6272a4', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, background: 'rgba(255,255,255,0.01)' }}>
                  <th style={{ padding: '12px 16px' }}>Экземпляр / База</th>
                  <th style={{ padding: '12px 16px' }}>Тип</th>
                  <th style={{ padding: '12px 16px' }}>Сервер / Хост</th>
                  <th style={{ padding: '12px 16px' }}>Порт</th>
                  <th style={{ padding: '12px 16px' }}>Статус</th>
                  <th style={{ padding: '12px 16px' }}>Размер / Память</th>
                  <th style={{ padding: '12px 16px' }}>Источник</th>
                </tr>
              </thead>
              <tbody>
                {loading && databases.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#6272a4' }}>
                      Загрузка телеметрии баз данных...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#6272a4' }}>
                      Баз данных не найдено
                    </td>
                  </tr>
                ) : (
                  filtered.map((d, i) => (
                    <tr 
                      key={d.id || i}
                      style={{ 
                        borderBottom: '1px solid #121228',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color || '#6366f1' }} />
                          <span style={{ fontWeight: 600, color: '#e2e4f0' }}>{d.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: `${d.color || '#6366f1'}15`,
                          color: d.color || '#6366f1',
                          border: `1px solid ${d.color || '#6366f1'}30`,
                        }}>
                          {d.type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#c4cfe0' }}>
                        <div>{d.serverName}</div>
                        <div style={{ fontSize: 11, color: '#6272a4' }}>{d.serverHost}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#818cf8' }}>
                        {d.ports}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge status={d.status} />
                      </td>
                      <td style={{ padding: '12px 16px', color: '#e2e4f0' }}>
                        {d.size_pretty || d.memory_used || (d.memory_mb ? `${d.memory_mb} MB` : '—')}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#6272a4', fontSize: 12 }}>
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
