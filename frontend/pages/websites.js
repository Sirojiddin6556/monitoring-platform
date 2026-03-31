import {useEffect, useState, useMemo, useRef} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

function StatusBadge({status}){
  const colors = {up:'#4ade80', degraded:'#facc15', down:'#ef4444', unknown:'#9aa4b2'}
  return <span style={{display:'inline-block',width:10,height:10,borderRadius:'50%',background:colors[status]||colors.unknown,marginRight:6}}></span>
}

export default function Websites() {
  const [sites, setSites] = useState([])
  const [selected, setSelected] = useState(null)
  const [probes, setProbes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const wsRef = useRef(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({id:'', name:'', url:''})
  const [addError, setAddError] = useState(null)
  const [addLoading, setAddLoading] = useState(false)
  const [siteSearch, setSiteSearch] = useState('')
  const [siteStatusFilter, setSiteStatusFilter] = useState('all')

  const loadSites = async () => {
    setLoading(true)
    setError(null)
    try {
      const {default: apiFetch} = await import('../lib/api')
      const d = await apiFetch('/api/websites')
      setSites(d.websites || [])
    } catch(e) {
      setError('Ошибка загрузки сайтов')
      setSites([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSites() }, [])

  function loadProbes(id) {
    import('../lib/api').then(({default: apiFetch})=>
      apiFetch(`/api/websites/${id}/probes`).then(d => setProbes(d.probes || [])).catch(()=>setProbes([]))
    )
  }

  async function handleAddSite(e) {
    e.preventDefault()
    setAddError(null)
    if(!addForm.id.trim() || !addForm.name.trim() || !addForm.url.trim()) { setAddError('Все поля обязательны'); return }
    setAddLoading(true)
    try {
      const {default: apiFetch} = await import('../lib/api')
      const res = await apiFetch('/api/websites', {
        method: 'POST',
        body: JSON.stringify({id: addForm.id.trim(), name: addForm.name.trim(), url: addForm.url.trim()})
      })
      if(res.detail) { setAddError(res.detail); return }
      setAddForm({id:'', name:'', url:''})
      setShowAdd(false)
      await loadSites()
    } catch(err) { setAddError(err.message || 'Ошибка') }
    finally { setAddLoading(false) }
  }

  async function handleDeleteSite(siteId) {
    if(!confirm('Удалить сайт ' + siteId + '?')) return
    try {
      const {default: apiFetch} = await import('../lib/api')
      await apiFetch(`/api/websites/${siteId}`, {method: 'DELETE'})
      if(selected?.id === siteId) { setSelected(null); setProbes([]) }
      await loadSites()
    } catch(err) { setError('Ошибка удаления') }
  }

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || ''
    const wsUrl = base.replace('http', 'ws') + '/ws'
    try {
      wsRef.current = new WebSocket(wsUrl)
      wsRef.current.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if(msg.probe) {
            const pl = msg.probe.payload || msg.probe
            if(pl.website_id) {
              setSites(prev => prev.map(s => s.id === pl.website_id ? {...s, last_probe: pl} : s))
              if(selected && pl.website_id === selected.id) {
                setProbes(prev => [...prev.slice(-99), {payload: pl, received_at: new Date().toISOString()}])
              }
            }
          }
        } catch(e) { }
      }
    } catch(e) { }
    return () => { if(wsRef.current) wsRef.current.close() }
  }, [selected])
  const chartData = useMemo(()=>{
    return probes.map(p => {
      const pl = p.payload || {}
      const val = pl.response_time ?? null
      const t = p.received_at ? new Date(p.received_at) : new Date()
      return {time: t.toLocaleTimeString(), response_time: typeof val==='number'? val : (Number(val)||null)}
    }).filter(p=>p.response_time!==null)
  },[probes])

  return (
    <ProtectedRoute>
      <div className="app-shell">
      <Sidebar />
      <div className="page">
        <h1>Websites</h1>
        <div style={{display:'flex',gap:16}}>
          <div className="list-panel card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <h4 style={{margin:0}}>Сайты ({sites.length})</h4>
              <button onClick={()=>setShowAdd(!showAdd)} style={{background:'#00d4ff',color:'#000',border:'none',borderRadius:4,padding:'4px 10px',cursor:'pointer',fontSize:12,fontWeight:600}}>{showAdd?'✕':'+ Добавить'}</button>
            </div>
            <input value={siteSearch} onChange={e=>setSiteSearch(e.target.value)} placeholder="🔍 Поиск сайта..." style={{width:'100%',padding:'5px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:11,marginBottom:6,outline:'none',boxSizing:'border-box'}}/>
            <div style={{display:'flex',gap:3,marginBottom:8}}>
              {[{id:'all',l:'Все'},{id:'up',l:'Online'},{id:'down',l:'Offline'}].map(f=>(
                <button key={f.id} onClick={()=>setSiteStatusFilter(f.id)} style={{flex:1,padding:'3px 0',borderRadius:4,border:'none',cursor:'pointer',fontSize:10,fontWeight:600,background:siteStatusFilter===f.id?'#00d4ff30':'#0d1b2e',color:siteStatusFilter===f.id?'#00d4ff':'#9aa4b2'}}>{f.l}</button>
              ))}
            </div>
            {showAdd && (
              <form onSubmit={handleAddSite} style={{marginBottom:12,padding:10,background:'#0a1a2e60',borderRadius:6,display:'flex',flexDirection:'column',gap:6}}>
                <input placeholder="ID (напр. site-3)" value={addForm.id} onChange={e=>setAddForm({...addForm,id:e.target.value})} style={{padding:'6px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#071226',color:'#fff',fontSize:12}} />
                <input placeholder="Название сайта" value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})} style={{padding:'6px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#071226',color:'#fff',fontSize:12}} />
                <input placeholder="URL (https://...)" value={addForm.url} onChange={e=>setAddForm({...addForm,url:e.target.value})} style={{padding:'6px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#071226',color:'#fff',fontSize:12}} />
                {addError && <div style={{color:'#ef4444',fontSize:11}}>{addError}</div>}
                <button type="submit" disabled={addLoading} style={{padding:'6px 0',borderRadius:4,border:'none',background:'#00d4ff',color:'#000',cursor:'pointer',fontSize:12,fontWeight:600}}>{addLoading?'...':'Добавить'}</button>
              </form>
            )}
            {loading && <div style={{color:'var(--muted)',fontSize:13}}>Загрузка...</div>}
            {error && <div style={{color:'#ef4444',fontSize:13}}>{error}</div>}
            <div>
              {sites.filter(s=>{
                const status = s.last_probe?.status || 'unknown'
                if(siteStatusFilter==='up' && status!=='up') return false
                if(siteStatusFilter==='down' && status==='up') return false
                if(siteSearch.trim()) {
                  const q = siteSearch.toLowerCase()
                  return (s.name||'').toLowerCase().includes(q) || (s.url||'').toLowerCase().includes(q) || (s.id||'').toLowerCase().includes(q)
                }
                return true
              }).map(s => (
                <div key={s.id} className="list-item" style={{display:'flex',alignItems:'center',gap:4}}>
                  <button onClick={() => { setSelected(s); loadProbes(s.id) }} style={{flex:1,opacity: selected?.id === s.id ? 1 : 0.7,textAlign:'left'}}>
                    <StatusBadge status={s.last_probe?.status || 'unknown'} />{s.name}
                  </button>
                  <button onClick={()=>handleDeleteSite(s.id)} title="Удалить" style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14,padding:'2px 4px',opacity:0.6}}>✕</button>
                </div>
              ))}
            </div>
          </div>

          <div style={{flex:1,display:'flex',flexDirection:'column',gap:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h2 style={{margin:0}}>Selected: {selected ? selected.name : '—'}</h2>
            </div>

            <div className="card" style={{padding:16}}>
              <h4 style={{margin:'0 0 12px'}}>Время ответа (мс)</h4>
              <div style={{height:220}}>
                {chartData.length===0 ? <div style={{textAlign:'center',color:'var(--muted)',padding:60}}>Выберите сайт для отображения графика</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{top:10,right:30,left:0,bottom:0}}>
                      <defs>
                        <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.7}/>
                          <stop offset="100%" stopColor="#00d4ff" stopOpacity={0.04}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.06}/>
                      <XAxis dataKey="time" tick={{fill:'var(--muted)',fontSize:11}}/>
                      <YAxis tick={{fill:'var(--muted)',fontSize:11}}/>
                      <Tooltip contentStyle={{background:'#071226',border:'1px solid #00d4ff',borderRadius:6}} formatter={(v)=>v.toFixed(2)+' мс'}/>
                      <Area type="monotone" dataKey="response_time" stroke="#00d4ff" strokeWidth={2} fill="url(#g2)" isAnimationActive={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {selected && (
              <div className="card" style={{padding:16}}>
                <div style={{fontSize:11,color:'var(--muted)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>Информация о сайте</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:13}}>
                  <div><span style={{color:'var(--muted)'}}>ID:</span> {selected.id}</div>
                  <div><span style={{color:'var(--muted)'}}>Статус:</span> <StatusBadge status={selected.last_probe?.status || 'unknown'}/>{selected.last_probe?.status || '—'}</div>
                  <div><span style={{color:'var(--muted)'}}>URL:</span> {selected.url || '—'}</div>
                  <div><span style={{color:'var(--muted)'}}>Время ответа:</span> {selected.last_probe?.response_time ? selected.last_probe.response_time.toFixed(0) + ' мс' : '—'}</div>
                </div>
              </div>
            )}

            {selected?.ssl && (
              <div className="card" style={{padding:16}}>
                <div style={{fontSize:11,color:'var(--muted)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>SSL-сертификат</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:13}}>
                  <div><span style={{color:'var(--muted)'}}>Статус:</span> <span style={{color:selected.ssl.valid?'#4ade80':'#ef4444',fontWeight:600}}>{selected.ssl.valid?'Валидный':'Невалидный'}</span></div>
                  <div><span style={{color:'var(--muted)'}}>Издатель:</span> {selected.ssl.issuer || '—'}</div>
                  <div><span style={{color:'var(--muted)'}}>Истекает:</span> {selected.ssl.expires || '—'}</div>
                  <div>
                    <span style={{color:'var(--muted)'}}>Осталось дней:</span>{' '}
                    <span style={{color:selected.ssl.days_left<30?selected.ssl.days_left<7?'#ef4444':'#facc15':'#4ade80',fontWeight:600}}>
                      {selected.ssl.days_left != null ? selected.ssl.days_left : '—'}
                    </span>
                  </div>
                </div>
                {selected.ssl.days_left != null && selected.ssl.days_left < 30 && (
                  <div style={{marginTop:10,padding:'8px 12px',background:selected.ssl.days_left<7?'#ef444420':'#facc1520',borderRadius:6,borderLeft:`3px solid ${selected.ssl.days_left<7?'#ef4444':'#facc15'}`,fontSize:12,color:selected.ssl.days_left<7?'#ef4444':'#facc15'}}>
                    {selected.ssl.days_left<7?'Сертификат истекает менее чем через 7 дней!':'Сертификат истекает менее чем через 30 дней'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </ProtectedRoute>
  )
}
