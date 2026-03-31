import {useEffect, useState, useRef} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'

function AlertBadge({severity}){
  const colors = {critical:'#ef4444',warning:'#facc15',info:'#3b82f6',resolved:'#4ade80'}
  const labels = {critical:'Критично',warning:'Предупреждение',info:'Информация',resolved:'Решено'}
  return <span style={{display:'inline-block',padding:'2px 8px',borderRadius:4,background:colors[severity]||colors.info,color:'#000',fontSize:11,fontWeight:600}}>{labels[severity]||severity}</span>
}

function StatBox({label, value, color, icon}) {
  return (
    <div className="card" style={{padding:16,textAlign:'center'}}>
      <div style={{fontSize:24,marginBottom:4,opacity:0.2}}>{icon}</div>
      <div style={{fontSize:28,fontWeight:700,color,lineHeight:1}}>{value}</div>
      <div style={{fontSize:11,color:'#9aa4b2',marginTop:6}}>{label}</div>
    </div>
  )
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [stats, setStats] = useState({total:0,active:0,critical:0,warning:0,resolved:0})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all') // all, active, critical, warning, resolved
  const [alertSearch, setAlertSearch] = useState('')
  const wsRef = useRef(null)

  const loadAlerts = async () => {
    try {
      setError(null)
      const {default: apiFetch} = await import('../lib/api')
      const [alertsRes, statsRes] = await Promise.all([
        apiFetch('/api/alerts?limit=100'),
        apiFetch('/api/alerts/stats')
      ])
      setAlerts(alertsRes.alerts || [])
      setStats(statsRes || {total:0,active:0,critical:0,warning:0,resolved:0})
    } catch(err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAlerts()
    const interval = setInterval(loadAlerts, 10000)
    return () => clearInterval(interval)
  }, [])

  // WebSocket for real-time alerts
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || ''
    const wsUrl = base.replace('http', 'ws') + '/ws'
    try {
      wsRef.current = new WebSocket(wsUrl)
      wsRef.current.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if(msg.alert) { loadAlerts() }
        } catch(e) {}
      }
    } catch(e) {}
    return () => { if(wsRef.current) wsRef.current.close() }
  }, [])

  async function resolveAlert(alertId) {
    try {
      const {default: apiFetch} = await import('../lib/api')
      await apiFetch(`/api/alerts/${alertId}/resolve`, {method: 'POST'})
      await loadAlerts()
    } catch(err) { setError('Ошибка при разрешении алерта') }
  }

  async function clearResolved() {
    if(!confirm('Удалить все разрешённые алерты?')) return
    try {
      const {default: apiFetch} = await import('../lib/api')
      await apiFetch('/api/alerts', {method: 'DELETE'})
      await loadAlerts()
    } catch(err) { setError('Ошибка очистки') }
  }

  const filtered = alerts.filter(a => {
    if(filter === 'all') {} 
    else if(filter === 'active') { if(!a.is_active) return false }
    else if(filter === 'resolved') { if(a.is_active) return false }
    else { if(a.severity !== filter) return false }
    if(alertSearch.trim()) {
      const q = alertSearch.toLowerCase()
      return (a.title||'').toLowerCase().includes(q) || (a.message||'').toLowerCase().includes(q) || (a.target_name||'').toLowerCase().includes(q) || (a.category||'').toLowerCase().includes(q)
    }
    return true
  })

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <div className="page" style={{maxWidth:'100%'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h1 style={{margin:0}}>Алерты</h1>
          <div style={{display:'flex',gap:8}}>
            <button onClick={loadAlerts} style={{padding:'6px 14px',borderRadius:4,border:'1px solid #1a2940',background:'#0d1b2e',color:'#9aa4b2',cursor:'pointer',fontSize:12}}>Обновить</button>
            <button onClick={clearResolved} style={{padding:'6px 14px',borderRadius:4,border:'1px solid #ef444440',background:'#ef444410',color:'#ef4444',cursor:'pointer',fontSize:12}}>Очистить решённые</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
          <StatBox label="Всего" value={stats.total} color="#fff" icon="📋"/>
          <StatBox label="Активных" value={stats.active} color={stats.active>0?'#ef4444':'#4ade80'} icon="🔔"/>
          <StatBox label="Критичных" value={stats.critical} color={stats.critical>0?'#ef4444':'#9aa4b2'} icon="🚨"/>
          <StatBox label="Предупреждений" value={stats.warning} color={stats.warning>0?'#facc15':'#9aa4b2'} icon="⚠️"/>
          <StatBox label="Решённых" value={stats.resolved} color="#4ade80" icon="✅"/>
        </div>

        {/* Filter tabs */}
        <div style={{display:'flex',gap:6,marginBottom:16,alignItems:'center'}}>
          {[{id:'all',l:'Все'},{id:'active',l:'Активные'},{id:'critical',l:'Критичные'},{id:'warning',l:'Предупреждения'},{id:'resolved',l:'Решённые'}].map(f=>(
            <button key={f.id} onClick={()=>setFilter(f.id)} style={{padding:'6px 14px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:filter===f.id?'#6c5ce730':'#0d1b2e',color:filter===f.id?'#6c5ce7':'#9aa4b2'}}>{f.l} {f.id==='all'?`(${alerts.length})`:''}</button>
          ))}
          <div style={{flex:1}}/>
          <input value={alertSearch} onChange={e=>setAlertSearch(e.target.value)} placeholder="🔍 Поиск алертов..." style={{padding:'6px 10px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:12,width:220,outline:'none'}}/>
        </div>

        {loading && <div style={{color:'#9aa4b2',fontSize:13,padding:20,textAlign:'center'}}>Загрузка...</div>}
        {error && <div style={{color:'#ef4444',fontSize:13,padding:12,background:'#ef444410',borderRadius:6,marginBottom:12}}>{error}</div>}

        {!loading && filtered.length===0 && (
          <div className="card" style={{padding:40,textAlign:'center'}}>
            <div style={{fontSize:40,marginBottom:12,opacity:0.2}}>🔔</div>
            <div style={{color:'#9aa4b2',fontSize:14}}>Нет алертов для отображения</div>
          </div>
        )}

        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filtered.map((a, i) => {
            const sevColor = {critical:'#ef4444',warning:'#facc15',info:'#3b82f6'}[a.severity] || '#9aa4b2'
            return (
              <div key={a.id||i} className="card" style={{padding:'14px 16px',borderLeft:`3px solid ${a.is_active?sevColor:'#4ade80'}`,opacity:a.is_active?1:0.6}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <AlertBadge severity={a.is_active?a.severity:'resolved'} />
                      <span style={{fontSize:10,color:'#9aa4b2',background:'#1a2940',padding:'2px 6px',borderRadius:3}}>{a.category||'system'}</span>
                      <span style={{fontSize:10,color:'#9aa4b2'}}>{a.target_name||a.target_id||''}</span>
                    </div>
                    <div style={{fontSize:14,fontWeight:500,color:'#fff',marginBottom:4}}>{a.title||'Алерт'}</div>
                    <div style={{fontSize:12,color:'#9aa4b2',marginBottom:6}}>{a.message||''}</div>
                    <div style={{display:'flex',gap:16,fontSize:11,color:'#9aa4b2'}}>
                      <span>Создан: {a.created_at?new Date(a.created_at).toLocaleString('ru-RU'):'—'}</span>
                      {a.resolved_at && <span>Решён: {new Date(a.resolved_at).toLocaleString('ru-RU')}</span>}
                      {a.metric_key && <span>{a.metric_key}: {a.metric_value!=null?typeof a.metric_value==='number'?a.metric_value.toFixed(1):a.metric_value:'—'} (порог: {a.threshold})</span>}
                    </div>
                  </div>
                  {a.is_active && (
                    <button onClick={()=>resolveAlert(a.id)} style={{padding:'6px 12px',borderRadius:4,border:'1px solid #4ade8040',background:'#4ade8010',color:'#4ade80',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>Решить</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      </div>
    </ProtectedRoute>
  )
}
