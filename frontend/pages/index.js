import {useEffect, useState, useRef} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import {useRouter} from 'next/router'
import Link from 'next/link'
import apiFetch from '../lib/api'

function StatCard({title, value, sub, color='#6c5ce7', icon}) {
  return (
    <div className="card" style={{padding:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontSize:10,color:'#9aa4b2',textTransform:'uppercase',letterSpacing:0.4,marginBottom:6}}>{title}</div>
          <div style={{fontSize:22,fontWeight:700,color,lineHeight:1}}>{value}</div>
          {sub && <div style={{fontSize:10,color:'#9aa4b2',marginTop:5}}>{sub}</div>}
        </div>
        {icon && <div style={{fontSize:22,opacity:0.15}}>{icon}</div>}
      </div>
    </div>
  )
}

function StatusDot({ok}) {
  return <span style={{width:8,height:8,borderRadius:'50%',background:ok?'#4ade80':'#ef4444',display:'inline-block'}}/>
}

function ModuleCard({title, status, rows}) {
  return (
    <div className="card" style={{padding:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:12,fontWeight:700,color:'#d6deea'}}>{title}</div>
        <span style={{fontSize:10,fontWeight:700,color:status?'#4ade80':'#ef4444'}}>{status ? 'OK' : 'ISSUE'}</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {rows.map((r, i) => (
          <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 6px',borderRadius:4,background:'#07111e'}}>
            <StatusDot ok={r.ok}/>
            <span style={{flex:1,fontSize:11,color:'#cfd8e3'}}>{r.label}</span>
            <span style={{fontSize:10,color:'#9aa4b2'}}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const [ping, setPing] = useState(null)
  const [servers, setServers] = useState([])
  const [websites, setWebsites] = useState([])
  const [dockerContainers, setDockerContainers] = useState([])
  const [virtualMachines, setVirtualMachines] = useState([])
  const [dockerStats, setDockerStats] = useState({total:0,running:0,stopped:0,servers_with_docker:0})
  const [vmStats, setVmStats] = useState({total:0,running:0,stopped:0,paused:0})
  const [telegramBots, setTelegramBots] = useState([])
  const [settingsMap, setSettingsMap] = useState({})
  const [alertStats, setAlertStats] = useState({total:0,active:0,critical:0,warning:0,resolved:0})
  const [alerts, setAlerts] = useState([])
  const [alertsLoading, setAlertsLoading] = useState(true)
  const [wsConnected, setWsConnected] = useState(false)
  const [dashServerFilter, setDashServerFilter] = useState('all')
  const [dashWebFilter, setDashWebFilter] = useState('all')
  const [alertFilter, setAlertFilter] = useState('all')
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
    for(const [k, m] of Object.entries(metrics || {})) {
      if(m && typeof m === 'object' && Object.prototype.hasOwnProperty.call(m, 'value')) {
        out[k] = { ...m, value: toNumber(m.value, m.value) }
      } else {
        out[k] = m
      }
    }
    return out
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if(!token) { router.push('/auth/login'); return }

    Promise.resolve().then(() => {
      apiFetch('/api/ping').then(d => setPing(d)).catch(()=>setPing({error:'failed'}))
      apiFetch('/api/servers').then(d => setServers((d.servers||[]).map(s => {
        const lastMetrics = normalizeMetrics(s.last_metrics || {})
        return { ...s, last_metrics: lastMetrics, last_ping: s.last_ping ?? lastMetrics.ping?.value ?? null }
      }))).catch(()=>{})
      apiFetch('/api/websites').then(d => setWebsites(d.websites||[])).catch(()=>{})
      apiFetch('/api/docker/containers').then(d => setDockerContainers(d.containers||[])).catch(()=>{})
      apiFetch('/api/docker/stats').then(d => setDockerStats(d||{total:0,running:0,stopped:0,servers_with_docker:0})).catch(()=>{})
      apiFetch('/api/vm/all').then(d => setVirtualMachines(d.vms||[])).catch(()=>{})
      apiFetch('/api/vm/stats').then(d => setVmStats(d||{total:0,running:0,stopped:0,paused:0})).catch(()=>{})
      apiFetch('/api/telegram/bots').then(d => setTelegramBots(d.bots||[])).catch(()=>{})
      apiFetch('/api/settings').then(d => {
        const map = {}
        for(const row of (d.settings||[])) map[row.key] = row.value
        setSettingsMap(map)
      }).catch(()=>{})
      apiFetch('/api/alerts/stats').then(d => setAlertStats(d||{})).catch(()=>{})
      apiFetch('/api/alerts?limit=20').then(d => { setAlerts(d.alerts||[]); setAlertsLoading(false) }).catch(()=>setAlertsLoading(false))
    })
  }, [router])

  // Periodic refresh every 30s for stats that WebSocket doesn't cover
  useEffect(() => {
    const iv = setInterval(() => {
      Promise.resolve().then(() => {
        apiFetch('/api/alerts/stats').then(d => setAlertStats(d||{})).catch(()=>{})
        apiFetch('/api/alerts?limit=20').then(d => setAlerts(d.alerts||[])).catch(()=>{})
        apiFetch('/api/docker/stats').then(d => setDockerStats(d||{})).catch(()=>{})
        apiFetch('/api/vm/stats').then(d => setVmStats(d||{})).catch(()=>{})
        apiFetch('/api/telegram/bots').then(d => setTelegramBots(d.bots||[])).catch(()=>{})
      })
    }, 30000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || ''
    const wsToken = localStorage.getItem('token')
    if(!base || !wsToken) {
      setWsConnected(false)
      return
    }
    const wsUrl = base.replace('http', 'ws') + '/ws' + (wsToken ? `?token=${wsToken}` : '')
    try {
      wsRef.current = new WebSocket(wsUrl)
      wsRef.current.onopen = () => setWsConnected(true)
      wsRef.current.onclose = () => setWsConnected(false)
      wsRef.current.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if(msg.metric) {
            const pl = msg.metric.payload || msg.metric
            if(pl.server_id) {
              const wsMetrics = normalizeMetrics(pl.metrics || {})
              const wsPing = pl.value ?? wsMetrics.ping?.value
              setServers(prev => prev.map(s => s.id === pl.server_id ? {...s, status: pl.status || s.status, last_ping: wsPing ?? s.last_ping, last_metrics: Object.keys(wsMetrics).length ? wsMetrics : s.last_metrics} : s))
            }
            if(pl.website_id) {
              setWebsites(prev => prev.map(w => w.id === pl.website_id ? {...w, status: pl.status || w.status} : w))
            }
          }
        } catch(e) {}
      }
    } catch(e) {}
    return () => { if(wsRef.current) wsRef.current.close() }
  }, [])

  const srvUp = servers.filter(s=>s.status==='ok').length
  const srvDown = servers.filter(s=>s.status==='down').length
  const tgActive = telegramBots.filter(b=>b.is_active).length
  const tgOnline = telegramBots.filter(b=>b.is_active && b.last_status==='online').length
  const isFeatureOn = (key, fallback=true) => {
    if(!(key in settingsMap)) return fallback
    return String(settingsMap[key]).toLowerCase() === 'true'
  }
  const getWebStatus = (w) => w.last_probe?.status || 'unknown'
  const webUp = websites.filter(w=>getWebStatus(w)==='up').length
  const webDown = websites.filter(w=>getWebStatus(w)==='down').length
  const serviceFlags = [
    {label:'Мониторинг', on:isFeatureOn('monitoring_enabled', true), detail:`${isFeatureOn('monitoring_enabled', true) ? 'включен' : 'выключен'} в настройках`},
    {label:'Ping', on:isFeatureOn('ping_enabled', true), detail:`интервал: ${settingsMap.ping_interval || '—'}с`},
    {label:'Probe', on:isFeatureOn('probe_enabled', true), detail:`интервал: ${settingsMap.probe_interval || '—'}с`},
    {label:'Alerts', on:isFeatureOn('alerts_enabled', true), detail:`активных: ${alertStats.active || 0}`},
    {label:'SSL Check', on:isFeatureOn('ssl_check_enabled', true), detail:`warn за ${settingsMap.ssl_expiry_warn_days || '—'} дней`},
    {label:'Telegram Bot', on:tgActive > 0, detail:`всего: ${telegramBots.length}, активных: ${tgActive}, online: ${tgOnline}`},
    {label:'Docker', on:(dockerStats.total||0) > 0 || (dockerStats.servers_with_docker||0) > 0, detail:`контейнеров: ${dockerStats.total||0}, running: ${dockerStats.running||0}`},
    {label:'Virtual Machines', on:(vmStats.total||0) > 0, detail:`ВМ: ${vmStats.total||0}, running: ${vmStats.running||0}`},
  ]

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
      title:'Инфраструктура',
      status: srvDown === 0 && webDown === 0,
      rows:[
        {label:'Серверы online', ok:srvDown===0, value:`${srvUp}/${servers.length}`},
        {label:'Сайты online', ok:webDown===0, value:`${webUp}/${websites.length}`},
        {label:'Критичные алерты', ok:(alertStats.critical||0)===0, value:String(alertStats.critical||0)},
      ],
    },
    {
      title:'Платформа',
      status: apiOnline && wsConnected && monitoringEnabled,
      rows:[
        {label:'API', ok:apiOnline, value:apiOnline?'online':'offline'},
        {label:'WebSocket', ok:wsConnected, value:wsConnected?'live':'off'},
        {label:'Мониторинг', ok:monitoringEnabled, value:monitoringEnabled?'enabled':'disabled'},
      ],
    },
    {
      title:'Сбор метрик',
      status: pingEnabled && probeEnabled,
      rows:[
        {label:'Ping', ok:pingEnabled, value:`${settingsMap.ping_interval || '—'}s`},
        {label:'Probe', ok:probeEnabled, value:`${settingsMap.probe_interval || '—'}s`},
        {label:'Alerts', ok:alertsEnabled, value:alertsEnabled?'enabled':'disabled'},
      ],
    },
    {
      title:'Telegram',
      status: tgHealthy,
      rows:[
        {label:'Ботов всего', ok:telegramBots.length>0, value:String(telegramBots.length)},
        {label:'Боты активные', ok:tgActive>0, value:String(tgActive)},
        {label:'Боты online', ok:tgOnline>0, value:String(tgOnline)},
      ],
    },
    {
      title:'Контейнеры и VM',
      status: dockerHealthy && vmHealthy,
      rows:[
        {label:'Docker running', ok:dockerHealthy, value:`${dockerStats.running||0}/${dockerStats.total||0}`},
        {label:'VM running', ok:vmHealthy, value:`${vmStats.running||0}/${vmStats.total||0}`},
        {label:'VM paused', ok:(vmStats.paused||0)===0, value:String(vmStats.paused||0)},
      ],
    },
    {
      title:'Уведомления',
      status: (alertStats.critical||0)===0,
      rows:[
        {label:'Active alerts', ok:(alertStats.active||0)===0, value:String(alertStats.active||0)},
        {label:'Warning', ok:(alertStats.warning||0)===0, value:String(alertStats.warning||0)},
        {label:'Resolved', ok:true, value:String(alertStats.resolved||0)},
      ],
    },
  ]

  const containerRunning = (c) => String(c?.status || c?.state || '').toLowerCase() === 'running'
  const vmRunning = (vm) => ['running','started','on'].includes(String(vm?.state || '').toLowerCase())

  const monitoredRows = [
    ...servers.map((s) => ({
      key:`srv-${s.id}`,
      type:'Сервер',
      name:s.name || s.id,
      on:s.status === 'ok',
      detail:`${s.host || '—'}${s.last_ping != null ? ` · ${Number(s.last_ping).toFixed(0)}ms` : ''}`,
    })),
    ...websites.map((w) => {
      const st = getWebStatus(w)
      return {
        key:`web-${w.id}`,
        type:'Сайт',
        name:w.name || w.url,
        on:st === 'up',
        detail:`${w.url || '—'}${w.last_probe?.response_time != null ? ` · ${Number(w.last_probe.response_time).toFixed(0)}ms` : ''}`,
      }
    }),
    ...telegramBots.map((b) => ({
      key:`tg-${b.id}`,
      type:'Telegram',
      name:b.name || `bot-${b.id}`,
      on:Boolean(b.is_active) && b.last_status === 'online',
      detail:`@${b.last_username || '—'} · ${b.is_active ? 'активен' : 'неактивен'}`,
    })),
    ...dockerContainers.map((c, idx) => ({
      key:`dc-${c.id || c.name || idx}`,
      type:'Docker',
      name:c.name || c.id || 'container',
      on:containerRunning(c),
      detail:`${c.server_name || c.server_id || '—'} · ${c.image || '—'}`,
    })),
    ...virtualMachines.map((vm, idx) => ({
      key:`vm-${vm.id || vm.name || idx}`,
      type:'VM',
      name:vm.name || vm.id || 'vm',
      on:vmRunning(vm),
      detail:`${vm.source_name || vm.source || '—'} · ${vm.type || vm.hv_type || 'vm'}`,
    })),
  ]

  const openServerDetail = async (s) => {
    setSelectedServer(s)
    setServerDetail(undefined)
    try {

      const d = await apiFetch(`/api/servers/${s.id}/detail`)
      setServerDetail(d?.detail || d || null)
    } catch(e) { setServerDetail(null) }
  }

  const openWebsiteDetail = async (w) => {
    setSelectedWebsite(w)
    setWebsiteProbes([])
    try {

      const d = await apiFetch(`/api/websites/${w.id}/probes`)
      setWebsiteProbes(d.probes || [])
    } catch(e) {}
  }

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <div className="page" style={{maxWidth:'100%'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
            <h1 style={{margin:0}}>Обзор системы</h1>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:ping?.ping?'#4ade80':'#ef4444'}}/>
                <span style={{fontSize:11,color:ping?.ping?'#4ade80':'#ef4444'}}>{ping?.ping?'API Online':'API Offline'}</span>
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:wsConnected?'#4ade80':'#ef4444'}}/>
                <span style={{fontSize:11,color:wsConnected?'#4ade80':'#ef4444'}}>{wsConnected?'WS Live':'WS Off'}</span>
              </span>
            </div>
          </div>

          {/* Карточки статистики */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(165px,1fr))',gap:10,marginBottom:20}}>
            <StatCard title="Серверы" value={servers.length} sub={`${srvUp} онлайн · ${srvDown} оффлайн`} color="#6c5ce7" icon="🖥️"/>
            <StatCard title="Веб-сайты" value={websites.length} sub={`${webUp} онлайн · ${webDown} оффлайн`} color="#00d4ff" icon="🌐"/>
            <StatCard title="Telegram боты" value={telegramBots.length} sub={`${tgOnline} онлайн · ${tgActive} активных`} color={tgOnline>0?'#4ade80':'#9aa4b2'} icon="🤖"/>
            <StatCard title="Docker контейнеры" value={dockerStats.total||0} sub={`${dockerStats.running||0} running · ${dockerStats.stopped||0} stopped`} color={(dockerStats.running||0)>0?'#4ade80':'#9aa4b2'} icon="🐳"/>
            <StatCard title="Виртуальные машины" value={vmStats.total||0} sub={`${vmStats.running||0} online · ${vmStats.stopped||0} off`} color={(vmStats.running||0)>0?'#4ade80':'#9aa4b2'} icon="🧩"/>
            <StatCard title="Алерты" value={alertStats.active||0} sub={`${alertStats.critical||0} критичных · ${alertStats.warning||0} предупр.`} color={alertStats.critical>0?'#ef4444':alertStats.active>0?'#facc15':'#4ade80'} icon="🔔"/>
            <StatCard title="Доступность серверов" value={servers.length?Math.round(srvUp/servers.length*100)+'%':'—'} sub="за текущий период" color={srvUp===servers.length?'#4ade80':'#facc15'} icon="📊"/>
            <StatCard title="Доступность сайтов" value={websites.length?Math.round(webUp/websites.length*100)+'%':'—'} sub="за текущий период" color={webUp===websites.length?'#4ade80':'#facc15'} icon="📈"/>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:10,marginBottom:20}}>
            {dashboardModules.map((m, i) => (
              <ModuleCard key={i} title={m.title} status={m.status} rows={m.rows}/>
            ))}
          </div>

          <div className="card" style={{padding:16,marginBottom:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <h3 style={{margin:0,fontSize:14}}>Последние алерты</h3>
              <Link href="/alerts" style={{fontSize:11,color:'#6c5ce7',textDecoration:'none'}}>Все алерты →</Link>
            </div>
            {alertsLoading ? (
              <div style={{color:'#9aa4b2',fontSize:12,padding:10}}>Загрузка алертов...</div>
            ) : alerts.length === 0 ? (
              <div style={{color:'#9aa4b2',fontSize:12,padding:10}}>Алертов нет</div>
            ) : (
              <>
                <div style={{fontSize:10,color:'#9aa4b2',marginBottom:6}}>Показано: {alerts.length} из {alertStats.total || alerts.length}</div>
                <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:360,overflowY:'auto'}}>
                {alerts.map((a) => {
                  const sevColor = a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#facc15' : '#60a5fa'
                  return (
                    <Link
                      key={a.id}
                      href={`/alerts?alertId=${encodeURIComponent(a.id)}`}
                      style={{display:'flex',alignItems:'center',gap:8,padding:'7px 8px',borderRadius:4,background:'#07111e',textDecoration:'none'}}
                    >
                      <span style={{width:6,height:6,borderRadius:'50%',background:sevColor}}/>
                      <span style={{flex:1,fontSize:12,color:'#d6deea',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.title || `Alert #${a.id}`}</span>
                      <span style={{fontSize:10,color:sevColor,fontWeight:700,textTransform:'uppercase'}}>{a.severity || 'info'}</span>
                    </Link>
                  )
                })}
                </div>
              </>
            )}
          </div>

          <div className="card" style={{padding:16,marginBottom:24}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h3 style={{margin:0,fontSize:14}}>Быстрые разделы</h3>
              <span style={{fontSize:11,color:'#9aa4b2'}}>без списков на главной</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10}}>
              <Link href="/servers" style={{padding:'10px 12px',borderRadius:8,background:'#07111e',border:'1px solid #1a2940',color:'#d6deea',textDecoration:'none',fontSize:12}}>🖥️ Серверы</Link>
              <Link href="/websites" style={{padding:'10px 12px',borderRadius:8,background:'#07111e',border:'1px solid #1a2940',color:'#d6deea',textDecoration:'none',fontSize:12}}>🌐 Сайты</Link>
              <Link href="/docker" style={{padding:'10px 12px',borderRadius:8,background:'#07111e',border:'1px solid #1a2940',color:'#d6deea',textDecoration:'none',fontSize:12}}>🐳 Docker</Link>
              <Link href="/vms" style={{padding:'10px 12px',borderRadius:8,background:'#07111e',border:'1px solid #1a2940',color:'#d6deea',textDecoration:'none',fontSize:12}}>🧩 Виртуальные машины</Link>
              <Link href="/telegram" style={{padding:'10px 12px',borderRadius:8,background:'#07111e',border:'1px solid #1a2940',color:'#d6deea',textDecoration:'none',fontSize:12}}>🤖 Telegram</Link>
              <Link href="/alerts" style={{padding:'10px 12px',borderRadius:8,background:'#07111e',border:'1px solid #1a2940',color:'#d6deea',textDecoration:'none',fontSize:12}}>🔔 Алерты</Link>
            </div>
          </div>

          <div style={{color:'#9aa4b2',fontSize:12,textAlign:'center',padding:16}}>
            Данные обновляются в реальном времени через WebSocket
          </div>
        </div>
      </div>

      {/* Модальное окно — детали сервера */}
      {selectedServer && (()=>{
        const s = selectedServer
        const m = s.last_metrics || {}
        const d = serverDetail
        const sysInfo = d?.system || d?.os || {}
        const statusColor = s.status==='ok'?'#4ade80':s.status==='down'?'#ef4444':'#9aa4b2'
        const statusLabel = s.status==='ok'?'Online':s.status==='down'?'Offline':'N/A'
        return (
          <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setSelectedServer(null)}>
            <div style={{background:'#0a1929',borderRadius:12,maxWidth:600,width:'100%',maxHeight:'80vh',overflow:'auto',border:'1px solid #1a2940',padding:24}} onClick={e=>e.stopPropagation()}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:24}}>🖥️</span>
                  <div>
                    <h2 style={{margin:0,fontSize:18,color:'#fff'}}>{s.name}</h2>
                    <div style={{fontSize:12,color:'#9aa4b2'}}>{s.host}</div>
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:statusColor+'20',color:statusColor,fontSize:12,fontWeight:600}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:statusColor}}/>{statusLabel}
                  </span>
                  <button onClick={()=>setSelectedServer(null)} style={{background:'none',border:'none',color:'#9aa4b2',cursor:'pointer',fontSize:20,lineHeight:1}}>✕</button>
                </div>
              </div>

              {/* Основные метрики */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:10,marginBottom:16}}>
                {m.cpu && <div style={{background:'#07111e',borderRadius:8,padding:12,textAlign:'center'}}>
                  <div style={{fontSize:10,color:'#9aa4b2',marginBottom:4}}>CPU</div>
                  <div style={{fontSize:20,fontWeight:700,color:m.cpu.value>80?'#ef4444':m.cpu.value>60?'#facc15':'#4ade80'}}>{m.cpu.value}%</div>
                </div>}
                {m.ram && <div style={{background:'#07111e',borderRadius:8,padding:12,textAlign:'center'}}>
                  <div style={{fontSize:10,color:'#9aa4b2',marginBottom:4}}>RAM</div>
                  <div style={{fontSize:20,fontWeight:700,color:m.ram.value>80?'#ef4444':m.ram.value>60?'#facc15':'#4ade80'}}>{m.ram.value}%</div>
                </div>}
                {m.disk && <div style={{background:'#07111e',borderRadius:8,padding:12,textAlign:'center'}}>
                  <div style={{fontSize:10,color:'#9aa4b2',marginBottom:4}}>Диск</div>
                  <div style={{fontSize:20,fontWeight:700,color:m.disk.value>80?'#ef4444':m.disk.value>60?'#facc15':'#4ade80'}}>{m.disk.value}%</div>
                </div>}
                {m.swap && <div style={{background:'#07111e',borderRadius:8,padding:12,textAlign:'center'}}>
                  <div style={{fontSize:10,color:'#9aa4b2',marginBottom:4}}>Swap</div>
                  <div style={{fontSize:20,fontWeight:700,color:'#9aa4b2'}}>{m.swap.value}%</div>
                </div>}
                {m.ping && <div style={{background:'#07111e',borderRadius:8,padding:12,textAlign:'center'}}>
                  <div style={{fontSize:10,color:'#9aa4b2',marginBottom:4}}>Ping</div>
                  <div style={{fontSize:20,fontWeight:700,color:'#4ade80'}}>{m.ping.value}<span style={{fontSize:11}}>ms</span></div>
                </div>}
                {m.uptime_hours && <div style={{background:'#07111e',borderRadius:8,padding:12,textAlign:'center'}}>
                  <div style={{fontSize:10,color:'#9aa4b2',marginBottom:4}}>Аптайм</div>
                  <div style={{fontSize:16,fontWeight:700,color:'#fff'}}>{m.uptime_hours.value.toFixed(1)}<span style={{fontSize:11}}>ч</span></div>
                </div>}
              </div>

              {/* Сеть */}
              {(m.net_in || m.net_out) && (
                <div style={{background:'#07111e',borderRadius:8,padding:12,marginBottom:16}}>
                  <div style={{fontSize:11,color:'#9aa4b2',marginBottom:8,fontWeight:600}}>Сеть</div>
                  <div style={{display:'flex',gap:20}}>
                    {m.net_in && <div><span style={{fontSize:10,color:'#9aa4b2'}}>↓ Входящий:</span> <span style={{fontSize:13,color:'#4ade80',fontWeight:600}}>{m.net_in.value} {m.net_in.unit}</span></div>}
                    {m.net_out && <div><span style={{fontSize:10,color:'#9aa4b2'}}>↑ Исходящий:</span> <span style={{fontSize:13,color:'#60a5fa',fontWeight:600}}>{m.net_out.value} {m.net_out.unit}</span></div>}
                  </div>
                  {(m.iops_read || m.iops_write) && (
                    <div style={{display:'flex',gap:20,marginTop:8}}>
                      {m.iops_read && <div><span style={{fontSize:10,color:'#9aa4b2'}}>IOPS чтение:</span> <span style={{fontSize:12,color:'#fff'}}>{m.iops_read.value}</span></div>}
                      {m.iops_write && <div><span style={{fontSize:10,color:'#9aa4b2'}}>IOPS запись:</span> <span style={{fontSize:12,color:'#fff'}}>{m.iops_write.value}</span></div>}
                    </div>
                  )}
                </div>
              )}

              {/* Процессы / Load */}
              {(m.processes || m.load1) && (
                <div style={{background:'#07111e',borderRadius:8,padding:12,marginBottom:16}}>
                  <div style={{fontSize:11,color:'#9aa4b2',marginBottom:8,fontWeight:600}}>Нагрузка</div>
                  <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
                    {m.processes && <div><span style={{fontSize:10,color:'#9aa4b2'}}>Процессы:</span> <span style={{fontSize:13,color:'#fff',fontWeight:600}}>{m.processes.value}</span></div>}
                    {m.load1 && <div><span style={{fontSize:10,color:'#9aa4b2'}}>Load 1m:</span> <span style={{fontSize:13,color:'#fff',fontWeight:600}}>{m.load1.value}</span></div>}
                    {m.load5 && <div><span style={{fontSize:10,color:'#9aa4b2'}}>Load 5m:</span> <span style={{fontSize:13,color:'#fff',fontWeight:600}}>{m.load5.value}</span></div>}
                    {m.load15 && <div><span style={{fontSize:10,color:'#9aa4b2'}}>Load 15m:</span> <span style={{fontSize:13,color:'#fff',fontWeight:600}}>{m.load15.value}</span></div>}
                  </div>
                </div>
              )}

              {/* Системная информация (если detail загружен) */}
              {d && (d.system || d.os) && (
                <div style={{background:'#07111e',borderRadius:8,padding:12,marginBottom:16}}>
                  <div style={{fontSize:11,color:'#9aa4b2',marginBottom:8,fontWeight:600}}>Система</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,fontSize:12}}>
                    {sysInfo.os && <div><span style={{color:'#9aa4b2'}}>ОС:</span> <span style={{color:'#fff'}}>{sysInfo.os}</span></div>}
                    {sysInfo.hostname && <div><span style={{color:'#9aa4b2'}}>Хост:</span> <span style={{color:'#fff'}}>{sysInfo.hostname}</span></div>}
                    {sysInfo.kernel && <div><span style={{color:'#9aa4b2'}}>Ядро:</span> <span style={{color:'#fff'}}>{sysInfo.kernel}</span></div>}
                    {sysInfo.arch && <div><span style={{color:'#9aa4b2'}}>Арх:</span> <span style={{color:'#fff'}}>{sysInfo.arch}</span></div>}
                    {sysInfo.python && <div><span style={{color:'#9aa4b2'}}>Python:</span> <span style={{color:'#fff'}}>{sysInfo.python}</span></div>}
                    {(sysInfo.cpu_count || sysInfo.cpus) && <div><span style={{color:'#9aa4b2'}}>CPU ядра:</span> <span style={{color:'#fff'}}>{sysInfo.cpu_count || sysInfo.cpus}</span></div>}
                    {sysInfo.total_ram && <div><span style={{color:'#9aa4b2'}}>Память:</span> <span style={{color:'#fff'}}>{sysInfo.total_ram}</span></div>}
                  </div>
                </div>
              )}

              {serverDetail === undefined && <div style={{color:'#9aa4b2',fontSize:11,textAlign:'center',padding:8}}>Загрузка деталей...</div>}

              <div style={{display:'flex',justifyContent:'space-between',marginTop:12}}>
                <Link href="/servers" style={{fontSize:12,color:'#6c5ce7',textDecoration:'none'}}>Открыть страницу серверов →</Link>
                <button onClick={()=>setSelectedServer(null)} style={{padding:'6px 16px',borderRadius:6,border:'1px solid #1a2940',background:'#0d1b2e',color:'#9aa4b2',cursor:'pointer',fontSize:12}}>Закрыть</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Модальное окно — детали веб-сайта */}
      {selectedWebsite && (()=>{
        const w = selectedWebsite
        const ws = getWebStatus(w)
        const lp = w.last_probe || {}
        const ssl = w.ssl || lp.ssl
        const statusColor = ws==='up'?'#4ade80':ws==='down'?'#ef4444':'#9aa4b2'
        const statusLabel = ws==='up'?'Активен':ws==='down'?'Недоступен':'N/A'
        return (
          <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setSelectedWebsite(null)}>
            <div style={{background:'#0a1929',borderRadius:12,maxWidth:560,width:'100%',maxHeight:'80vh',overflow:'auto',border:'1px solid #1a2940',padding:24}} onClick={e=>e.stopPropagation()}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:24}}>🌐</span>
                  <div>
                    <h2 style={{margin:0,fontSize:18,color:'#fff'}}>{w.name}</h2>
                    <a href={w.url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:'#60a5fa',textDecoration:'none'}}>{w.url}</a>
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:statusColor+'20',color:statusColor,fontSize:12,fontWeight:600}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:statusColor}}/>{statusLabel}
                  </span>
                  <button onClick={()=>setSelectedWebsite(null)} style={{background:'none',border:'none',color:'#9aa4b2',cursor:'pointer',fontSize:20,lineHeight:1}}>✕</button>
                </div>
              </div>

              {/* Основные показатели */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:10,marginBottom:16}}>
                <div style={{background:'#07111e',borderRadius:8,padding:12,textAlign:'center'}}>
                  <div style={{fontSize:10,color:'#9aa4b2',marginBottom:4}}>Статус код</div>
                  <div style={{fontSize:20,fontWeight:700,color:lp.status_code>=200&&lp.status_code<400?'#4ade80':'#ef4444'}}>{lp.status_code||'—'}</div>
                </div>
                <div style={{background:'#07111e',borderRadius:8,padding:12,textAlign:'center'}}>
                  <div style={{fontSize:10,color:'#9aa4b2',marginBottom:4}}>Время ответа</div>
                  <div style={{fontSize:20,fontWeight:700,color:lp.response_time>2000?'#ef4444':lp.response_time>1000?'#facc15':'#4ade80'}}>{lp.response_time?lp.response_time.toFixed(0):'—'}<span style={{fontSize:11}}>ms</span></div>
                </div>
                {lp.timestamp && <div style={{background:'#07111e',borderRadius:8,padding:12,textAlign:'center'}}>
                  <div style={{fontSize:10,color:'#9aa4b2',marginBottom:4}}>Последняя проверка</div>
                  <div style={{fontSize:13,fontWeight:600,color:'#fff'}}>{new Date(lp.timestamp*1000).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
                </div>}
              </div>

              {/* SSL информация */}
              {ssl && (
                <div style={{background:'#07111e',borderRadius:8,padding:12,marginBottom:16}}>
                  <div style={{fontSize:11,color:'#9aa4b2',marginBottom:8,fontWeight:600}}>🔒 SSL / TLS</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,fontSize:12}}>
                    <div><span style={{color:'#9aa4b2'}}>Статус:</span> <span style={{color:ssl.valid?'#4ade80':'#ef4444',fontWeight:600}}>{ssl.valid?'✅ Валидный':'❌ Невалидный'}</span></div>
                    {ssl.issuer && <div><span style={{color:'#9aa4b2'}}>Издатель:</span> <span style={{color:'#fff'}}>{ssl.issuer}</span></div>}
                    {ssl.subject && <div><span style={{color:'#9aa4b2'}}>Домен:</span> <span style={{color:'#fff'}}>{ssl.subject}</span></div>}
                    {ssl.expires && <div><span style={{color:'#9aa4b2'}}>Истекает:</span> <span style={{color:ssl.days_left<30?'#ef4444':ssl.days_left<90?'#facc15':'#4ade80'}}>{new Date(ssl.expires).toLocaleDateString('ru-RU')}</span></div>}
                    {ssl.days_left!=null && <div><span style={{color:'#9aa4b2'}}>Осталось:</span> <span style={{color:ssl.days_left<30?'#ef4444':ssl.days_left<90?'#facc15':'#4ade80',fontWeight:600}}>{ssl.days_left} дн.</span></div>}
                  </div>
                </div>
              )}

              {/* История проверок */}
              {websiteProbes.length > 0 && (
                <div style={{background:'#07111e',borderRadius:8,padding:12,marginBottom:16}}>
                  <div style={{fontSize:11,color:'#9aa4b2',marginBottom:8,fontWeight:600}}>Последние проверки</div>
                  <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:180,overflowY:'auto'}}>
                    {websiteProbes.slice(0,10).map((probe,i) => {
                      const p = probe.payload || probe
                      return (
                        <div key={i} style={{display:'flex',alignItems:'center',gap:8,fontSize:11,padding:'4px 6px',borderRadius:4,background:'#0a1929'}}>
                          <span style={{width:6,height:6,borderRadius:'50%',background:p.status==='up'?'#4ade80':'#ef4444'}}/>
                          <span style={{color:p.status==='up'?'#4ade80':'#ef4444',fontWeight:600,minWidth:36}}>{p.status_code}</span>
                          <span style={{color:'#fff',flex:1}}>{p.response_time?.toFixed(0)||'—'}ms</span>
                          <span style={{color:'#9aa4b2'}}>{p.timestamp?new Date(p.timestamp*1000).toLocaleString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):''}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {websiteProbes.length === 0 && <div style={{color:'#9aa4b2',fontSize:11,textAlign:'center',padding:8}}>Загрузка истории проверок...</div>}

              <div style={{display:'flex',justifyContent:'space-between',marginTop:12}}>
                <Link href="/websites" style={{fontSize:12,color:'#6c5ce7',textDecoration:'none'}}>Открыть страницу сайтов →</Link>
                <button onClick={()=>setSelectedWebsite(null)} style={{padding:'6px 16px',borderRadius:6,border:'1px solid #1a2940',background:'#0d1b2e',color:'#9aa4b2',cursor:'pointer',fontSize:12}}>Закрыть</button>
              </div>
            </div>
          </div>
        )
      })()}

    </ProtectedRoute>
  )
}
