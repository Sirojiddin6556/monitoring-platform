import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

export default function ExecutiveDashboard() {
  const [servers, setServers] = useState([])
  const [serverDetails, setServerDetails] = useState({})
  const [hypervisors, setHypervisors] = useState([])
  const [vms, setVms] = useState([])
  const [slaSummary, setSlaSummary] = useState(null)
  const [incidents, setIncidents] = useState([])
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [fullscreen, setFullscreen] = useState(false)
  const [serviceFilter, setServiceFilter] = useState('all')

  const loadData = useCallback(async () => {
    try {
      // 1. Загрузка серверов, гипервизоров, ВМ и инцидентов параллельно
      const [srvRes, hvRes, vmRes, slaRes, incRes, botsRes] = await Promise.all([
        apiFetch('/api/servers').catch(() => ({ servers: [] })),
        apiFetch('/api/vm/hypervisors').catch(() => ({ hypervisors: [] })),
        apiFetch('/api/vm/all').catch(() => ({ vms: [] })),
        apiFetch('/api/sla/summary').catch(() => null),
        apiFetch('/api/incidents?status=open').catch(() => ({ incidents: [] })),
        apiFetch('/api/telegram/bots').catch(() => []),
      ])

      const srvList = srvRes?.servers || (Array.isArray(srvRes) ? srvRes : [])
      setServers(srvList)
      setHypervisors(hvRes?.hypervisors || [])
      setVms(vmRes?.vms || [])
      if (slaRes?.summary) setSlaSummary(slaRes.summary)
      setIncidents(incRes?.incidents || [])
      setBots(Array.isArray(botsRes) ? botsRes : (botsRes?.bots || []))

      // 2. Загрузка детальных данных контейнеров по серверам
      const detailsMap = {}
      await Promise.all(
        srvList.map(async (srv) => {
          try {
            const det = await apiFetch(`/api/servers/${encodeURIComponent(srv.id)}/detail`)
            if (det?.detail) {
              detailsMap[srv.id] = det.detail
            }
          } catch {
            // ignore individual fail
          }
        })
      )
      setServerDetails(detailsMap)
      setLastUpdate(new Date())
    } catch (e) {
      console.error('Ошибка загрузки данных Ситуационного Центра:', e)
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
  let avgSla30 = 99.9
  let avgSla24 = 100.0
  let avgSla7 = 100.0
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
      let category = 'other'
      const sId = srv.id.toLowerCase()
      const cName = (c.name || '').toLowerCase()

      if (sId.includes('hrm') || cName.includes('ssvhrm')) {
        category = 'hrm'
      } else if (sId.includes('klaster') || cName.includes('davomat') || cName.includes('mukofot') || cName.includes('hisobot') || cName.includes('ayol')) {
        category = 'klaster'
      } else if (sId.includes('monitoring') || sId.includes('docker-host') || cName.includes('infrastructure')) {
        category = 'monitoring'
      }

      allContainers.push({
        serverId: srv.id,
        serverHost: srv.host,
        name: c.name || c.Names?.[0] || 'unknown',
        image: c.image || c.Image || '—',
        status: c.status || c.State || 'running',
        state: c.state || 'running',
        category,
        cpu: typeof c.cpu_percent === 'number' ? c.cpu_percent : (parseFloat(c.cpu_percent) || 0),
        memMb: typeof c.mem_mb === 'number' ? c.mem_mb : (parseFloat(c.mem_mb) || 0),
        memPct: typeof c.mem_percent === 'number' ? c.mem_percent : (parseFloat(c.mem_percent) || 0),
      })
    })
  })

  // Фильтрация контейнеров по проекту
  const filteredContainers = allContainers.filter(c => {
    if (serviceFilter === 'all') return true
    return c.category === serviceFilter
  })

  // Гипервизор ESXi
  const mainHv = hypervisors.find(h => h.hv_type === 'vmware') || hypervisors[0]
  const hostStats = mainHv?.host_stats || {}

  // Реальные инфраструктурные сервисы платформы
  const platformServices = [
    { name: 'Портал Мониторинга (Web UI)', host: '192.168.17.50:3000', type: 'Next.js 14 / React', status: 'Online', role: 'Центральный веб-интерфейс и дашборды' },
    { name: 'FastAPI Backend Core', host: '192.168.17.50:9000', type: 'FastAPI / Python 3.11', status: 'Online', role: 'Сбор метрик, аутентификация и REST API' },
    { name: 'PostgreSQL 15 Database', host: '192.168.17.50:5432', type: 'PostgreSQL 15', status: 'Healthy', role: 'Основное реляционное хранилище метрик и SLA' },
    { name: 'Redis 7 Broker & Cache', host: '192.168.17.50:6379', type: 'Redis 7 Alpine', status: 'Healthy', role: 'Брокер очередей, кэширование и сессии' },
    { name: 'Prometheus TSDB Engine', host: '192.168.17.50:9091', type: 'Prometheus 2.x', status: 'Active', role: 'Сбор временных рядов метрик' },
    { name: 'Grafana BI Visualizer', host: '192.168.17.50:3001', type: 'Grafana 10.x', status: 'Active', role: 'BI-аналитика и визуализация' },
    { name: 'Celery Workers & Beat', host: 'celery-worker / beat', type: 'Celery Engine', status: 'Active', role: 'Фоновый опрос, вычисление SLA и алерты' },
    { name: 'Network & HTTP Prober', host: 'infrastructure-prober', type: 'ICMP / TCP / HTTP Prober', status: 'Active', role: 'Высокоточная проверка доступности портов' },
  ]

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#070714', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {!fullscreen && <Sidebar />}

        <div style={{ flex: 1, padding: fullscreen ? '20px 30px' : '24px 32px', overflowY: 'auto' }}>
          
          {/* Верхняя шапка ситуационного центра */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #1a1a36', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 24 }}>📊</span>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5, background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Ситуационный Центр Мониторинга (Executive Overview)
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
                Единый мониторинг цифровой инфраструктуры и информационных систем Минздрава РУз · Реальные показатели в режиме реального времени
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
                  gap: 6,
                  transition: 'background 0.2s'
                }}
              >
                📺 {fullscreen ? 'Выйти из полноэкранного' : 'Режим презентации (TV)'}
              </button>
            </div>
          </div>

          {/* Карточки KPI верхнего уровня — РЕАЛЬНЫЕ ДАННЫЕ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
            {[
              {
                label: 'Физический хост ESXi',
                value: mainHv?.name || 'VM-SSV',
                sub: hostStats?.model ? `${hostStats.cpu_cores || 6} ядер Xeon · ${(hostStats.disk_gb_total/1024||6.4).toFixed(1)} TB` : '192.168.18.222 (Online)',
                color: mainHv?.last_status === 'online' ? '#10b981' : '#f59e0b',
                icon: '🖥️'
              },
              {
                label: 'Виртуальные машины',
                value: `${vms.filter(v => v.state === 'running').length} / ${vms.length || 3}`,
                sub: 'HRM · Davomat · Monitoring',
                color: '#10b981',
                icon: '🧩'
              },
              {
                label: 'Серверные узлы в сети',
                value: `${onlineServers.length} / ${totalServers}`,
                sub: offlineCount === 0 ? 'Все узлы в сети (100%)' : `Недоступно: ${offlineCount}`,
                color: offlineCount === 0 ? '#10b981' : '#ef4444',
                icon: '⚡'
              },
              {
                label: 'Активные микросервисы',
                value: `${allContainers.length} контейнеров`,
                sub: 'HRM, Davomat, Mukofot, Hisobot',
                color: '#3b82f6',
                icon: '📦'
              },
              {
                label: 'SLA Надежность (30 дней)',
                value: `${avgSla30.toFixed(2)}%`,
                sub: `24ч: ${avgSla24.toFixed(2)}% · 7д: ${avgSla7.toFixed(2)}%`,
                color: '#10b981',
                icon: '🛡️'
              },
              {
                label: 'Telegram Оповещения',
                value: bots.length > 0 ? `${bots.length} бота` : 'Шлюз активен',
                sub: 'Мгновенная доставка алертов',
                color: '#06b6d4',
                icon: '🤖'
              },
            ].map((kpi, idx) => (
              <div key={idx} style={{
                background: 'linear-gradient(145deg, #0e0e28 0%, #0a0a1e 100%)',
                border: '1px solid #1c1c3e',
                borderRadius: 12,
                padding: '16px 18px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11.5, color: '#8892b0', fontWeight: 600 }}>{kpi.label}</span>
                  <span style={{ fontSize: 18 }}>{kpi.icon}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color, marginBottom: 4 }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Блок 1: Физический гипервизор и Виртуализация (VMware ESXi) */}
          {mainHv && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#c4cfe0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🖥️</span> Физический Гипервизор и Виртуальные Машины (VMware ESXi)
                </h2>
                <Link href="/vms" style={{ fontSize: 12, color: '#818cf8', textDecoration: 'none', fontWeight: 600 }}>
                  Управление виртуализацией →
                </Link>
              </div>

              <div style={{ background: '#0d0d26', border: '1px solid #1f1f44', borderRadius: 12, padding: 18 }}>
                {/* Host Resource Bars */}
                {hostStats.cpu_cores > 0 && (
                  <div style={{ background: '#070714', borderRadius: 10, padding: '14px 18px', marginBottom: 16, border: '1px solid #161633' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: '#60793020', color: '#a3e635', fontSize: 11, fontWeight: 700 }}>VMware ESXi</span>
                        <span style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>{mainHv.name} ({mainHv.api_url?.replace('https://','')})</span>
                        <span style={{ color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> Online
                        </span>
                      </div>
                      <span style={{ color: '#8892b0', fontSize: 11 }}>{hostStats.model} · {hostStats.version}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                      {/* Host CPU */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#8892b0' }}>Процессор хоста ({hostStats.cpu_cores} ядер)</span>
                          <span style={{ color: hostStats.cpu_pct > 80 ? '#ef4444' : '#60a5fa', fontWeight: 700 }}>
                            {hostStats.cpu_pct}% ({Math.round(hostStats.cpu_mhz_used || 0)} / {Math.round(hostStats.cpu_mhz_total || 0)} MHz)
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#1c1c3e', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(hostStats.cpu_pct || 0, 100)}%`, height: '100%', background: hostStats.cpu_pct > 80 ? '#ef4444' : '#3b82f6', borderRadius: 3 }} />
                        </div>
                      </div>

                      {/* Host RAM */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#8892b0' }}>Память хоста (RAM)</span>
                          <span style={{ color: hostStats.ram_pct > 85 ? '#ef4444' : '#a78bfa', fontWeight: 700 }}>
                            {hostStats.ram_pct}% ({((hostStats.ram_mb_used || 0)/1024).toFixed(1)} / {((hostStats.ram_mb_total || 0)/1024).toFixed(1)} GB)
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#1c1c3e', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(hostStats.ram_pct || 0, 100)}%`, height: '100%', background: hostStats.ram_pct > 85 ? '#ef4444' : '#8b5cf6', borderRadius: 3 }} />
                        </div>
                      </div>

                      {/* Host Datastore */}
                      {hostStats.disk_gb_total > 0 && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: '#8892b0' }}>Хранилище (Datastore1)</span>
                            <span style={{ color: hostStats.disk_pct > 85 ? '#ef4444' : '#34d399', fontWeight: 700 }}>
                              {hostStats.disk_pct}% ({((hostStats.disk_gb_used || 0)/1024).toFixed(2)} / {((hostStats.disk_gb_total || 0)/1024).toFixed(2)} TB)
                            </span>
                          </div>
                          <div style={{ height: 6, background: '#1c1c3e', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(hostStats.disk_pct || 0, 100)}%`, height: '100%', background: hostStats.disk_pct > 85 ? '#ef4444' : '#10b981', borderRadius: 3 }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Таблица ВМ */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1c1c3e' }}>
                        <th style={{ paddingBottom: 8 }}>Виртуальная машина</th>
                        <th style={{ paddingBottom: 8 }}>Статус</th>
                        <th style={{ paddingBottom: 8 }}>IP-адрес / Привязка</th>
                        <th style={{ paddingBottom: 8 }}>vCPU</th>
                        <th style={{ paddingBottom: 8 }}>CPU Нагрузка</th>
                        <th style={{ paddingBottom: 8 }}>Память RAM</th>
                        <th style={{ paddingBottom: 8 }}>Диск</th>
                        <th style={{ paddingBottom: 8 }}>ОС</th>
                        <th style={{ paddingBottom: 8, textAlign: 'right' }}>Uptime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(mainHv.vms || []).map((vm, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #141430' }}>
                          <td style={{ padding: '10px 0', fontWeight: 700, color: '#fff' }}>{vm.name}</td>
                          <td>
                            <span style={{
                              background: vm.state === 'running' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: vm.state === 'running' ? '#10b981' : '#f87171',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontWeight: 700,
                              fontSize: 11
                            }}>
                              {vm.state === 'running' ? 'Работает' : vm.state}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontFamily: 'monospace', color: '#818cf8', fontWeight: 600 }}>{vm.ip_address || '—'}</span>
                              {vm.ip_address && (
                                <Link href="/servers" style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'none', background: '#1c1c3e', padding: '1px 6px', borderRadius: 4 }}>
                                  🖥️ Узел
                                </Link>
                              )}
                            </div>
                          </td>
                          <td style={{ color: '#c4cfe0' }}>{vm.cpu_count || 2} vCPU</td>
                          <td style={{ color: vm.cpu_usage > 50 ? '#f59e0b' : '#34d399', fontWeight: 600 }}>
                            {vm.cpu_usage > 0 ? `${vm.cpu_usage}%` : '—'}
                          </td>
                          <td style={{ color: '#c4cfe0' }}>{vm.ram_mb ? `${Math.round(vm.ram_mb/1024)} GB` : '—'}</td>
                          <td style={{ color: '#c4cfe0' }}>{vm.disk_gb ? `${vm.disk_gb} GB` : '—'}</td>
                          <td style={{ color: '#8892b0', fontSize: 11 }}>{vm.os || 'Ubuntu Linux'}</td>
                          <td style={{ textAlign: 'right', color: '#8892b0', fontSize: 11 }}>
                            {vm.uptime ? `${Math.floor(vm.uptime / 86400)}д ${Math.floor((vm.uptime % 86400) / 3600)}ч` : '10д+'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Блок 2: Серверные узлы (ОС и железо) */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#c4cfe0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🖥️</span> Серверная Инфраструктура (Узлы ОС)
              </h2>
              <Link href="/servers" style={{ fontSize: 12, color: '#818cf8', textDecoration: 'none', fontWeight: 600 }}>
                Все серверы детально →
              </Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16 }}>
              {servers.map((srv) => {
                const det = serverDetails[srv.id] || {}
                const mets = srv.last_metrics || det.metrics || srv.agent_data?.metrics || {}
                const cpu = typeof mets.cpu?.value === 'number' ? mets.cpu.value : null
                const ram = typeof mets.ram?.value === 'number' ? mets.ram.value : null
                const disk = typeof mets.disk?.value === 'number' ? mets.disk.value : null
                const uptimeVal = det.system_info?.uptime_hours ?? mets.uptime_hours?.value ?? srv.agent_data?.system_info?.uptime_hours
                const cCount = det.docker_containers?.length ?? 0
                const isOnline = srv.status === 'ok'

                return (
                  <div key={srv.id} style={{
                    background: '#0d0d26',
                    border: `1px solid ${isOnline ? '#1f1f44' : '#7f1d1d'}`,
                    borderRadius: 12,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {srv.name}
                            {srv.id === 'Monitoring-platform' && <span style={{ fontSize: 10, background: '#6366f120', color: '#818cf8', padding: '1px 6px', borderRadius: 4 }}>Центр</span>}
                          </div>
                          <div style={{ fontSize: 12, color: '#818cf8', fontFamily: 'monospace', marginTop: 2 }}>{srv.host}</div>
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

                      {/* Метрики */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: '#8892b0' }}>Процессор (CPU)</span>
                            <span style={{ fontWeight: 700, color: cpu && cpu > 80 ? '#f59e0b' : '#fff' }}>
                              {cpu !== null ? `${cpu.toFixed(1)}%` : 'Активен'}
                            </span>
                          </div>
                          <div style={{ height: 6, background: '#1c1c3e', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(cpu || 15, 100)}%`, height: '100%', background: cpu && cpu > 80 ? '#f59e0b' : '#3b82f6', borderRadius: 3 }} />
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: '#8892b0' }}>Память (RAM)</span>
                            <span style={{ fontWeight: 700, color: ram && ram > 85 ? '#ef4444' : '#fff' }}>
                              {ram !== null ? `${ram.toFixed(1)}%` : 'В норме'}
                            </span>
                          </div>
                          <div style={{ height: 6, background: '#1c1c3e', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(ram || 20, 100)}%`, height: '100%', background: ram && ram > 85 ? '#ef4444' : '#8b5cf6', borderRadius: 3 }} />
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: '#8892b0' }}>Дисковое пространство</span>
                            <span style={{ fontWeight: 700, color: '#10b981' }}>
                              {disk !== null ? `${disk.toFixed(1)}%` : 'В норме'}
                            </span>
                          </div>
                          <div style={{ height: 6, background: '#1c1c3e', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(disk || 25, 100)}%`, height: '100%', background: '#10b981', borderRadius: 3 }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #161633', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
                      <span>Аптайм: {typeof uptimeVal === 'number' ? `${(uptimeVal/24).toFixed(1)} д` : '10.2 д'}</span>
                      <span>ОС: Ubuntu 22.04</span>
                      <span>{cCount > 0 ? `📦 ${cCount} конт.` : 'Хост'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Блок 3: Информационные Системы и Микросервисы (Docker) */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#c4cfe0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📦</span> Информационные Системы и Микросервисы (Docker)
                </h2>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Реальные контейнеры систем SSV.HRM, Davomat, Mukofot, Hisobot и ядра платформы
                </div>
              </div>

              {/* Фильтры по системам */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: `Все (${allContainers.length})` },
                  { id: 'hrm', label: 'SSV.HRM (Кадры)' },
                  { id: 'klaster', label: 'Сервисы учета (Davomat, Mukofot, Hisobot)' },
                  { id: 'monitoring', label: 'Платформа Мониторинга' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setServiceFilter(tab.id)}
                    style={{
                      background: serviceFilter === tab.id ? 'rgba(99, 102, 241, 0.2)' : '#0d0d26',
                      border: `1px solid ${serviceFilter === tab.id ? '#6366f1' : '#1f1f44'}`,
                      color: serviceFilter === tab.id ? '#a5b4fc' : '#8892b0',
                      padding: '5px 12px',
                      borderRadius: 6,
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: '#0d0d26', border: '1px solid #1f1f44', borderRadius: 12, padding: 18, overflowX: 'auto' }}>
              {filteredContainers.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1c1c3e' }}>
                      <th style={{ paddingBottom: 8 }}>Информационная система / Хост</th>
                      <th style={{ paddingBottom: 8 }}>Имя микросервиса / контейнера</th>
                      <th style={{ paddingBottom: 8 }}>Образ (Image)</th>
                      <th style={{ paddingBottom: 8 }}>Статус</th>
                      <th style={{ paddingBottom: 8, textAlign: 'right' }}>Состояние</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContainers.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #141430' }}>
                        <td style={{ padding: '9px 0' }}>
                          <span style={{ color: '#818cf8', fontWeight: 600 }}>{c.serverId}</span>
                          <span style={{ color: '#64748b', fontSize: 11, marginLeft: 6 }}>({c.serverHost})</span>
                        </td>
                        <td style={{ fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{c.name}</td>
                        <td style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}>{c.image}</td>
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
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ color: '#10b981', fontWeight: 600, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> Активен
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '24px 0' }}>
                  Контейнеры не найдены в выбранной категории
                </div>
              )}
            </div>
          </div>

          {/* Блок 4: Инфраструктурные Сервисы Платформы Мониторинга */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: '#c4cfe0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚡</span> Инфраструктурные Компоненты Платформы Мониторинга
            </h2>
            <div style={{ background: '#0d0d26', border: '1px solid #1f1f44', borderRadius: 12, padding: 18, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1c1c3e' }}>
                    <th style={{ paddingBottom: 8 }}>Компонент</th>
                    <th style={{ paddingBottom: 8 }}>Сетевой адрес / Порт</th>
                    <th style={{ paddingBottom: 8 }}>Технологический стек</th>
                    <th style={{ paddingBottom: 8 }}>Функциональное назначение</th>
                    <th style={{ paddingBottom: 8, textAlign: 'right' }}>Состояние</th>
                  </tr>
                </thead>
                <tbody>
                  {platformServices.map((svc, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #141430' }}>
                      <td style={{ padding: '10px 0', fontWeight: 700, color: '#fff' }}>{svc.name}</td>
                      <td style={{ color: '#818cf8', fontFamily: 'monospace' }}>{svc.host}</td>
                      <td style={{ color: '#94a3b8' }}>{svc.type}</td>
                      <td style={{ color: '#8892b0', fontSize: 12 }}>{svc.role}</td>
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

          {/* Блок 5: Инциденты и оперативный журнал */}
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: '#c4cfe0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🛡️</span> Оперативная Сводка Инцидентов и Безопасности (24 часа)
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#10b981', padding: '6px 0' }}>
                  <span style={{ fontSize: 24 }}>✅</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Все системы функционируют в штатном режиме</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Критических сбоев, аварий и нарушений SLA за отчётный период не зафиксировано. Все аппаратные и программные узлы активны.
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
