import { useEffect, useState, useRef, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import { useRouter } from 'next/router'
import Link from 'next/link'
import apiFetch from '../lib/api'
import {
  Server,
  Globe,
  Bot,
  Boxes,
  Layers,
  Bell,
  ShieldCheck,
  Activity,
  Database,
  ExternalLink,
  Lock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUpRight,
  Radio,
  Tv,
  Cpu,
  Clock,
  HardDrive,
  Network
} from 'lucide-react'

function StatCard({ title, value, sub, color = '#2563eb', icon: IconComp }) {
  return (
    <div style={{
      background: '#101726',
      border: '1px solid #1e293b',
      borderRadius: 6,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title}
        </span>
        {IconComp && <IconComp size={15} style={{ color: '#64748b' }} />}
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusDot({ ok }) {
  return (
    <span style={{
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: ok ? '#10b981' : '#ef4444',
      display: 'inline-block',
      flexShrink: 0
    }} />
  )
}

function ModuleCard({ title, status, rows }) {
  return (
    <div style={{
      background: '#101726',
      border: '1px solid #1e293b',
      borderRadius: 6,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#f8fafc' }}>{title}</span>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: 4,
          background: status ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${status ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: status ? '#34d399' : '#f87171'
        }}>
          {status ? 'OK' : 'ISSUE'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 8px',
            borderRadius: 4,
            background: '#090d16',
            border: '1px solid #1e293b'
          }}>
            <StatusDot ok={r.ok} />
            <span style={{ flex: 1, fontSize: 11.5, color: '#94a3b8' }}>{r.label}</span>
            <span style={{ fontSize: 11.5, color: '#f8fafc', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const [ping, setPing] = useState(null)
  const [servers, setServers] = useState([])
  const [websites, setWebsites] = useState([])
  const [dockerStats, setDockerStats] = useState({ total: 0, running: 0, stopped: 0, servers_with_docker: 0 })
  const [vmStats, setVmStats] = useState({ total: 0, running: 0, stopped: 0, paused: 0 })
  const [telegramBots, setTelegramBots] = useState([])
  const [settingsMap, setSettingsMap] = useState({})
  const [alertStats, setAlertStats] = useState({ total: 0, active: 0, critical: 0, warning: 0, resolved: 0 })
  const [alerts, setAlerts] = useState([])
  const [alertsLoading, setAlertsLoading] = useState(true)
  const [wsConnected, setWsConnected] = useState(false)
  const [selectedServer, setSelectedServer] = useState(null)
  const [selectedWebsite, setSelectedWebsite] = useState(null)
  const [serverDetail, setServerDetail] = useState(null)
  const [websiteProbes, setWebsiteProbes] = useState([])
  const wsRef = useRef(null)
  const router = useRouter()

  function toNumber(v, fallback = null) {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  function normalizeMetrics(metrics = {}) {
    const out = {}
    for (const [k, m] of Object.entries(metrics || {})) {
      if (m && typeof m === 'object' && Object.prototype.hasOwnProperty.call(m, 'value')) {
        out[k] = { ...m, value: toNumber(m.value, m.value) }
      } else {
        out[k] = m
      }
    }
    return out
  }

  const loadData = useCallback(() => {
    apiFetch('/api/ping').then(d => setPing(d)).catch(() => setPing({ error: 'failed' }))
    apiFetch('/api/servers').then(d => setServers((d.servers || []).map(s => {
      const lastMetrics = normalizeMetrics(s.last_metrics || {})
      return { ...s, last_metrics: lastMetrics, last_ping: s.last_ping ?? lastMetrics.ping?.value ?? null }
    }))).catch(() => {})
    apiFetch('/api/websites').then(d => setWebsites(d.websites || [])).catch(() => {})
    apiFetch('/api/docker/stats').then(d => setDockerStats(d || { total: 0, running: 0, stopped: 0, servers_with_docker: 0 })).catch(() => {})
    apiFetch('/api/vm/stats').then(d => setVmStats(d || { total: 0, running: 0, stopped: 0, paused: 0 })).catch(() => {})
    apiFetch('/api/telegram/bots').then(d => setTelegramBots(d.bots || [])).catch(() => {})
    apiFetch('/api/settings').then(d => {
      const map = {}
      for (const row of (d.settings || [])) map[row.key] = row.value
      setSettingsMap(map)
    }).catch(() => {})
    apiFetch('/api/alerts/stats').then(d => setAlertStats(d || {})).catch(() => {})
    apiFetch('/api/alerts?limit=20').then(d => { setAlerts(d.alerts || []); setAlertsLoading(false) }).catch(() => setAlertsLoading(false))
  }, [])

  useEffect(() => {
    setMounted(true)
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/auth/login')
      return
    }

    loadData()

    // Периодическое обновление
    const iv = setInterval(() => {
      apiFetch('/api/alerts/stats').then(d => setAlertStats(d || {})).catch(() => {})
      apiFetch('/api/alerts?limit=20').then(d => setAlerts(d.alerts || [])).catch(() => {})
      apiFetch('/api/docker/stats').then(d => setDockerStats(d || {})).catch(() => {})
      apiFetch('/api/vm/stats').then(d => setVmStats(d || {})).catch(() => {})
      apiFetch('/api/telegram/bots').then(d => setTelegramBots(d.bots || [])).catch(() => {})
    }, 25000)

    // WebSocket подключение для метрик в реальном времени
    const base = process.env.NEXT_PUBLIC_API_URL || ''
    if (base && token) {
      const wsUrl = base.replace('http', 'ws') + '/ws?token=' + encodeURIComponent(token)
      try {
        wsRef.current = new WebSocket(wsUrl)
        wsRef.current.onopen = () => setWsConnected(true)
        wsRef.current.onclose = () => setWsConnected(false)
        wsRef.current.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data)
            if (msg.metric) {
              const pl = msg.metric.payload || msg.metric
              if (pl.server_id) {
                const wsMetrics = normalizeMetrics(pl.metrics || {})
                const wsPing = pl.value ?? wsMetrics.ping?.value
                setServers(prev => prev.map(s => s.id === pl.server_id ? {
                  ...s,
                  status: pl.status || s.status,
                  last_ping: wsPing ?? s.last_ping,
                  last_metrics: Object.keys(wsMetrics).length ? wsMetrics : s.last_metrics
                } : s))
              }
              if (pl.website_id) {
                setWebsites(prev => prev.map(w => w.id === pl.website_id ? { ...w, status: pl.status || w.status } : w))
              }
            }
          } catch {}
        }
      } catch {}
    }

    return () => {
      clearInterval(iv)
      if (wsRef.current) wsRef.current.close()
    }
  }, [router, loadData])

  const srvUp = servers.filter(s => s.status === 'ok').length
  const srvDown = servers.filter(s => s.status === 'down').length
  const tgActive = telegramBots.filter(b => b.is_active).length
  const tgOnline = telegramBots.filter(b => b.is_active && b.last_status === 'online').length
  const isFeatureOn = (key, fallback = true) => {
    if (!(key in settingsMap)) return fallback
    return String(settingsMap[key]).toLowerCase() === 'true'
  }
  const getWebStatus = (w) => w.last_probe?.status || 'unknown'
  const webUp = websites.filter(w => getWebStatus(w) === 'up').length
  const webDown = websites.filter(w => getWebStatus(w) === 'down').length

  const apiOnline = Boolean(ping?.ping)
  const monitoringEnabled = isFeatureOn('monitoring_enabled', true)
  const pingEnabled = isFeatureOn('ping_enabled', true)
  const probeEnabled = isFeatureOn('probe_enabled', true)
  const alertsEnabled = isFeatureOn('alerts_enabled', true)
  const tgHealthy = tgActive > 0 && tgOnline > 0
  const dockerHealthy = (dockerStats.total || 0) === 0 ? true : (dockerStats.running || 0) > 0
  const vmHealthy = (vmStats.total || 0) === 0 ? true : (vmStats.running || 0) > 0

  const dashboardModules = [
    {
      title: 'Инфраструктура',
      status: srvDown === 0 && webDown === 0,
      rows: [
        { label: 'Серверы online', ok: srvDown === 0, value: `${srvUp}/${servers.length}` },
        { label: 'Сайты online', ok: webDown === 0, value: `${webUp}/${websites.length}` },
        { label: 'Критичные алерты', ok: (alertStats.critical || 0) === 0, value: String(alertStats.critical || 0) },
      ],
    },
    {
      title: 'Платформа',
      status: apiOnline && wsConnected && monitoringEnabled,
      rows: [
        { label: 'FastAPI Core', ok: apiOnline, value: apiOnline ? 'online' : 'offline' },
        { label: 'WebSocket Stream', ok: wsConnected, value: wsConnected ? 'live' : 'off' },
        { label: 'Мониторинг', ok: monitoringEnabled, value: monitoringEnabled ? 'enabled' : 'disabled' },
      ],
    },
    {
      title: 'Сбор метрик',
      status: pingEnabled && probeEnabled,
      rows: [
        { label: 'Ping Engine', ok: pingEnabled, value: `${settingsMap.ping_interval || '10'}s` },
        { label: 'HTTP Probe', ok: probeEnabled, value: `${settingsMap.probe_interval || '30'}s` },
        { label: 'Alerting System', ok: alertsEnabled, value: alertsEnabled ? 'enabled' : 'disabled' },
      ],
    },
    {
      title: 'Telegram Шлюз',
      status: tgHealthy,
      rows: [
        { label: 'Ботов всего', ok: telegramBots.length > 0, value: String(telegramBots.length) },
        { label: 'Боты активные', ok: tgActive > 0, value: String(tgActive) },
        { label: 'Боты online', ok: tgOnline > 0, value: String(tgOnline) },
      ],
    },
    {
      title: 'Контейнеры и ВМ',
      status: dockerHealthy && vmHealthy,
      rows: [
        { label: 'Docker running', ok: dockerHealthy, value: `${dockerStats.running || 0}/${dockerStats.total || 0}` },
        { label: 'VM running (ESXi)', ok: vmHealthy, value: `${vmStats.running || 0}/${vmStats.total || 0}` },
        { label: 'VM paused', ok: (vmStats.paused || 0) === 0, value: String(vmStats.paused || 0) },
      ],
    },
    {
      title: 'Оповещения',
      status: (alertStats.critical || 0) === 0,
      rows: [
        { label: 'Активные алерты', ok: (alertStats.active || 0) === 0, value: String(alertStats.active || 0) },
        { label: 'Предупреждения', ok: (alertStats.warning || 0) === 0, value: String(alertStats.warning || 0) },
        { label: 'Решенные за 24ч', ok: true, value: String(alertStats.resolved || 0) },
      ],
    },
  ]

  const openServerDetail = async (s) => {
    setSelectedServer(s)
    setServerDetail(undefined)
    try {
      const d = await apiFetch(`/api/servers/${encodeURIComponent(s.id)}/detail`)
      setServerDetail(d?.detail || d || null)
    } catch {
      setServerDetail(null)
    }
  }

  const openWebsiteDetail = async (w) => {
    setSelectedWebsite(w)
    setWebsiteProbes([])
    try {
      const d = await apiFetch(`/api/websites/${encodeURIComponent(w.id)}/probes`)
      setWebsiteProbes(d.probes || [])
    } catch {}
  }

  if (!mounted) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 13 }}>
            <Activity className="animate-spin" size={18} />
            Загрузка дашборда...
          </div>
        </div>
      </div>
    )
  }

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
          
          {/* Верхняя шапка */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: '1px solid #1e293b',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                Обзор Системы Мониторинга
              </h1>
              <Link
                href="/executive"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px',
                  borderRadius: 4,
                  background: '#2563eb',
                  color: '#ffffff',
                  textDecoration: 'none',
                  fontSize: 11.5,
                  fontWeight: 600,
                  transition: 'background 0.15s'
                }}
              >
                <Activity size={14} />
                <span>Ситуационный Центр</span>
              </Link>
              <Link
                href="/noc"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px',
                  borderRadius: 4,
                  background: '#101726',
                  border: '1px solid #1e293b',
                  color: '#94a3b8',
                  textDecoration: 'none',
                  fontSize: 11.5,
                  fontWeight: 600,
                  transition: 'all 0.15s'
                }}
              >
                <Tv size={14} />
                <span>NOC Wallboard</span>
              </Link>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#101726',
                border: '1px solid #1e293b',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 11,
                color: ping?.ping ? '#34d399' : '#f87171'
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ping?.ping ? '#10b981' : '#ef4444' }} />
                {ping?.ping ? 'API Online' : 'API Offline'}
              </span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#101726',
                border: '1px solid #1e293b',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 11,
                color: wsConnected ? '#34d399' : '#f87171'
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: wsConnected ? '#10b981' : '#ef4444' }} />
                {wsConnected ? 'WS Live' : 'WS Off'}
              </span>
            </div>
          </div>

          {/* Карточки KPI верхнего уровня */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 20 }}>
            <StatCard
              title="Серверы"
              value={servers.length}
              sub={`${srvUp} онлайн · ${srvDown} оффлайн`}
              color="#34d399"
              icon={Server}
            />
            <StatCard
              title="Веб-сайты"
              value={websites.length}
              sub={`${webUp} онлайн · ${webDown} оффлайн`}
              color="#60a5fa"
              icon={Globe}
            />
            <StatCard
              title="Telegram боты"
              value={telegramBots.length}
              sub={`${tgOnline} онлайн · ${tgActive} активных`}
              color={tgOnline > 0 ? '#34d399' : '#94a3b8'}
              icon={Bot}
            />
            <StatCard
              title="Docker контейнеры"
              value={dockerStats.total || 0}
              sub={`${dockerStats.running || 0} running · ${dockerStats.stopped || 0} stopped`}
              color={(dockerStats.running || 0) > 0 ? '#34d399' : '#94a3b8'}
              icon={Boxes}
            />
            <StatCard
              title="Виртуальные машины"
              value={vmStats.total || 0}
              sub={`${vmStats.running || 0} online · ${vmStats.stopped || 0} off`}
              color={(vmStats.running || 0) > 0 ? '#34d399' : '#94a3b8'}
              icon={Layers}
            />
            <StatCard
              title="Активные алерты"
              value={alertStats.active || 0}
              sub={`${alertStats.critical || 0} критич. · ${alertStats.warning || 0} предупр.`}
              color={alertStats.critical > 0 ? '#f87171' : alertStats.active > 0 ? '#fbbf24' : '#34d399'}
              icon={Bell}
            />
            <StatCard
              title="Доступность серверов"
              value={servers.length ? Math.round(srvUp / servers.length * 100) + '%' : '—'}
              sub="за текущий период"
              color={srvUp === servers.length ? '#34d399' : '#fbbf24'}
              icon={ShieldCheck}
            />
            <StatCard
              title="Доступность сайтов"
              value={websites.length ? Math.round(webUp / websites.length * 100) + '%' : '—'}
              sub="за текущий период"
              color={webUp === websites.length ? '#34d399' : '#fbbf24'}
              icon={Radio}
            />
          </div>

          {/* Модули подсистем */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 20 }}>
            {dashboardModules.map((m, i) => (
              <ModuleCard key={i} title={m.title} status={m.status} rows={m.rows} />
            ))}
          </div>

          {/* Серверные узлы (Краткая оперативная таблица) */}
          <div style={{
            background: '#101726',
            border: '1px solid #1e293b',
            borderRadius: 6,
            padding: 16,
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Server size={16} style={{ color: '#2563eb' }} />
                <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#f8fafc' }}>
                  Оперативное состояние серверных узлов
                </h3>
              </div>
              <Link href="/servers" style={{ fontSize: 11.5, color: '#60a5fa', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Все серверы детально <ArrowUpRight size={13} />
              </Link>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1e293b' }}>
                    <th style={{ padding: '8px 10px' }}>Узел</th>
                    <th style={{ padding: '8px 10px' }}>IP-адрес</th>
                    <th style={{ padding: '8px 10px' }}>Статус</th>
                    <th style={{ padding: '8px 10px' }}>Ping</th>
                    <th style={{ padding: '8px 10px' }}>CPU</th>
                    <th style={{ padding: '8px 10px' }}>RAM</th>
                    <th style={{ padding: '8px 10px' }}>Диск</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((s) => {
                    const m = s.last_metrics || {}
                    const cpu = m.cpu?.value ?? s.agent_data?.cpu_detail?.total_percent ?? null
                    const ram = m.ram?.value ?? s.agent_data?.ram_detail?.percent ?? null
                    const disk = m.disk?.value ?? null
                    const isOnline = s.status === 'ok'

                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '9px 10px', fontWeight: 600, color: '#f8fafc' }}>
                          {s.name}
                          {s.id === 'Monitoring-platform' && (
                            <span style={{ fontSize: 9.5, marginLeft: 6, background: 'rgba(37, 99, 235, 0.1)', color: '#60a5fa', border: '1px solid rgba(37, 99, 235, 0.2)', padding: '1px 5px', borderRadius: 3 }}>
                              Core
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '9px 10px', fontFamily: 'monospace', color: '#60a5fa', fontSize: 11.5 }}>
                          {s.host}
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{
                            background: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            color: isOnline ? '#34d399' : '#f87171',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontWeight: 600,
                            fontSize: 10.5
                          }}>
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                          {s.last_ping != null ? `${Number(s.last_ping).toFixed(1)} ms` : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', color: cpu && cpu > 80 ? '#fbbf24' : '#f8fafc', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {cpu !== null ? `${Number(cpu).toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', color: ram && ram > 85 ? '#f87171' : '#f8fafc', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {ram !== null ? `${Number(ram).toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                          {disk !== null ? `${Number(disk).toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                          <button
                            onClick={() => openServerDetail(s)}
                            style={{
                              background: '#090d16',
                              border: '1px solid #1e293b',
                              color: '#94a3b8',
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#fff' }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8' }}
                          >
                            Детали
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Двухколоночный блок: Алерты и Быстрые ссылки */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 20 }}>
            
            {/* Алерты */}
            <div style={{
              background: '#101726',
              border: '1px solid #1e293b',
              borderRadius: 6,
              padding: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bell size={16} style={{ color: '#2563eb' }} />
                  <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#f8fafc' }}>
                    Оперативные алерты
                  </h3>
                </div>
                <Link href="/alerts" style={{ fontSize: 11.5, color: '#60a5fa', textDecoration: 'none' }}>
                  Все алерты →
                </Link>
              </div>

              {alertsLoading ? (
                <div style={{ color: '#64748b', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>
                  Загрузка алертов...
                </div>
              ) : alerts.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#34d399', padding: '12px 0' }}>
                  <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                  <span style={{ fontSize: 12.5, color: '#94a3b8' }}>Активных тревог нет. Все параметры в норме.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                  {alerts.map((a) => {
                    const isCrit = a.severity === 'critical'
                    const isWarn = a.severity === 'warning'
                    const color = isCrit ? '#f87171' : isWarn ? '#fbbf24' : '#60a5fa'
                    const bg = isCrit ? 'rgba(239, 68, 68, 0.08)' : isWarn ? 'rgba(245, 158, 11, 0.08)' : 'rgba(37, 99, 235, 0.08)'
                    const border = isCrit ? 'rgba(239, 68, 68, 0.25)' : isWarn ? 'rgba(245, 158, 11, 0.25)' : 'rgba(37, 99, 235, 0.25)'

                    return (
                      <Link
                        key={a.id}
                        href={`/alerts?alertId=${encodeURIComponent(a.id)}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '8px 10px',
                          borderRadius: 4,
                          background: bg,
                          border: `1px solid ${border}`,
                          textDecoration: 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {a.title || `Alert #${a.id}`}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
                          {a.severity || 'info'}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Быстрые разделы */}
            <div style={{
              background: '#101726',
              border: '1px solid #1e293b',
              borderRadius: 6,
              padding: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#f8fafc' }}>
                  Быстрый доступ к подсистемам
                </h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                {[
                  { href: '/executive', label: 'Ситуационный центр', icon: Activity },
                  { href: '/servers', label: 'Серверы (Узлы)', icon: Server },
                  { href: '/vms', label: 'ВМ (ESXi Хост)', icon: Layers },
                  { href: '/databases', label: 'Базы данных', icon: Database },
                  { href: '/docker', label: 'Docker сервисы', icon: Boxes },
                  { href: '/noc', label: 'NOC Wallboard', icon: Tv },
                  { href: '/websites', label: 'Веб-сайты', icon: Globe },
                  { href: 'http://192.168.17.50:3001', label: 'Grafana BI', icon: ExternalLink, external: true },
                  { href: '/alerts', label: 'Центр алертов', icon: Bell },
                ].map((item, idx) => {
                  const Icon = item.icon
                  if (item.external) {
                    return (
                      <a
                        key={idx}
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '10px 12px',
                          borderRadius: 4,
                          background: '#090d16',
                          border: '1px solid #1e293b',
                          color: '#94a3b8',
                          textDecoration: 'none',
                          fontSize: 12,
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#fff' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8' }}
                      >
                        <Icon size={15} style={{ color: '#2563eb' }} />
                        <span style={{ flex: 1 }}>{item.label}</span>
                        <ArrowUpRight size={12} style={{ opacity: 0.6 }} />
                      </a>
                    )
                  }
                  return (
                    <Link
                      key={idx}
                      href={item.href}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 4,
                        background: '#090d16',
                        border: '1px solid #1e293b',
                        color: '#94a3b8',
                        textDecoration: 'none',
                        fontSize: 12,
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#fff' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8' }}
                    >
                      <Icon size={15} style={{ color: '#2563eb' }} />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>

          </div>

          <div style={{ color: '#64748b', fontSize: 11.5, textAlign: 'center', padding: '12px 0' }}>
            Метрики телеметрии обновляются в реальном времени по WebSocket
          </div>
        </div>
      </div>

      {/* Модальное окно: детали сервера */}
      {selectedServer && (() => {
        const s = selectedServer
        const m = s.last_metrics || {}
        const d = serverDetail
        const sysInfo = d?.system || d?.os || s.agent_data?.system_info || {}
        const isOnline = s.status === 'ok'

        return (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20
            }}
            onClick={() => setSelectedServer(null)}
          >
            <div
              style={{
                background: '#101726',
                borderRadius: 6,
                maxWidth: 600,
                width: '100%',
                maxHeight: '85vh',
                overflow: 'auto',
                border: '1px solid #1e293b',
                padding: 20
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Server size={20} style={{ color: '#2563eb' }} />
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16, color: '#f8fafc', fontWeight: 700 }}>{s.name}</h2>
                    <div style={{ fontSize: 12, color: '#60a5fa', fontFamily: 'monospace' }}>{s.host}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    color: isOnline ? '#34d399' : '#f87171',
                    fontSize: 11,
                    fontWeight: 700
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOnline ? '#10b981' : '#ef4444' }} />
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  <button
                    onClick={() => setSelectedServer(null)}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Метрики */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 16 }}>
                {m.cpu && (
                  <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 4, padding: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>CPU</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: m.cpu.value > 80 ? '#fbbf24' : '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                      {m.cpu.value}%
                    </div>
                  </div>
                )}
                {m.ram && (
                  <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 4, padding: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>RAM</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: m.ram.value > 85 ? '#f87171' : '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                      {m.ram.value}%
                    </div>
                  </div>
                )}
                {m.disk && (
                  <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 4, padding: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Диск</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                      {m.disk.value}%
                    </div>
                  </div>
                )}
                {m.ping && (
                  <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 4, padding: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Ping</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa', fontVariantNumeric: 'tabular-nums' }}>
                      {m.ping.value}<span style={{ fontSize: 10 }}>ms</span>
                    </div>
                  </div>
                )}
                {m.uptime_hours && (
                  <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 4, padding: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Аптайм</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                      {m.uptime_hours.value.toFixed(1)}<span style={{ fontSize: 10 }}>ч</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Сеть */}
              {(m.net_in || m.net_out) && (
                <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 4, padding: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Сетевая активность</div>
                  <div style={{ display: 'flex', gap: 20 }}>
                    {m.net_in && (
                      <div style={{ fontSize: 11.5 }}>
                        <span style={{ color: '#64748b' }}>↓ Входящий:</span>{' '}
                        <span style={{ color: '#34d399', fontWeight: 600 }}>{m.net_in.value} {m.net_in.unit}</span>
                      </div>
                    )}
                    {m.net_out && (
                      <div style={{ fontSize: 11.5 }}>
                        <span style={{ color: '#64748b' }}>↑ Исходящий:</span>{' '}
                        <span style={{ color: '#60a5fa', fontWeight: 600 }}>{m.net_out.value} {m.net_out.unit}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Системная информация */}
              {sysInfo && Object.keys(sysInfo).length > 0 && (
                <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 4, padding: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Системные характеристики</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11.5 }}>
                    {sysInfo.os && <div><span style={{ color: '#64748b' }}>ОС:</span> <span style={{ color: '#f8fafc' }}>{sysInfo.os}</span></div>}
                    {sysInfo.hostname && <div><span style={{ color: '#64748b' }}>Хост:</span> <span style={{ color: '#f8fafc' }}>{sysInfo.hostname}</span></div>}
                    {sysInfo.kernel && <div><span style={{ color: '#64748b' }}>Ядро:</span> <span style={{ color: '#f8fafc' }}>{sysInfo.kernel}</span></div>}
                    {sysInfo.arch && <div><span style={{ color: '#64748b' }}>Архитектура:</span> <span style={{ color: '#f8fafc' }}>{sysInfo.arch}</span></div>}
                    {(sysInfo.cpu_count || sysInfo.cpus) && <div><span style={{ color: '#64748b' }}>CPU ядра:</span> <span style={{ color: '#f8fafc' }}>{sysInfo.cpu_count || sysInfo.cpus}</span></div>}
                    {sysInfo.total_ram && <div><span style={{ color: '#64748b' }}>Память:</span> <span style={{ color: '#f8fafc' }}>{sysInfo.total_ram}</span></div>}
                  </div>
                </div>
              )}

              {serverDetail === undefined && (
                <div style={{ color: '#64748b', fontSize: 11, textAlign: 'center', padding: 8 }}>
                  Загрузка детальной телеметрии...
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, paddingTop: 10, borderTop: '1px solid #1e293b' }}>
                <Link href="/servers" style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'none', fontWeight: 500 }}>
                  Открыть страницу серверов →
                </Link>
                <button
                  onClick={() => setSelectedServer(null)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 4,
                    border: '1px solid #1e293b',
                    background: '#090d16',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: 11.5
                  }}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Модальное окно: детали веб-сайта */}
      {selectedWebsite && (() => {
        const w = selectedWebsite
        const ws = getWebStatus(w)
        const lp = w.last_probe || {}
        const ssl = w.ssl || lp.ssl
        const isUp = ws === 'up'

        return (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20
            }}
            onClick={() => setSelectedWebsite(null)}
          >
            <div
              style={{
                background: '#101726',
                borderRadius: 6,
                maxWidth: 560,
                width: '100%',
                maxHeight: '85vh',
                overflow: 'auto',
                border: '1px solid #1e293b',
                padding: 20
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Globe size={20} style={{ color: '#2563eb' }} />
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16, color: '#f8fafc', fontWeight: 700 }}>{w.name}</h2>
                    <a href={w.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: '#60a5fa', textDecoration: 'none' }}>
                      {w.url}
                    </a>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: isUp ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${isUp ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    color: isUp ? '#34d399' : '#f87171',
                    fontSize: 11,
                    fontWeight: 700
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: isUp ? '#10b981' : '#ef4444' }} />
                    {isUp ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  <button
                    onClick={() => setSelectedWebsite(null)}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Метрики сайта */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
                <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 4, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>HTTP Статус</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: lp.status_code >= 200 && lp.status_code < 400 ? '#34d399' : '#f87171', fontVariantNumeric: 'tabular-nums' }}>
                    {lp.status_code || '—'}
                  </div>
                </div>
                <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 4, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Время отклика</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: lp.response_time > 2000 ? '#f87171' : lp.response_time > 1000 ? '#fbbf24' : '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                    {lp.response_time ? lp.response_time.toFixed(0) : '—'}<span style={{ fontSize: 10 }}>ms</span>
                  </div>
                </div>
              </div>

              {/* SSL */}
              {ssl && (
                <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 4, padding: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Lock size={12} />
                    SSL / TLS Сертификат
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11.5 }}>
                    <div>
                      <span style={{ color: '#64748b' }}>Статус:</span>{' '}
                      <span style={{ color: ssl.valid ? '#34d399' : '#f87171', fontWeight: 600 }}>
                        {ssl.valid ? 'Валидный' : 'Невалидный'}
                      </span>
                    </div>
                    {ssl.issuer && <div><span style={{ color: '#64748b' }}>Издатель:</span> <span style={{ color: '#f8fafc' }}>{ssl.issuer}</span></div>}
                    {ssl.subject && <div><span style={{ color: '#64748b' }}>Домен:</span> <span style={{ color: '#f8fafc' }}>{ssl.subject}</span></div>}
                    {ssl.days_left != null && (
                      <div>
                        <span style={{ color: '#64748b' }}>Осталось:</span>{' '}
                        <span style={{ color: ssl.days_left < 30 ? '#f87171' : ssl.days_left < 90 ? '#fbbf24' : '#34d399', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {ssl.days_left} дн.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* История проверок */}
              {websiteProbes.length > 0 && (
                <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 4, padding: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Последние проверки</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                    {websiteProbes.slice(0, 8).map((probe, i) => {
                      const p = probe.payload || probe
                      const isProbeUp = p.status === 'up'
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 6px', borderRadius: 4, background: '#101726' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: isProbeUp ? '#10b981' : '#ef4444' }} />
                          <span style={{ color: isProbeUp ? '#34d399' : '#f87171', fontWeight: 600, minWidth: 32 }}>
                            {p.status_code}
                          </span>
                          <span style={{ color: '#f8fafc', flex: 1, fontVariantNumeric: 'tabular-nums' }}>
                            {p.response_time?.toFixed(0) || '—'} ms
                          </span>
                          <span style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                            {p.timestamp ? new Date(p.timestamp * 1000).toLocaleTimeString('ru-RU') : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, paddingTop: 10, borderTop: '1px solid #1e293b' }}>
                <Link href="/websites" style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'none', fontWeight: 500 }}>
                  Открыть страницу сайтов →
                </Link>
                <button
                  onClick={() => setSelectedWebsite(null)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 4,
                    border: '1px solid #1e293b',
                    background: '#090d16',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: 11.5
                  }}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )
      })()}

    </ProtectedRoute>
  )
}
