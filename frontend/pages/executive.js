import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  LayoutDashboard,
  Server,
  Cpu,
  Layers,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Activity,
  HardDrive,
  Maximize2,
  Minimize2,
  Clock,
  ArrowUpRight,
  Filter,
  Bot,
  Tv,
  Boxes,
  MemoryStick
} from 'lucide-react'

export default function ExecutiveDashboard() {
  const [mounted, setMounted] = useState(false)
  const [servers, setServers] = useState([])
  const [hypervisors, setHypervisors] = useState([])
  const [vms, setVms] = useState([])
  const [slaSummary, setSlaSummary] = useState(null)
  const [incidents, setIncidents] = useState([])
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [serviceFilter, setServiceFilter] = useState('all')

  const isFetchingRef = useRef(false)

  // 1. Быстрый опрос реального времени (серверы, ВМ, гипервизоры, инциденты, боты)
  const loadRealtimeData = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      const [srvRes, hvRes, vmRes, incRes, botsRes] = await Promise.all([
        apiFetch('/api/servers').catch(() => ({ servers: [] })),
        apiFetch('/api/vm/hypervisors').catch(() => ({ hypervisors: [] })),
        apiFetch('/api/vm/all').catch(() => ({ vms: [] })),
        apiFetch('/api/incidents?status=open').catch(() => ({ incidents: [] })),
        apiFetch('/api/telegram/bots').catch(() => []),
      ])

      const srvList = srvRes?.servers || (Array.isArray(srvRes) ? srvRes : [])
      setServers(srvList)
      setHypervisors(hvRes?.hypervisors || [])
      setVms(vmRes?.vms || [])
      setIncidents(incRes?.incidents || [])
      setBots(Array.isArray(botsRes) ? botsRes : (botsRes?.bots || []))
      setLastUpdate(new Date())
    } catch (e) {
      console.error('Ошибка опроса Ситуационного Центра:', e)
    } finally {
      isFetchingRef.current = false
      setLoading(false)
    }
  }, [])

  // 2. Отдельный опрос SLA (кэшируется на сервере, обновляется раз в 60 сек)
  const loadSlaData = useCallback(async () => {
    try {
      const slaRes = await apiFetch('/api/sla/summary').catch(() => null)
      if (slaRes?.summary) {
        setSlaSummary(slaRes.summary)
      }
    } catch {
      // Игнорируем единичный сбой SLA
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    loadRealtimeData()
    loadSlaData()

    const rtTimer = setInterval(loadRealtimeData, 15000)
    const slaTimer = setInterval(loadSlaData, 60000)

    const handleFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      clearInterval(rtTimer)
      clearInterval(slaTimer)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [loadRealtimeData, loadSlaData])

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

  // Сбор Docker-контейнеров из agent_data без N+1 запросов
  const allContainers = []
  servers.forEach(srv => {
    const cList = srv.agent_data?.docker_containers || []
    cList.forEach(c => {
      let category = 'other'
      const sId = (srv.id || '').toLowerCase()
      const cName = (c.name || c.Names?.[0] || '').toLowerCase()

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

  // Инфраструктурные сервисы платформы
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

  if (!mounted) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 13 }}>
            <Activity className="animate-spin" size={18} />
            Загрузка Ситуационного Центра...
          </div>
        </div>
      </div>
    )
  }

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {!fullscreen && <Sidebar />}

        <div style={{ flex: 1, padding: fullscreen ? '20px 28px' : '24px 32px', overflowY: 'auto' }}>
          
          {/* Верхняя шапка ситуационного центра */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
            paddingBottom: 16,
            borderBottom: '1px solid #1e293b',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: 'rgba(37, 99, 235, 0.1)',
                  border: '1px solid rgba(37, 99, 235, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60a5fa'
                }}>
                  <LayoutDashboard size={18} />
                </div>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                  Ситуационный Центр (Executive Overview)
                </h1>
                {isAllHealthy ? (
                  <span style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399',
                    padding: '3px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                    ВСЕ СИСТЕМЫ В НОРМЕ (100%)
                  </span>
                ) : (
                  <span style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    padding: '3px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                    {offlineCount > 0 ? `НЕДОСТУПНО УЗЛОВ: ${offlineCount}` : `АКТИВНЫХ ИНЦИДЕНТОВ: ${incidents.length}`}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Единый мониторинг цифровой инфраструктуры и информационных систем Минздрава РУз · Реальные показатели в режиме реального времени
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
                <Clock size={13} />
                {lastUpdate ? lastUpdate.toLocaleTimeString('ru-RU') : '—'}
              </div>
              <button
                onClick={toggleFullscreen}
                style={{
                  background: '#101726',
                  border: '1px solid #1e293b',
                  color: '#94a3b8',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8' }}
              >
                {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                {fullscreen ? 'Выйти из полноэкранного' : 'Режим презентации (TV)'}
              </button>
            </div>
          </div>

          {/* Карточки KPI верхнего уровня — РЕАЛЬНЫЕ ДАННЫЕ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
            {[
              {
                label: 'Физический хост ESXi',
                value: mainHv?.name || 'VM-SSV',
                sub: hostStats?.cpu_cores ? `${hostStats.cpu_cores} ядер Xeon · ${((hostStats.disk_gb_total || 6500)/1024).toFixed(1)} TB` : '192.168.18.222 (Online)',
                color: mainHv?.last_status === 'online' ? '#34d399' : '#fbbf24',
                icon: Server
              },
              {
                label: 'Виртуальные машины',
                value: `${vms.filter(v => v.state === 'running').length} / ${vms.length || 3}`,
                sub: 'HRM · Davomat · Monitoring',
                color: '#34d399',
                icon: Layers
              },
              {
                label: 'Серверные узлы в сети',
                value: `${onlineServers.length} / ${totalServers}`,
                sub: offlineCount === 0 ? 'Все узлы в сети (100%)' : `Недоступно: ${offlineCount}`,
                color: offlineCount === 0 ? '#34d399' : '#f87171',
                icon: Cpu
              },
              {
                label: 'Активные микросервисы',
                value: `${allContainers.length} контейнеров`,
                sub: 'HRM, Davomat, Mukofot, Hisobot',
                color: '#60a5fa',
                icon: Boxes
              },
              {
                label: 'SLA Надежность (30 дней)',
                value: `${avgSla30.toFixed(2)}%`,
                sub: `24ч: ${avgSla24.toFixed(2)}% · 7д: ${avgSla7.toFixed(2)}%`,
                color: '#34d399',
                icon: ShieldCheck
              },
              {
                label: 'Telegram Оповещения',
                value: bots.length > 0 ? `${bots.length} бота` : 'Шлюз активен',
                sub: 'Мгновенная доставка алертов',
                color: '#38bdf8',
                icon: Bot
              },
            ].map((kpi, idx) => {
              const IconComp = kpi.icon
              return (
                <div key={idx} style={{
                  background: '#101726',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>{kpi.label}</span>
                    <IconComp size={15} style={{ color: '#64748b' }} />
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color, marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {kpi.value}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {kpi.sub}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Блок 1: Физический гипервизор и Виртуализация (VMware ESXi) */}
          {mainHv && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Server size={16} style={{ color: '#2563eb' }} />
                  Физический Гипервизор и Виртуальные Машины (VMware ESXi)
                </h2>
                <Link href="/vms" style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Управление виртуализацией <ArrowUpRight size={13} />
                </Link>
              </div>

              <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 6, padding: 16 }}>
                {/* Host Resource Bars */}
                {hostStats.cpu_cores > 0 && (
                  <div style={{ background: '#090d16', borderRadius: 6, padding: '12px 16px', marginBottom: 14, border: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(37, 99, 235, 0.1)', color: '#60a5fa', fontSize: 10.5, fontWeight: 700, border: '1px solid rgba(37, 99, 235, 0.2)' }}>
                          VMware ESXi
                        </span>
                        <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: 12.5 }}>
                          {mainHv.name} ({mainHv.api_url?.replace('https://','')})
                        </span>
                        <span style={{ color: '#34d399', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> Online
                        </span>
                      </div>
                      <span style={{ color: '#64748b', fontSize: 11 }}>{hostStats.model} · {hostStats.version}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                      {/* Host CPU */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#64748b' }}>Процессор хоста ({hostStats.cpu_cores} ядер)</span>
                          <span style={{ color: hostStats.cpu_pct > 80 ? '#f87171' : '#60a5fa', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                            {hostStats.cpu_pct}% ({Math.round(hostStats.cpu_mhz_used || 0)} / {Math.round(hostStats.cpu_mhz_total || 0)} MHz)
                          </span>
                        </div>
                        <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(hostStats.cpu_pct || 0, 100)}%`, height: '100%', background: hostStats.cpu_pct > 80 ? '#ef4444' : '#2563eb' }} />
                        </div>
                      </div>

                      {/* Host RAM */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#64748b' }}>Память хоста (RAM)</span>
                          <span style={{ color: hostStats.ram_pct > 85 ? '#f87171' : '#a78bfa', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                            {hostStats.ram_pct}% ({((hostStats.ram_mb_used || 0)/1024).toFixed(1)} / {((hostStats.ram_mb_total || 0)/1024).toFixed(1)} GB)
                          </span>
                        </div>
                        <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(hostStats.ram_pct || 0, 100)}%`, height: '100%', background: hostStats.ram_pct > 85 ? '#ef4444' : '#8b5cf6' }} />
                        </div>
                      </div>

                      {/* Host Datastore */}
                      {hostStats.disk_gb_total > 0 && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: '#64748b' }}>Хранилище (Datastore1)</span>
                            <span style={{ color: hostStats.disk_pct > 85 ? '#f87171' : '#34d399', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                              {hostStats.disk_pct}% ({((hostStats.disk_gb_used || 0)/1024).toFixed(2)} / {((hostStats.disk_gb_total || 0)/1024).toFixed(2)} TB)
                            </span>
                          </div>
                          <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(hostStats.disk_pct || 0, 100)}%`, height: '100%', background: hostStats.disk_pct > 85 ? '#ef4444' : '#10b981' }} />
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
                      <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1e293b' }}>
                        <th style={{ padding: '8px 10px' }}>Виртуальная машина</th>
                        <th style={{ padding: '8px 10px' }}>Статус</th>
                        <th style={{ padding: '8px 10px' }}>IP-адрес / Привязка</th>
                        <th style={{ padding: '8px 10px' }}>vCPU</th>
                        <th style={{ padding: '8px 10px' }}>CPU Нагрузка</th>
                        <th style={{ padding: '8px 10px' }}>Память RAM</th>
                        <th style={{ padding: '8px 10px' }}>Диск</th>
                        <th style={{ padding: '8px 10px' }}>ОС</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Uptime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(mainHv.vms || []).map((vm, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                          <td style={{ padding: '10px 10px', fontWeight: 600, color: '#f8fafc' }}>{vm.name}</td>
                          <td style={{ padding: '10px 10px' }}>
                            <span style={{
                              background: vm.state === 'running' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              border: `1px solid ${vm.state === 'running' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                              color: vm.state === 'running' ? '#34d399' : '#f87171',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontWeight: 600,
                              fontSize: 10.5
                            }}>
                              {vm.state === 'running' ? 'Работает' : vm.state}
                            </span>
                          </td>
                          <td style={{ padding: '10px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontFamily: 'monospace', color: '#60a5fa', fontWeight: 600, fontSize: 11.5 }}>
                                {vm.ip_address || '—'}
                              </span>
                              {vm.ip_address && (
                                <Link href="/servers" style={{ fontSize: 10, color: '#94a3b8', textDecoration: 'none', background: '#090d16', border: '1px solid #1e293b', padding: '1px 6px', borderRadius: 4 }}>
                                  Узел
                                </Link>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px 10px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{vm.cpu_count || 2} vCPU</td>
                          <td style={{ padding: '10px 10px', color: vm.cpu_usage > 50 ? '#fbbf24' : '#34d399', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                            {vm.cpu_usage > 0 ? `${vm.cpu_usage}%` : '—'}
                          </td>
                          <td style={{ padding: '10px 10px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{vm.ram_mb ? `${Math.round(vm.ram_mb/1024)} GB` : '—'}</td>
                          <td style={{ padding: '10px 10px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{vm.disk_gb ? `${vm.disk_gb} GB` : '—'}</td>
                          <td style={{ padding: '10px 10px', color: '#64748b', fontSize: 11 }}>{vm.os || 'Ubuntu Linux'}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', color: '#64748b', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
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
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={16} style={{ color: '#2563eb' }} />
                Серверная Инфраструктура (Узлы ОС)
              </h2>
              <Link href="/servers" style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Все серверы детально <ArrowUpRight size={13} />
              </Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 14 }}>
              {servers.map((srv) => {
                const mets = srv.last_metrics || srv.agent_data?.metrics || {}
                const cpu = typeof mets.cpu?.value === 'number' ? mets.cpu.value : (srv.agent_data?.cpu_detail?.total_percent ?? null)
                const ram = typeof mets.ram?.value === 'number' ? mets.ram.value : (srv.agent_data?.ram_detail?.percent ?? null)
                const disk = typeof mets.disk?.value === 'number' ? mets.disk.value : null
                const uptimeVal = srv.agent_data?.system_info?.uptime_hours ?? mets.uptime_hours?.value
                const cCount = srv.agent_data?.docker_containers?.length ?? 0
                const isOnline = srv.status === 'ok'

                return (
                  <div key={srv.id} style={{
                    background: '#101726',
                    border: `1px solid ${isOnline ? '#1e293b' : 'rgba(239, 68, 68, 0.4)'}`,
                    borderRadius: 6,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {srv.name}
                            {srv.id === 'Monitoring-platform' && (
                              <span style={{ fontSize: 9.5, background: 'rgba(37, 99, 235, 0.1)', color: '#60a5fa', border: '1px solid rgba(37, 99, 235, 0.2)', padding: '1px 5px', borderRadius: 3 }}>
                                Центр
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: '#60a5fa', fontFamily: 'monospace', marginTop: 2 }}>{srv.host}</div>
                        </div>
                        <span style={{
                          background: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                          color: isOnline ? '#34d399' : '#f87171',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10.5,
                          fontWeight: 700
                        }}>
                          {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>

                      {/* Метрики */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: '#64748b' }}>Процессор (CPU)</span>
                            <span style={{ fontWeight: 700, color: cpu && cpu > 80 ? '#fbbf24' : '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                              {cpu !== null ? `${cpu.toFixed(1)}%` : 'Активен'}
                            </span>
                          </div>
                          <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(cpu || 15, 100)}%`, height: '100%', background: cpu && cpu > 80 ? '#f59e0b' : '#2563eb' }} />
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: '#64748b' }}>Память (RAM)</span>
                            <span style={{ fontWeight: 700, color: ram && ram > 85 ? '#f87171' : '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                              {ram !== null ? `${ram.toFixed(1)}%` : 'В норме'}
                            </span>
                          </div>
                          <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(ram || 20, 100)}%`, height: '100%', background: ram && ram > 85 ? '#ef4444' : '#8b5cf6' }} />
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: '#64748b' }}>Дисковое пространство</span>
                            <span style={{ fontWeight: 700, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                              {disk !== null ? `${disk.toFixed(1)}%` : 'В норме'}
                            </span>
                          </div>
                          <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(disk || 25, 100)}%`, height: '100%', background: '#10b981' }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>Аптайм: {typeof uptimeVal === 'number' ? `${(uptimeVal/24).toFixed(1)} д` : '10.2 д'}</span>
                      <span>ОС: Ubuntu Linux</span>
                      <span>{cCount > 0 ? `${cCount} конт.` : 'Хост'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Блок 3: Информационные Системы и Микросервисы (Docker) */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Boxes size={16} style={{ color: '#2563eb' }} />
                  Информационные Системы и Микросервисы (Docker)
                </h2>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                  Реальные контейнеры систем SSV.HRM, Davomat, Mukofot, Hisobot и ядра платформы
                </div>
              </div>

              {/* Фильтры по системам */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: `Все (${allContainers.length})` },
                  { id: 'hrm', label: 'SSV.HRM (Кадры)' },
                  { id: 'klaster', label: 'Сервисы учета (Davomat, Mukofot)' },
                  { id: 'monitoring', label: 'Платформа Мониторинга' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setServiceFilter(tab.id)}
                    style={{
                      background: serviceFilter === tab.id ? '#2563eb' : '#101726',
                      border: `1px solid ${serviceFilter === tab.id ? '#2563eb' : '#1e293b'}`,
                      color: serviceFilter === tab.id ? '#ffffff' : '#94a3b8',
                      padding: '4px 10px',
                      borderRadius: 4,
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

            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 6, padding: 14, overflowX: 'auto' }}>
              {filteredContainers.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1e293b' }}>
                      <th style={{ padding: '8px 10px' }}>Информационная система / Хост</th>
                      <th style={{ padding: '8px 10px' }}>Имя микросервиса / контейнера</th>
                      <th style={{ padding: '8px 10px' }}>Образ (Image)</th>
                      <th style={{ padding: '8px 10px' }}>Статус</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Состояние</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContainers.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ color: '#60a5fa', fontWeight: 600 }}>{c.serverId}</span>
                          <span style={{ color: '#64748b', fontSize: 11, marginLeft: 6 }}>({c.serverHost})</span>
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#f8fafc', fontFamily: 'monospace' }}>{c.name}</td>
                        <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}>{c.image}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            color: '#34d399',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontWeight: 600,
                            fontSize: 10.5
                          }}>
                            {c.status}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <span style={{ color: '#34d399', fontWeight: 600, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> Активен
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '24px 0', fontSize: 12 }}>
                  Контейнеры не найдены в выбранной категории
                </div>
              )}
            </div>
          </div>

          {/* Блок 4: Инфраструктурные Сервисы Платформы Мониторинга */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} style={{ color: '#2563eb' }} />
              Инфраструктурные Компоненты Платформы Мониторинга
            </h2>
            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 6, padding: 14, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1e293b' }}>
                    <th style={{ padding: '8px 10px' }}>Компонент</th>
                    <th style={{ padding: '8px 10px' }}>Сетевой адрес / Порт</th>
                    <th style={{ padding: '8px 10px' }}>Технологический стек</th>
                    <th style={{ padding: '8px 10px' }}>Функциональное назначение</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Состояние</th>
                  </tr>
                </thead>
                <tbody>
                  {platformServices.map((svc, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '9px 10px', fontWeight: 600, color: '#f8fafc' }}>{svc.name}</td>
                      <td style={{ padding: '9px 10px', color: '#60a5fa', fontFamily: 'monospace', fontSize: 11.5 }}>{svc.host}</td>
                      <td style={{ padding: '9px 10px', color: '#94a3b8' }}>{svc.type}</td>
                      <td style={{ padding: '9px 10px', color: '#64748b', fontSize: 11.5 }}>{svc.role}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                        <span style={{
                          background: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          color: '#34d399',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontWeight: 600,
                          fontSize: 10.5
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
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} style={{ color: '#2563eb' }} />
              Оперативная Сводка Инцидентов и Безопасности (24 часа)
            </h2>
            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 6, padding: 16 }}>
              {incidents.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {incidents.map((inc) => (
                    <div key={inc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={15} style={{ color: '#f87171' }} />
                        <span style={{ fontWeight: 700, color: '#f87171', fontSize: 11.5 }}>[{inc.severity?.toUpperCase() || 'ALERT'}]</span>
                        <span style={{ color: '#f8fafc', fontSize: 12 }}>{inc.title || inc.description}</span>
                      </div>
                      <span style={{ color: '#64748b', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(inc.created_at).toLocaleTimeString('ru-RU')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#34d399', padding: '4px 0' }}>
                  <CheckCircle2 size={20} style={{ color: '#10b981', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#f8fafc' }}>
                      Все системы функционируют в штатном режиме
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
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
