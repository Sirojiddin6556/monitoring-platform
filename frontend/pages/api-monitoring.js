import {useEffect, useState} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import HealthCheckPanel from '../components/HealthCheckPanel'
import apiFetch from '../lib/api'

function StatusBadge({status}){
  const color = status === 'up' ? '#4ade80' : status === 'degraded' ? '#facc15' : '#ef4444'
  const label = status === 'up' ? 'UP' : status === 'degraded' ? 'DEGRADED' : 'DOWN'
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:999,background:color+'22',color,fontSize:12,fontWeight:700}}>
      <span style={{width:7,height:7,borderRadius:'50%',background:color}} />{label}
    </span>
  )
}

function StatCard({title, value, sub, color='#6c5ce7'}){
  return (
    <div className="card" style={{padding:14}}>
      <div style={{fontSize:11,color:'#9aa4b2',textTransform:'uppercase',marginBottom:8}}>{title}</div>
      <div style={{fontSize:26,fontWeight:700,color,lineHeight:1}}>{value}</div>
      {sub ? <div style={{fontSize:11,color:'#9aa4b2',marginTop:6}}>{sub}</div> : null}
    </div>
  )
}

export default function ApiMonitoringPage(){
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null)
  const [recent, setRecent] = useState([])
  const [manualTarget, setManualTarget] = useState('')

  const load = async ({silent=false} = {}) => {
    if(!silent) setLoading(true)
    setError('')
    try {

      const data = await apiFetch('/api/api-monitoring/status')
      setCurrent(data.current || null)
      setRecent(data.recent || [])
    } catch (e) {
      setError(e.message || 'Не удалось загрузить мониторинг API')
    } finally {
      if(!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(() => load({silent:true}), 15000)
    return () => clearInterval(t)
  }, [])

  const runCheckNow = async () => {
    setRefreshing(true)
    try {

      await apiFetch('/api/api-monitoring/check', {method:'POST'})
      await load({silent:true})
    } catch (e) {
      setError(e.message || 'Не удалось запустить ручную проверку')
    } finally {
      setRefreshing(false)
    }
  }

  const checks = current?.checks || []
  const summary = current?.summary || {total:0,up:0,down:0,avg_latency_ms:0,uptime_seconds:0}
  const uptimeHours = summary.uptime_seconds ? (summary.uptime_seconds / 3600).toFixed(1) : '0.0'

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="app-shell">
        <Sidebar />
        <div className="page">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
            <div>
              <h1 style={{margin:'0 0 6px 0'}}>API Мониторинг</h1>
              <div style={{fontSize:12,color:'#9aa4b2'}}>Проверка доступности endpoint-ов backend в реальном времени</div>
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              {current?.status ? <StatusBadge status={current.status} /> : null}
              <button onClick={runCheckNow} disabled={refreshing} style={{padding:'8px 12px',border:'none',borderRadius:6,background:refreshing?'#64748b':'#00d4ff',color:'#001018',fontWeight:700,cursor:refreshing?'not-allowed':'pointer'}}>
                {refreshing ? 'Проверка...' : 'Проверить сейчас'}
              </button>
            </div>
          </div>

          {error ? <div className="card" style={{border:'1px solid #ef444480',color:'#ef4444',marginBottom:12}}>{error}</div> : null}

          {loading ? (
            <div className="card" style={{padding:20,color:'#9aa4b2'}}>Загрузка данных API-мониторинга...</div>
          ) : (
            <>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:14}}>
                <StatCard title="Endpoint-ов" value={summary.total} sub={`Base: ${current?.base_url || '—'}`} color="#6c5ce7" />
                <StatCard title="Доступно" value={summary.up} sub="HTTP < 500" color="#4ade80" />
                <StatCard title="Недоступно" value={summary.down} sub="Ошибка/timeout" color="#ef4444" />
                <StatCard title="Средняя задержка" value={`${summary.avg_latency_ms || 0} ms`} sub={`Uptime: ${uptimeHours} ч`} color="#00d4ff" />
              </div>

              <div className="card" style={{marginBottom:12,padding:12}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Текущая проверка endpoint-ов</div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr style={{textAlign:'left',color:'#9aa4b2'}}>
                        <th style={{padding:'8px 6px'}}>Endpoint</th>
                        <th style={{padding:'8px 6px'}}>URL</th>
                        <th style={{padding:'8px 6px'}}>HTTP</th>
                        <th style={{padding:'8px 6px'}}>Latency</th>
                        <th style={{padding:'8px 6px'}}>Статус</th>
                        <th style={{padding:'8px 6px'}}>Ошибка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checks.map((c, i) => (
                        <tr key={`${c.endpoint}-${i}`} style={{borderTop:'1px solid #1a2940'}}>
                          <td style={{padding:'8px 6px',fontWeight:600}}>{c.endpoint}</td>
                          <td style={{padding:'8px 6px',color:'#9aa4b2'}}>{c.url}</td>
                          <td style={{padding:'8px 6px'}}>{c.status_code ?? '—'}</td>
                          <td style={{padding:'8px 6px'}}>{c.latency_ms} ms</td>
                          <td style={{padding:'8px 6px'}}>{c.ok ? <span style={{color:'#4ade80'}}>OK</span> : <span style={{color:'#ef4444'}}>FAIL</span>}</td>
                          <td style={{padding:'8px 6px',color:'#fca5a5'}}>{c.error || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card" style={{padding:12,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>История (последние 20 проверок)</div>
                <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:280,overflow:'auto'}}>
                  {[...recent].reverse().map((row, idx) => (
                    <div key={`${row.timestamp}-${idx}`} style={{display:'grid',gridTemplateColumns:'160px 120px 120px 1fr',gap:8,padding:'8px 10px',borderRadius:6,background:'#07111e'}}>
                      <div style={{fontSize:12,color:'#9aa4b2'}}>{new Date((row.timestamp || 0) * 1000).toLocaleString()}</div>
                      <div><StatusBadge status={row.status} /></div>
                      <div style={{fontSize:12,color:'#9aa4b2'}}>{row.summary?.up || 0}/{row.summary?.total || 0} UP</div>
                      <div style={{fontSize:12,color:'#9aa4b2'}}>avg {row.summary?.avg_latency_ms || 0} ms</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card" style={{padding:12}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Ручная проверка произвольного хоста</div>
                <input
                  value={manualTarget}
                  onChange={e => setManualTarget(e.target.value)}
                  placeholder="Хост или URL, например example.com"
                  style={{width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid #1a2940',background:'#0d1726',color:'#e2e8f0',fontSize:13,marginBottom:12,boxSizing:'border-box'}}
                />
                <HealthCheckPanel target={manualTarget} title="Проверка доступности" />
              </div>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
