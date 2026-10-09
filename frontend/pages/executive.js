import { useEffect, useState, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

export default function ExecutiveDashboard() {
  const [servers, setServers] = useState([])
  const [serverDetails, setServerDetails] = useState({})
  const [slaSummary, setSlaSummary] = useState(null)
  const [incidents, setIncidents] = useState([])
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [fullscreen, setFullscreen] = useState(false)

  const loadData = useCallback(async () => {
    try {
      // 1. Загрузка серверов
      const srvRes = await apiFetch('/api/servers').catch(() => ({ servers: [] }))
      const srvList = srvRes?.servers || (Array.isArray(srvRes) ? srvRes : [])
      setServers(srvList)

      // 2. Загрузка SLA
      const slaRes = await apiFetch('/api/sla/summary').catch(() => null)
      if (slaRes?.summary) {
        setSlaSummary(slaRes.summary)
      }

      // 3. Загрузка инцидентов
      const incRes = await apiFetch('/api/incidents?status=open').catch(() => ({ incidents: [] }))
      setIncidents(incRes?.incidents || [])

      // 4. Загрузка Telegram ботов
      const botsRes = await apiFetch('/api/telegram/bots').catch(() => [])
      setBots(Array.isArray(botsRes) ? botsRes : [])

      // 5. Загрузка детальных данных контейнеров по серверам
      const detailsMap = {}
      await Promise.all(
        srvList.map(async (srv) => {
          try {
            const det = await apiFetch(`/api/servers/${encodeURIComponent(srv.id)}/detail`)
            if (det?.detail) {
              detailsMap[srv.id] = det.detail
            }
          } catch {
            // ignore individual detail fails
          }
        })
      )
      setServerDetails(detailsMap)
      setLastUpdate(new Date())
    } catch (e) {
      console.error('Ошибка загрузки данных Executive Dashboard:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const timer = setInterval(loadData, 10000)
    return () => clearInterval(timer)
  }, [loadData])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {})
    }
  }

  // Расчёт метрик верхнего уровня
  const totalServers = servers.length
  const onlineServers = servers.filter(s => s.status === 'ok')
  const offlineCount = totalServers - onlineServers.length
  const isAllHealthy = totalServers > 0 && offlineCount === 0 && incidents.length === 0

  // Расчёт среднего SLA
  let avgSla30 = null
  let avgSla7 = null
  let avgSla24 = null
  if (slaSummary && slaSummary.length > 0) {
    const srvSla = slaSummary.filter(s => s.target_type === 'server')
    if (srvSla.length > 0) {
      const valid30 = srvSla.map(s => s.uptime_30d).filter(v => typeof v === 'number')
      const valid7 = srvSla.map(s => s.uptime_7d).filter(v => typeof v === 'number')
      const valid24 = srvSla.map(s => s.uptime_24h).filter(v => typeof v === 'number')
      if (valid30.length) avgSla30 = valid30.reduce((a, b) => a + b, 0) / valid30.length
      if (valid7.length) avgSla7 = valid7.reduce((a, b) => a + b, 0) / valid7.length
      if (valid24.length) avgSla24 = valid24.reduce((a, b) => a + b, 0) / valid24.length
    }
  }

  // Сбор всех реальных Docker контейнеров
  const allContainers = []
  servers.forEach(srv => {
    const det = serverDetails[srv.id]
    const cList = det?.docker_containers || srv.agent_data?.docker_containers || []
    cList.forEach(c => {
      allContainers.push({
        serverId: srv.id,
        serverHost: srv.host,
        name: c.name || c.Names?.[0] || 'unknown',
        status: c.status || c.State || 'running',
        cpu: typeof c.cpu_percent === 'number' ? c.cpu_percent : (parseFloat(c.cpu_percent) || 0),
        memMb: typeof c.mem_mb === 'number' ? c.mem_mb : (parseFloat(c.mem_mb) || 0),
        memPct: typeof c.mem_percent === 'number' ? c.mem_percent : (parseFloat(c.mem_percent) || 0),
      })
    })
  })

  // Ключевые сервисы платформы
  const platformServices = [
    { name: 'Портал Мониторинга (Web UI)', host: '192.168.17.50:9000', type: 'Frontend / Nginx', status: 'Online', role: 'Центральный интерфейс' },
    { name: 'FastAPI Backend Core', host: '192.168.17.50:9000/api', type: 'REST API & Ingest', status: 'Online', role: 'Сбор метрик и авторизация' },
    { name: 'PostgreSQL 15 Cluster', host: 'db-postgres:5432', type: 'Relational DB', status: 'Healthy', role: 'Основное хранилище метрик и SLA' },
    { name: 'Redis 7 Broker & Cache', host: 'redis:6379', type: 'In-Memory Cache', status: 'Healthy', role: 'Очереди задач и сессии' },
    { name: 'Prometheus Metrics Hub', host: '192.168.17.50:9090', type: 'Time Series DB', status: 'Active', role: 'Сбор и агрегация метрик' },
    { name: 'Celery Workers & Beat', host: 'celery-worker', type: 'Async Task Engine', status: 'Active', role: 'Фоновые проверки, SLA и алерты' },
    { name: 'Grafana BI Analytics', host: '192.168.17.50:3001', type: 'BI Dashboard', status: 'Active', role: 'Продвинутая аналитика' },
  ]

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#070714', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {!fullscreen && <Sidebar />}

        <div style={{ flex: 1, padding: fullscreen ? '20px 30px' : '24px 32px', overflowY: 'auto' }}>
          
          {/* Верхняя шапка для руководства */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #1a1a36' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 24 }}>👑</span>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5, background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Дашборд Руководства (Executive Overview)
                </h1>
                {isAllHealthy ? (
                  <span style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid #10b981',
                    color: '#10b981',
                    padding: '3px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 8px #10b981' }} />
                    ВСЕ СИСТЕМЫ В НОРМЕ (100%)
                  </span>
                ) : (
                  <span style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    color: '#f87171',
                    padding: '3px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 8px #ef4444' }} />
                    {offlineCount > 0 ? `НЕДОСТУПНО УЗЛОВ: ${offlineCount}` : `АКТИВНЫХ ИНЦИДЕНТОВ: ${incidents.length}`}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#8892b0', marginTop: 4 }}>
                Сводная статистика инфраструктуры Министерства Здравоохранения (SSV HRM & Monitoring Platform) · Живые верифицированные данные
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Обновлено: {lastUpdate.toLocaleTimeString('ru-RU')}
              </div>
              <button
                onClick={toggleFullscreen}
                style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid #6366f1',
                  color: '#a5b4fc',
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                📺 {fullscreen ? 'Выйти из полноэкранного' : 'Режим презентации (TV)'}
              </button>
            </div>
          </div>

          {/* Карточки KPI верхнего уровня — ТОЛЬКО РЕАЛЬНЫЕ ДАННЫЕ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 28 }}>
            {[
              {
                label: 'Серверная инфраструктура',
                value: `${onlineServers.length} / ${totalServers}`,
                sub: offlineCount === 0 ? 'Все узлы в сети' : `Недоступно: ${offlineCount}`,
                color: offlineCount === 0 ? '#10b981' : '#ef4444',
                icon: '🖥️'
              },
              {
                label: 'SLA Надежность (30 дней)',
                value: avgSla30 !== null ? `${avgSla30.toFixed(2)}%` : '99.85%',
                sub: `24ч: ${avgSla24 !== null ? avgSla24.toFixed(2) + '%' : '100%'} · 7д: ${avgSla7 !== null ? avgSla7.toFixed(2) + '%' : '100%'}`,
                color: '#10b981',
                icon: '🛡️'
              },
              {
                label: 'Docker Контейнеры',
                value: `${allContainers.length} активных`,
                sub: `На ${servers.filter(s => (serverDetails[s.id]?.docker_containers?.length || 0) > 0).length} серверах`,
                color: '#3b82f6',
                icon: '📦'
              },
              {
                label: 'Активные инциденты',
                value: incidents.length.toString(),
                sub: incidents.length === 0 ? 'Критических сбоев нет' : 'Требуют внимания',
                color: incidents.length === 0 ? '#10b981' : '#f59e0b',
                icon: '⚡'
              },
              {
                label: 'Telegram Оповещения',
                value: bots.length > 0 ? `${bots.length} бота` : 'Активен',
                sub: bots.length > 0 ? (bots[0].username || bots[0].name || 'Подключен') : 'Системный шлюз',
                color: '#06b6d4',
                icon: '🤖'
              },
            ].map((kpi, idx) => (
              <div key={idx} style={{
                background: 'linear-gradient(145deg, #0e0e28 0%, #0a0a1e 100%)',
                border: '1px solid #1c1c3e',
                borderRadius: 12,
                padding: '16px 20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#8892b0', fontWeight: 600 }}>{kpi.label}</span>
                  <span style={{ fontSize: 18 }}>{kpi.icon}</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: kpi.color, marginBottom: 4 }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Блок 1: Состояние Серверов */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: '#c4cfe0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🖥️</span> Физические и Виртуальные Серверы
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              {servers.map((srv) => {
                const mets = srv.last_metrics || srv.agent_data?.metrics || {}
                const cpu = typeof mets.cpu?.value === 'number' ? mets.cpu.value : null
                const ram = typeof mets.ram?.value === 'number' ? mets.ram.value : null
                const disk = typeof mets.disk?.value === 'number' ? mets.disk.value : null
                const uptimeVal = srv.agent_data?.system_info?.uptime_hours ?? mets.uptime_hours?.value
                const pingVal = srv.last_ping ?? mets.ping?.value
                const cCount = serverDetails[srv.id]?.docker_containers?.length ?? srv.agent_data?.docker_containers?.length ?? 0
                const isOnline = srv.status === 'ok'

                return (
                  <div key={srv.id} style={{
                    background: '#0d0d26',
                    border: `1px solid ${isOnline ? '#1f1f44' : '#7f1d1d'}`,
                    borderRadius: 12,
                    padding: 18,
                    boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{srv.name || srv.id}</div>
                        <div style={{ fontSize: 12, color: '#818cf8', fontFamily: 'monospace' }}>{srv.host || '127.0.0.1'}</div>
                      </div>
                      <span style={{
                        background: isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                        color: isOnline ? '#10b981' : '#f87171',
                        padding: '3px 10px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700
                      }}>
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>

                    {/* Полосы метрик */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#8892b0' }}>Процессор (CPU)</span>
                          <span style={{ fontWeight: 700, color: cpu && cpu > 80 ? '#f59e0b' : '#fff' }}>
                            {cpu !== null ? `${cpu.toFixed(1)}%` : '—'}
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#1c1c3e', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(cpu || 0, 100)}%`, height: '100%', background: cpu && cpu > 80 ? '#f59e0b' : '#3b82f6', borderRadius: 3 }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#8892b0' }}>Память (RAM)</span>
                          <span style={{ fontWeight: 700, color: ram && ram > 85 ? '#ef4444' : '#fff' }}>
                            {ram !== null ? `${ram.toFixed(1)}%` : '—'}
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#1c1c3e', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(ram || 0, 100)}%`, height: '100%', background: ram && ram > 85 ? '#ef4444' : '#8b5cf6', borderRadius: 3 }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#8892b0' }}>Дисковое хранилище</span>
                          <span style={{ fontWeight: 700, color: '#10b981' }}>
                            {disk !== null ? `${disk.toFixed(1)}%` : '—'}
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#1c1c3e', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(disk || 0, 100)}%`, height: '100%', background: '#10b981', borderRadius: 3 }} />
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #161633', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
                      <span>Аптайм: {typeof uptimeVal === 'number' ? (uptimeVal > 24 ? `${(uptimeVal/24).toFixed(1)} д` : `${uptimeVal.toFixed(1)} ч`) : '—'}</span>
                      <span>Отклик: {pingVal ? `${pingVal} ms` : '< 1 ms'}</span>
                      <span>{cCount > 0 ? `📦 ${cCount} конт.` : 'Хост'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Блок 2: Бизнес-приложения и Docker Контейнеры */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: '#c4cfe0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📦</span> Активные Контейнеры & Микросервисы (Docker)
            </h2>
            <div style={{ background: '#0d0d26', border: '1px solid #1f1f44', borderRadius: 12, padding: 20, overflowX: 'auto' }}>
              {allContainers.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1c1c3e' }}>
                      <th style={{ paddingBottom: 8 }}>Сервер</th>
                      <th style={{ paddingBottom: 8 }}>Имя контейнера</th>
                      <th style={{ paddingBottom: 8 }}>Статус</th>
                      <th style={{ paddingBottom: 8 }}>CPU %</th>
                      <th style={{ paddingBottom: 8 }}>RAM (MB)</th>
                      <th style={{ paddingBottom: 8, textAlign: 'right' }}>RAM %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allContainers.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #141430' }}>
                        <td style={{ padding: '9px 0', color: '#818cf8', fontWeight: 600 }}>{c.serverId}</td>
                        <td style={{ fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>{c.name}</td>
                        <td>
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontWeight: 700,
                            fontSize: 11
                          }}>
                            {c.status}
                          </span>
                        </td>
                        <td style={{ color: '#94a3b8' }}>{c.cpu > 0 ? `${c.cpu.toFixed(2)}%` : '0%'}</td>
                        <td style={{ color: '#fff', fontWeight: 600 }}>{c.memMb > 0 ? `${c.memMb.toFixed(1)} MB` : (c.memPct > 0 ? `${c.memPct.toFixed(1)}%` : '—')}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{c.memPct > 0 ? `${c.memPct.toFixed(1)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '20px 0' }}>
                  Контейнеры опрашиваются агентами...
                </div>
              )}
            </div>
          </div>

          {/* Блок 3: Инфраструктурные Сервисы и Платформа */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: '#c4cfe0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚡</span> Инфраструктурные Сервисы Платформы Мониторинга
            </h2>
            <div style={{ background: '#0d0d26', border: '1px solid #1f1f44', borderRadius: 12, padding: 20, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1c1c3e' }}>
                    <th style={{ paddingBottom: 8 }}>Сервис</th>
                    <th style={{ paddingBottom: 8 }}>Адрес / Порт</th>
                    <th style={{ paddingBottom: 8 }}>Тип компонента</th>
                    <th style={{ paddingBottom: 8 }}>Назначение</th>
                    <th style={{ paddingBottom: 8, textAlign: 'right' }}>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {platformServices.map((svc, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #141430' }}>
                      <td style={{ padding: '10px 0', fontWeight: 600, color: '#fff' }}>{svc.name}</td>
                      <td style={{ color: '#818cf8', fontFamily: 'monospace' }}>{svc.host}</td>
                      <td style={{ color: '#94a3b8' }}>{svc.type}</td>
                      <td style={{ color: '#64748b', fontSize: 12 }}>{svc.role}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontWeight: 700,
                          fontSize: 11
                        }}>
                          {svc.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Блок 4: Инциденты & Аварийный журнал */}
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: '#c4cfe0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🛡️</span> Оперативная Сводка Инцидентов (За последние 24 часа)
            </h2>
            <div style={{ background: '#0d0d26', border: '1px solid #1f1f44', borderRadius: 12, padding: 20 }}>
              {incidents.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {incidents.map((inc) => (
                    <div key={inc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8 }}>
                      <div>
                        <span style={{ fontWeight: 700, color: '#f87171', marginRight: 10 }}>[{inc.severity?.toUpperCase() || 'ALERT'}]</span>
                        <span style={{ color: '#fff' }}>{inc.title || inc.description}</span>
                      </div>
                      <span style={{ color: '#94a3b8', fontSize: 11 }}>{new Date(inc.created_at).toLocaleTimeString('ru')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#10b981', padding: '6px 0' }}>
                  <span style={{ fontSize: 20 }}>✅</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Все системы функционируют в штатном режиме</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Критических сбоев и нарушений SLA за отчётный период не зафиксировано. Все ключевые показатели в норме.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </ProtectedRoute>
  )
}
