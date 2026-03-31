import {useEffect, useState, useRef} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import {useRouter} from 'next/router'
import Link from 'next/link'

function StatCard({title, value, sub, color='#6c5ce7', icon}) {
  return (
    <div className="card" style={{padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontSize:11,color:'#9aa4b2',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>{title}</div>
          <div style={{fontSize:28,fontWeight:700,color,lineHeight:1}}>{value}</div>
          {sub && <div style={{fontSize:11,color:'#9aa4b2',marginTop:6}}>{sub}</div>}
        </div>
        {icon && <div style={{fontSize:28,opacity:0.15}}>{icon}</div>}
      </div>
    </div>
  )
}

export default function Home() {
  const [ping, setPing] = useState(null)
  const [servers, setServers] = useState([])
  const [websites, setWebsites] = useState([])
  const [alertStats, setAlertStats] = useState({total:0,active:0,critical:0,warning:0,resolved:0})
  const [wsConnected, setWsConnected] = useState(false)
  const [dashServerFilter, setDashServerFilter] = useState('all')
  const [dashWebFilter, setDashWebFilter] = useState('all')
  const wsRef = useRef(null)
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if(!token) { router.push('/auth/login'); return }

    import('../lib/api').then(({default: apiFetch}) => {
      apiFetch('/api/ping').then(d => setPing(d)).catch(()=>setPing({error:'failed'}))
      apiFetch('/api/servers').then(d => setServers(d.servers||[])).catch(()=>{})
      apiFetch('/api/websites').then(d => setWebsites(d.websites||[])).catch(()=>{})
      apiFetch('/api/alerts/stats').then(d => setAlertStats(d||{})).catch(()=>{})
    })
  }, [router])

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || ''
    const wsUrl = base.replace('http', 'ws') + '/ws'
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
              setServers(prev => prev.map(s => s.id === pl.server_id ? {...s, status: pl.status || s.status, last_ping: pl.value ?? s.last_ping, last_metrics: pl.metrics || s.last_metrics} : s))
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
  const webUp = websites.filter(w=>w.status==='ok').length
  const webDown = websites.filter(w=>w.status==='down').length

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
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14,marginBottom:24}}>
            <StatCard title="Серверы" value={servers.length} sub={`${srvUp} онлайн · ${srvDown} оффлайн`} color="#6c5ce7" icon="🖥️"/>
            <StatCard title="Веб-сайты" value={websites.length} sub={`${webUp} онлайн · ${webDown} оффлайн`} color="#00d4ff" icon="🌐"/>
            <StatCard title="Алерты" value={alertStats.active||0} sub={`${alertStats.critical||0} критичных · ${alertStats.warning||0} предупр.`} color={alertStats.critical>0?'#ef4444':alertStats.active>0?'#facc15':'#4ade80'} icon="🔔"/>
            <StatCard title="Доступность серверов" value={servers.length?Math.round(srvUp/servers.length*100)+'%':'—'} sub="за текущий период" color={srvUp===servers.length?'#4ade80':'#facc15'} icon="📊"/>
            <StatCard title="Доступность сайтов" value={websites.length?Math.round(webUp/websites.length*100)+'%':'—'} sub="за текущий период" color={webUp===websites.length?'#4ade80':'#facc15'} icon="📈"/>
          </div>

          {/* Серверы — быстрый обзор */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:24}}>
            <div className="card" style={{padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <h3 style={{margin:0,fontSize:14}}>Серверы</h3>
                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                  {[{id:'all',l:'Все'},{id:'ok',l:'Online'},{id:'down',l:'Offline'}].map(f=>(
                    <button key={f.id} onClick={()=>setDashServerFilter(f.id)} style={{padding:'2px 8px',borderRadius:4,border:'none',cursor:'pointer',fontSize:10,fontWeight:600,background:dashServerFilter===f.id?'#6c5ce730':'#0d1b2e',color:dashServerFilter===f.id?'#6c5ce7':'#9aa4b2'}}>{f.l}</button>
                  ))}
                  <Link href="/servers" style={{fontSize:11,color:'#6c5ce7',textDecoration:'none',marginLeft:4}}>Открыть →</Link>
                </div>
              </div>
              {servers.length === 0 ? (
                <div style={{color:'#9aa4b2',fontSize:12,padding:16,textAlign:'center'}}>Нет серверов</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {servers.filter(s=>dashServerFilter==='all'?true:s.status===dashServerFilter).slice(0,6).map(s => {
                    const m = s.last_metrics || {}
                    return (
                      <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:4,background:'#07111e'}}>
                        <span style={{width:6,height:6,borderRadius:'50%',background:s.status==='ok'?'#4ade80':s.status==='down'?'#ef4444':'#9aa4b2'}}/>
                        <span style={{flex:1,fontSize:12,color:'#fff'}}>{s.name}</span>
                        {m.cpu && <span style={{fontSize:10,color:'#9aa4b2'}}>CPU {m.cpu.value}%</span>}
                        {m.ram && <span style={{fontSize:10,color:'#9aa4b2'}}>RAM {m.ram.value}%</span>}
                        <span style={{fontSize:10,color:s.status==='ok'?'#4ade80':'#ef4444'}}>{s.last_ping!=null?s.last_ping.toFixed(0)+'ms':'—'}</span>
                      </div>
                    )
                  })}
                  {servers.filter(s=>dashServerFilter==='all'?true:s.status===dashServerFilter).length>6 && <div style={{fontSize:11,color:'#9aa4b2',textAlign:'center',padding:4}}>...и ещё {servers.filter(s=>dashServerFilter==='all'?true:s.status===dashServerFilter).length-6}</div>}
                </div>
              )}
            </div>

            <div className="card" style={{padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <h3 style={{margin:0,fontSize:14}}>Веб-сайты</h3>
                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                  {[{id:'all',l:'Все'},{id:'ok',l:'Online'},{id:'down',l:'Offline'}].map(f=>(
                    <button key={f.id} onClick={()=>setDashWebFilter(f.id)} style={{padding:'2px 8px',borderRadius:4,border:'none',cursor:'pointer',fontSize:10,fontWeight:600,background:dashWebFilter===f.id?'#00d4ff30':'#0d1b2e',color:dashWebFilter===f.id?'#00d4ff':'#9aa4b2'}}>{f.l}</button>
                  ))}
                  <Link href="/websites" style={{fontSize:11,color:'#6c5ce7',textDecoration:'none',marginLeft:4}}>Открыть →</Link>
                </div>
              </div>
              {websites.length === 0 ? (
                <div style={{color:'#9aa4b2',fontSize:12,padding:16,textAlign:'center'}}>Нет сайтов</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {websites.filter(w=>dashWebFilter==='all'?true:w.status===dashWebFilter).slice(0,6).map(w => (
                    <div key={w.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:4,background:'#07111e'}}>
                      <span style={{width:6,height:6,borderRadius:'50%',background:w.status==='ok'?'#4ade80':w.status==='down'?'#ef4444':'#9aa4b2'}}/>
                      <span style={{flex:1,fontSize:12,color:'#fff'}}>{w.name}</span>
                      <span style={{fontSize:10,color:'#9aa4b2'}}>{w.url}</span>
                      <span style={{fontSize:10,color:w.status==='ok'?'#4ade80':'#ef4444'}}>{w.status||'—'}</span>
                    </div>
                  ))}
                  {websites.filter(w=>dashWebFilter==='all'?true:w.status===dashWebFilter).length>6 && <div style={{fontSize:11,color:'#9aa4b2',textAlign:'center',padding:4}}>...и ещё {websites.filter(w=>dashWebFilter==='all'?true:w.status===dashWebFilter).length-6}</div>}
                </div>
              )}
            </div>
          </div>

          <div style={{color:'#9aa4b2',fontSize:12,textAlign:'center',padding:16}}>
            Данные обновляются в реальном времени через WebSocket
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
