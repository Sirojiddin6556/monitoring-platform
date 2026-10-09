import {useEffect, useState, useCallback} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import Link from 'next/link'
import apiFetch from '../lib/api'

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

function StatusBadge({status}){
  const s = String(status || '').toLowerCase()
  const isUp = ['ok', 'active', 'running', 'up', 'healthy'].includes(s) || s.includes('running') || s.includes('up')
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 9px',
      borderRadius: 12,
      background: isUp ? 'rgba(74,222,128,0.12)' : 'rgba(239,68,68,0.12)',
      border: `1px solid ${isUp ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
    }}>
      <span style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: isUp ? '#4ade80' : '#ef4444',
        boxShadow: isUp ? '0 0 6px rgba(74,222,128,0.6)' : 'none',
      }}/>
      <span style={{
        fontSize: 11,
        color: isUp ? '#4ade80' : '#ef4444',
        fontWeight: 600,
        textTransform: 'capitalize',
      }}>
        {isUp ? 'Работает' : 'Остановлен'}
      </span>
    </span>
  )
}

function StatCard({title, value, sub, icon, color='#6366f1'}) {
  return (
    <div className="card" style={{padding:'14px 16px',background:'#07111e',border:'1px solid #1a2940'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontSize:11,color:'#9aa4b2',textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}}>{title}</div>
          <div style={{fontSize:24,fontWeight:700,color,lineHeight:1.1}}>{value}</div>
          {sub && <div style={{fontSize:11,color:'#64748b',marginTop:4}}>{sub}</div>}
        </div>
        <div style={{fontSize:22,opacity:0.85}}>{icon}</div>
      </div>
    </div>
  )
}

function getDbType(image = '', name = '') {
  const s = (image + ' ' + name).toLowerCase()
  if (s.includes('postgres') || s.includes('pgsql')) return { type: 'PostgreSQL', icon: '🐘', color: '#336791' }
  if (s.includes('redis') || s.includes('valkey')) return { type: 'Redis', icon: '⚡', color: '#e11d48' }
  if (s.includes('mysql')) return { type: 'MySQL', icon: '🐬', color: '#f59e0b' }
  if (s.includes('mariadb')) return { type: 'MariaDB', icon: '🦭', color: '#0284c7' }
  if (s.includes('mongo')) return { type: 'MongoDB', icon: '🍃', color: '#16a34a' }
  if (s.includes('clickhouse')) return { type: 'ClickHouse', icon: '🟡', color: '#eab308' }
  if (s.includes('elastic') || s.includes('opensearch')) return { type: 'Elasticsearch', icon: '🔍', color: '#06b6d4' }
  return { type: 'База данных', icon: '🗄️', color: '#6366f1' }
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

  const loadData = useCallback(async () => {
    try {
      // 1. Fetch servers, all docker containers, and deep DB telemetry in parallel
      const [serversRes, dockerRes, dbRes] = await Promise.all([
        apiFetch('/api/servers').catch(() => ({ servers: [] })),
        apiFetch('/api/docker/containers').catch(() => ({ containers: [] })),
        apiFetch('/api/databases').catch(() => null),
      ])

      const serversList = Array.isArray(serversRes) ? serversRes : (serversRes?.servers || [])
      const allContainers = dockerRes?.containers || []
      if (dbRes) setTelemetry(dbRes)

      const dbMap = new Map()

      // 2. Add rich databases from telemetry endpoint
      if (dbRes && Array.isArray(dbRes.databases)) {
        for (const item of dbRes.databases) {
          const typeInfo = getDbType(item.version || '', item.type || item.name)
          const key = `${item.host || item.server_id}-${item.name}`
          dbMap.set(key, {
            id: key,
            name: item.name,
            type: item.type || typeInfo.type,
            icon: typeInfo.icon,
            color: typeInfo.color,
            serverName: item.server_name || 'Monitoring-platform',
            serverHost: item.host || '192.168.17.50',
            serverId: item.server_id || 'Monitoring-platform',
            status: item.status || 'running',
            latency_ms: null,
            cpu_pct: parseNum(item.cpu_pct),
            memory_mb: parseNum(item.memory_mb),
            size_pretty: item.size_pretty,
            memory_used: item.memory_used,
            connections: item.connections,
            clients: item.clients,
            ports: item.port ? String(item.port) : (typeInfo.type === 'PostgreSQL' ? '5432' : '6379'),
            image: item.version || 'Engine Service',
            source: item.source || 'Ядро СУБД',
          })
        }
      }

      // 3. Process direct databases from agent detail
      const details = await Promise.all(
        serversList.map(async (s) => {
          try {
            const res = await apiFetch(`/api/servers/${s.id}/detail`)
            return { server: s, detail: res?.detail || {} }
          } catch {
            return { server: s, detail: {} }
          }
        })
      )

      for (const item of details) {
        const s = item.server
        const agentDbs = item.detail.databases || []
        for (const db of agentDbs) {
          const typeInfo = getDbType('', db.type || db.name)
          const key = `${s.host || s.id}-${db.name}`
          if (!dbMap.has(key)) {
            dbMap.set(key, {
              id: key,
              name: db.name,
              type: db.type || typeInfo.type,
              icon: typeInfo.icon,
              color: typeInfo.color,
              serverName: s.name || s.id,
              serverHost: s.host || '—',
              serverId: s.id,
              status: db.status || (s.status === 'ok' ? 'running' : 'down'),
              latency_ms: parseNum(db.latency_ms),
              cpu_pct: parseNum(db.cpu),
              memory_mb: parseNum(db.memory_mb),
              ports: db.port ? String(db.port) : (typeInfo.type === 'PostgreSQL' ? '5432' : typeInfo.type === 'Redis' ? '6379' : '—'),
              image: db.version || 'Agent Probe',
              source: 'Проба агента',
            })
          }
        }

        // Also check docker containers inside detail
        const srvContainers = item.detail.docker_containers || []
        for (const c of srvContainers) {
          const img = c.image || ''
          const name = c.name || ''
          const low = (img + ' ' + name).toLowerCase()
          const isDb = ['postgres', 'redis', 'mysql', 'mariadb', 'mongo', 'clickhouse', 'timescale', '-db'].some(k => low.includes(k))
          if (isDb) {
            const typeInfo = getDbType(img, name)
            const key = `${s.host || s.id}-${name || c.id}`
            if (!dbMap.has(key)) {
              const isUp = isContainerRunning(c)
              dbMap.set(key, {
                id: key,
                name: name || c.id,
                type: typeInfo.type,
                icon: typeInfo.icon,
                color: typeInfo.color,
                serverName: s.name || s.id,
                serverHost: s.host || '—',
                serverId: s.id,
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
      }

      // 4. Process global docker containers from /api/docker/containers
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
              icon: typeInfo.icon,
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
    } catch(e) {
      console.error('Error loading databases:', e)
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
        <div className="page" style={{maxWidth:'100%'}}>
          {/* Header */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,flexWrap:'wrap',gap:12}}>
            <div>
              <h1 style={{margin:0,fontSize:22}}>Базы данных и СУБД</h1>
              <div style={{fontSize:12,color:'#9aa4b2',marginTop:4}}>
                Глубокий мониторинг PostgreSQL, кэша Redis, бэкапов и СУБД по всей инфраструктуре
              </div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <Link href="/executive" style={{
                display:'inline-flex',
                alignItems:'center',
                gap:6,
                padding:'6px 12px',
                borderRadius:6,
                background:'rgba(99,102,241,0.15)',
                border:'1px solid rgba(99,102,241,0.3)',
                color:'#a5b4fc',
                textDecoration:'none',
                fontSize:12,
                fontWeight:600,
              }}>
                <span>📊</span>
                <span>Ситуационный Центр</span>
              </Link>
              <button
                onClick={loadData}
                style={{
                  display:'inline-flex',
                  alignItems:'center',
                  gap:6,
                  padding:'6px 12px',
                  borderRadius:6,
                  background:'#07111e',
                  border:'1px solid #1a2940',
                  color:'#d6deea',
                  cursor:'pointer',
                  fontSize:12,
                }}
              >
                <span>↻</span>
                <span>Обновить</span>
              </button>
            </div>
          </div>

          {/* Top KPI Cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:20}}>
            <StatCard title="Всего СУБД" value={totalDbs} sub="Экземпляров в системе" icon="🗄️" color="#6366f1"/>
            <StatCard title="Активных" value={runningDbs} sub={`${runningDbs} из ${totalDbs} работают`} icon="🟢" color="#4ade80"/>
            <StatCard
              title="PostgreSQL"
              value={pgSummary?.databases?.[0]?.size_pretty || `${pgDbs} кластера`}
              sub={pgSummary ? `Соединений: ${pgSummary.active_connections}/${pgSummary.max_connections}` : 'Реляционные БД'}
              icon="🐘"
              color="#38bdf8"
            />
            <StatCard
              title="Redis In-Memory"
              value={redisSummary?.used_memory_human || `${redisDbs} ноды`}
              sub={redisSummary ? `${redisSummary.connected_clients} клиентов • Порт 6379` : 'Кэш и брокер'}
              icon="⚡"
              color="#fb7185"
            />
          </div>

          {/* DEEP TELEMETRY & BACKUP DASHBOARD */}
          {telemetry && (
            <div style={{
              display:'grid',
              gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))',
              gap:14,
              marginBottom:20,
            }}>
              {/* Card 1: PostgreSQL Deep Engine Stats */}
              <div className="card" style={{padding:'16px 18px',background:'linear-gradient(180deg, #0a1122 0%, #060b16 100%)',border:'1px solid #1a2940'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:20}}>🐘</span>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:'#fff'}}>PostgreSQL 15 Cluster</div>
                      <div style={{fontSize:11,color:'#64748b'}}>192.168.17.50:5432 • Главная база</div>
                    </div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:6,background:'rgba(34,197,94,0.15)',color:'#4ade80',border:'1px solid rgba(34,197,94,0.3)'}}>
                    ONLINE
                  </span>
                </div>

                {pgSummary && (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {/* Connections meter */}
                    <div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#94a3b8',marginBottom:4}}>
                        <span>Активные подключения:</span>
                        <span style={{color:'#e2e8f0',fontWeight:700}}>{pgSummary.total_connections} из {pgSummary.max_connections} (Загрузка: {pgSummary.connection_load_pct}%)</span>
                      </div>
                      <div style={{height:6,background:'#121e33',borderRadius:3,overflow:'hidden'}}>
                        <div style={{width:`${Math.min(100, Math.max(2, pgSummary.connection_load_pct))}%`,height:'100%',background:pgSummary.connection_load_pct>80?'#ef4444':pgSummary.connection_load_pct>50?'#f59e0b':'#38bdf8'}}/>
                      </div>
                    </div>

                    {/* Cache Hit Ratio */}
                    <div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#94a3b8',marginBottom:4}}>
                        <span>Эффективность кэша памяти (Cache Hit):</span>
                        <span style={{color:pgSummary.cache_hit_ratio>=90?'#4ade80':'#facc15',fontWeight:700}}>{pgSummary.cache_hit_ratio}%</span>
                      </div>
                      <div style={{height:6,background:'#121e33',borderRadius:3,overflow:'hidden'}}>
                        <div style={{width:`${pgSummary.cache_hit_ratio}%`,height:'100%',background:'#22c55e'}}/>
                      </div>
                    </div>

                    {/* DB Sizes Pill */}
                    <div style={{display:'flex',gap:8,marginTop:4,flexWrap:'wrap'}}>
                      {pgSummary.databases?.map((d, idx) => (
                        <div key={idx} style={{background:'#101d36',padding:'5px 10px',borderRadius:6,fontSize:11,display:'flex',alignItems:'center',gap:6}}>
                          <span style={{color:'#64748b'}}>БД {d.datname}:</span>
                          <span style={{color:'#38bdf8',fontWeight:700}}>{d.size_pretty}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Card 2: Redis In-Memory Engine */}
              <div className="card" style={{padding:'16px 18px',background:'linear-gradient(180deg, #180d1a 0%, #0c060e 100%)',border:'1px solid #3b1828'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:20}}>⚡</span>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:'#fff'}}>Redis 7.4 In-Memory</div>
                      <div style={{fontSize:11,color:'#a1a1aa'}}>192.168.17.50:6379 • Доступен по сети</div>
                    </div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:6,background:'rgba(34,197,94,0.15)',color:'#4ade80',border:'1px solid rgba(34,197,94,0.3)'}}>
                    ONLINE
                  </span>
                </div>

                {redisSummary && (
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <div style={{background:'rgba(255,255,255,0.03)',padding:'8px 10px',borderRadius:6}}>
                        <div style={{fontSize:10,color:'#94a3b8'}}>Использование RAM:</div>
                        <div style={{fontSize:16,fontWeight:700,color:'#fb7185',marginTop:2}}>{redisSummary.used_memory_human}</div>
                      </div>
                      <div style={{background:'rgba(255,255,255,0.03)',padding:'8px 10px',borderRadius:6}}>
                        <div style={{fontSize:10,color:'#94a3b8'}}>Активных клиентов:</div>
                        <div style={{fontSize:16,fontWeight:700,color:'#38bdf8',marginTop:2}}>{redisSummary.connected_clients} соед.</div>
                      </div>
                    </div>
                    <div style={{fontSize:11,color:'#71717a',marginTop:2}}>
                      Назначение: {redisSummary.role || 'Кэш сессий & Брокер Celery'}
                    </div>
                  </div>
                )}
              </div>

              {/* Card 3: Automated Backups & Disaster Recovery */}
              <div className="card" style={{padding:'16px 18px',background:'linear-gradient(180deg, #0d1a16 0%, #060e0c 100%)',border:'1px solid #143828'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:20}}>🗄️</span>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:'#fff'}}>Резервное копирование (Бэкапы)</div>
                      <div style={{fontSize:11,color:'#64748b'}}>pg_dump | gzip -9 • Cron 03:00</div>
                    </div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:6,background:'rgba(34,197,94,0.15)',color:'#4ade80',border:'1px solid rgba(34,197,94,0.3)'}}>
                    АКТИВЕН
                  </span>
                </div>

                {backupSummary && (
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    <div style={{background:'rgba(255,255,255,0.03)',padding:'8px 10px',borderRadius:6}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span style={{fontSize:11,color:'#94a3b8'}}>Свежий бэкап:</span>
                        <span style={{fontSize:12,fontWeight:700,color:'#4ade80'}}>{backupSummary.size_mb ? `${backupSummary.size_mb} MB` : 'Готов'}</span>
                      </div>
                      <div style={{fontSize:10.5,color:'#64748b',marginTop:2,fontFamily:'monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {backupSummary.latest_file || 'monitoring_daily.sql.gz'}
                      </div>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#64748b'}}>
                      <span>Расписание: 03:00 ночи</span>
                      <span>Ротация: 14 дней</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Controls: Search & Type filters */}
          <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{flex:1,minWidth:260}}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Поиск баз данных по имени, СУБД, серверу или образу..."
                style={{
                  width:'100%',
                  padding:'10px 14px',
                  borderRadius:8,
                  border:'1px solid #1a2940',
                  background:'#07111e',
                  color:'#fff',
                  fontSize:13,
                  outline:'none',
                  boxSizing:'border-box',
                }}
              />
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {availableTypes.map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  style={{
                    padding:'6px 12px',
                    borderRadius:6,
                    border:'none',
                    cursor:'pointer',
                    fontSize:12,
                    fontWeight:600,
                    background: typeFilter === t ? '#6366f1' : '#07111e',
                    color: typeFilter === t ? '#fff' : '#9aa4b2',
                    transition:'all 0.15s',
                  }}
                >
                  {t === 'all' ? 'Все СУБД' : t}
                </button>
              ))}
            </div>
          </div>

          {/* Databases Table */}
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            {loading && databases.length === 0 ? (
              <div style={{color:'#9aa4b2',padding:40,textAlign:'center'}}>
                <div style={{fontSize:28,marginBottom:8}}>⏳</div>
                <div>Загрузка баз данных...</div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{color:'#9aa4b2',padding:40,textAlign:'center'}}>
                <div style={{fontSize:28,marginBottom:8}}>🔍</div>
                <div>СУБД не найдены по заданным критериям</div>
              </div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,textAlign:'left'}}>
                  <thead>
                    <tr style={{background:'#07111e',borderBottom:'1px solid #1a2940',color:'#9aa4b2'}}>
                      <th style={{padding:'12px 16px',fontWeight:600}}>База данных / Сервис</th>
                      <th style={{padding:'12px 16px',fontWeight:600}}>Тип СУБД</th>
                      <th style={{padding:'12px 16px',fontWeight:600}}>Сервер размещения</th>
                      <th style={{padding:'12px 16px',fontWeight:600}}>Статус</th>
                      <th style={{padding:'12px 16px',fontWeight:600}}>Объём данных / RAM</th>
                      <th style={{padding:'12px 16px',fontWeight:600}}>Порт / Образ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((db, i) => (
                      <tr key={db.id || i} style={{borderBottom:'1px solid rgba(26,41,64,0.4)',transition:'background 0.12s'}}>
                        <td style={{padding:'12px 16px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <span style={{fontSize:20}}>{db.icon}</span>
                            <div>
                              <div style={{fontWeight:600,color:'#fff',fontSize:13}}>{db.name}</div>
                              <div style={{fontSize:11,color:'#64748b',marginTop:2}}>{db.source}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'12px 16px'}}>
                          <span style={{
                            display:'inline-flex',
                            alignItems:'center',
                            gap:5,
                            padding:'3px 9px',
                            borderRadius:6,
                            background:`${db.color}20`,
                            color:db.color === '#dc2626' || db.color === '#e11d48' ? '#fb7185' : db.color === '#336791' ? '#38bdf8' : '#a5b4fc',
                            border:`1px solid ${db.color}40`,
                            fontSize:11,
                            fontWeight:600,
                          }}>
                            {db.type}
                          </span>
                        </td>
                        <td style={{padding:'12px 16px'}}>
                          {db.serverId ? (
                            <Link href="/servers" style={{textDecoration:'none'}}>
                              <div style={{color:'#818cf8',fontWeight:600,fontSize:13}}>{db.serverName}</div>
                              <div style={{fontSize:11,color:'#64748b',marginTop:1}}>{db.serverHost}</div>
                            </Link>
                          ) : (
                            <div>
                              <div style={{color:'#e2e8f0',fontWeight:600,fontSize:13}}>{db.serverName}</div>
                              <div style={{fontSize:11,color:'#64748b',marginTop:1}}>{db.serverHost}</div>
                            </div>
                          )}
                        </td>
                        <td style={{padding:'12px 16px'}}>
                          <StatusBadge status={db.status} />
                        </td>
                        <td style={{padding:'12px 16px'}}>
                          <div style={{display:'flex',flexDirection:'column',gap:4}}>
                            {db.size_pretty ? (
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <span style={{fontSize:11,color:'#9aa4b2',minWidth:36}}>Размер:</span>
                                <span style={{fontSize:12,fontWeight:700,color:'#38bdf8'}}>
                                  {db.size_pretty}
                                </span>
                              </div>
                            ) : db.memory_used ? (
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <span style={{fontSize:11,color:'#9aa4b2',minWidth:36}}>RAM:</span>
                                <span style={{fontSize:12,fontWeight:700,color:'#fb7185'}}>
                                  {db.memory_used}
                                </span>
                              </div>
                            ) : (
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <span style={{fontSize:11,color:'#9aa4b2',minWidth:36}}>RAM:</span>
                                <span style={{fontSize:12,fontWeight:600,color:'#e2e8f0'}}>
                                  {db.memory_mb != null ? `${db.memory_mb.toFixed(1)} MB` : '—'}
                                </span>
                              </div>
                            )}

                            {db.connections != null && (
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <span style={{fontSize:11,color:'#9aa4b2',minWidth:36}}>Соед:</span>
                                <span style={{fontSize:11,color:'#4ade80',fontWeight:600}}>
                                  {db.connections} акт.
                                </span>
                              </div>
                            )}

                            {db.clients != null && (
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <span style={{fontSize:11,color:'#9aa4b2',minWidth:36}}>Клиенты:</span>
                                <span style={{fontSize:11,color:'#38bdf8',fontWeight:600}}>
                                  {db.clients} соед.
                                </span>
                              </div>
                            )}

                            {db.cpu_pct != null && (
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <span style={{fontSize:11,color:'#9aa4b2',minWidth:36}}>CPU:</span>
                                <span style={{
                                  fontSize:11,
                                  fontWeight:600,
                                  color: db.cpu_pct > 50 ? '#facc15' : db.cpu_pct > 80 ? '#ef4444' : '#4ade80',
                                }}>
                                  {db.cpu_pct.toFixed(1)}%
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{padding:'12px 16px'}}>
                          <div style={{display:'flex',flexDirection:'column',gap:2}}>
                            <div style={{fontFamily:'monospace',fontSize:12,color:'#38bdf8'}}>{db.ports}</div>
                            <div style={{fontFamily:'monospace',fontSize:10.5,color:'#64748b',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={db.image}>
                              {db.image}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
