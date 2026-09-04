import {useEffect, useState, useRef} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import TimeRangeFilter from '../components/TimeRangeFilter'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import apiFetch from '../lib/api'

const PROTO_CONFIGS = [
  { key: 'http',    label: 'HTTP',      color: '#00d4ff' },
  { key: 'https',   label: 'HTTPS',     color: '#4ade80' },
  { key: 'icmp',    label: 'ICMP Ping', color: '#a78bfa' },
  { key: 'tcp_443', label: 'TCP 443',   color: '#facc15' },
]

// Длительность пресетов в мс
const PRESET_MS = {
  '5m': 5*60*1000, '15m': 15*60*1000, '30m': 30*60*1000,
  '1h': 60*60*1000, '3h': 3*60*60*1000, '6h': 6*60*60*1000,
  '12h': 12*60*60*1000, '24h': 24*60*60*1000,
}

function effectiveRange(range) {
  if (!range || range.preset === 'all') return { from: null, to: null }
  if (range.preset === 'custom') return { from: range.from, to: range.to }
  const ms = PRESET_MS[range.preset]
  return ms ? { from: Date.now() - ms, to: Date.now() } : { from: range.from, to: range.to }
}

function fmtTime(isoStr) {
  try { return new Date(isoStr).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) }
  catch { return isoStr }
}
function fmtDateTime(isoStr) {
  try { return new Date(isoStr).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'}) }
  catch { return isoStr }
}

function StatusBadge({status}) {
  const colors = {up:'#4ade80', ok:'#4ade80', degraded:'#facc15', down:'#ef4444', unknown:'#9aa4b2'}
  return <span style={{display:'inline-block',width:10,height:10,borderRadius:'50%',background:colors[status]||colors.unknown,marginRight:6}}></span>
}

function UptimePct({pct}) {
  if (pct == null) return null
  const color = pct >= 99.9 ? '#4ade80' : pct >= 99.0 ? '#facc15' : '#ef4444'
  return <span style={{fontSize:10,color,fontWeight:700,minWidth:42,textAlign:'right'}}>{pct.toFixed(1)}%</span>
}

export default function Websites() {
  const [sites, setSites]               = useState([])
  const [selected, setSelected]         = useState(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const wsRef                           = useRef(null)
  const [showAdd, setShowAdd]           = useState(false)
  const [addForm, setAddForm]           = useState({id:'', name:'', url:''})
  const [addError, setAddError]         = useState(null)
  const [addLoading, setAddLoading]     = useState(false)
  const [siteSearch, setSiteSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [slaMap, setSlaMap]             = useState({})
  const [protoHistory, setProtoHistory] = useState({})
  const [protoLoading, setProtoLoading] = useState(false)
  const [timeRange, setTimeRange]       = useState({from:null, to:null, preset:'all'})

  const selectedRef   = useRef(null)
  const timeRangeRef  = useRef({from:null, to:null, preset:'all'})
  const protoIntervalRef = useRef(null)

  useEffect(() => { selectedRef.current  = selected  }, [selected])
  useEffect(() => { timeRangeRef.current = timeRange }, [timeRange])

  // ── Загрузка данных по протоколам ─────────────────────────────────────────
  async function fetchProtoHistory(siteId, range) {
    if (!siteId) return
    setProtoLoading(true)
    try {
      const {from, to} = effectiveRange(range ?? timeRangeRef.current)
      const params = new URLSearchParams({limit: '200'})
      if (from) params.set('from_ts', String(Math.floor(from / 1000)))
      if (to)   params.set('to_ts',   String(Math.floor(to   / 1000)))
      const data = await apiFetch(`/api/websites/${siteId}/protocol-probes?${params}`)
      const protos = data.protocols || {}
      setProtoHistory({
        http:    protos.http    || [],
        https:   protos.https   || [],
        icmp:    protos.icmp    || [],
        tcp_443: protos.tcp_443 || [],
      })
    } catch {
      setProtoHistory({})
    } finally {
      setProtoLoading(false)
    }
  }

  // Перезапускаем поллинг при смене сайта или диапазона
  useEffect(() => {
    if (protoIntervalRef.current) clearInterval(protoIntervalRef.current)
    if (!selected?.id) { setProtoHistory({}); return }

    fetchProtoHistory(selected.id, timeRange)

    // Поллинг каждые 60 с — для кастомных диапазонов тоже (данные могут обновляться)
    protoIntervalRef.current = setInterval(() => {
      const id = selectedRef.current?.id
      if (id) fetchProtoHistory(id, timeRangeRef.current)
    }, 60000)

    return () => clearInterval(protoIntervalRef.current)
  }, [selected?.id, timeRange])

  function handleTimeRangeChange(range) {
    setTimeRange(range)
  }

  // ── Список сайтов ─────────────────────────────────────────────────────────
  const loadSites = async () => {
    setLoading(true); setError(null)
    try {
      const [d, slaRes] = await Promise.all([
        apiFetch('/api/websites'),
        apiFetch('/api/sla/summary').catch(() => ({summary:[]})),
      ])
      setSites(d.websites || [])
      const map = {}
      for (const item of (slaRes.summary || [])) {
        if (item.target_type === 'website') map[item.target_id] = item
      }
      setSlaMap(map)
    } catch {
      setError('Ошибка загрузки сайтов'); setSites([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSites()
    const iv = setInterval(loadSites, 30000)
    return () => clearInterval(iv)
  }, [])

  // ── Добавление / удаление ─────────────────────────────────────────────────
  async function handleAddSite(e) {
    e.preventDefault()
    setAddError(null)
    if (!addForm.id.trim() || !addForm.name.trim() || !addForm.url.trim()) {
      setAddError('Все поля обязательны'); return
    }
    setAddLoading(true)
    try {
      await apiFetch('/api/websites', {
        method: 'POST',
        body: JSON.stringify({id:addForm.id.trim(), name:addForm.name.trim(), url:addForm.url.trim()}),
      })
      setAddForm({id:'', name:'', url:''})
      setShowAdd(false)
      await loadSites()
    } catch(err) { setAddError(err.message || 'Ошибка') }
    finally { setAddLoading(false) }
  }

  async function handleDeleteSite(siteId) {
    if (!confirm('Удалить сайт ' + siteId + '?')) return
    try {
      await apiFetch(`/api/websites/${siteId}`, {method:'DELETE'})
      if (selected?.id === siteId) setSelected(null)
      await loadSites()
    } catch { setError('Ошибка удаления') }
  }

  // ── WebSocket (обновление статусов в списке) ──────────────────────────────
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || ''
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const wsUrl = base.replace('http','ws') + '/ws' + (token ? `?token=${token}` : '')
    try {
      wsRef.current = new WebSocket(wsUrl)
      wsRef.current.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if (msg.probe) {
            const pl = msg.probe.payload || msg.probe
            setSites(prev => prev.map(s => {
              const hit = (pl.website_id && s.id === pl.website_id) || (pl.target && s.url === pl.target)
              return hit ? {...s, last_probe: pl} : s
            }))
          }
        } catch {}
      }
    } catch {}
    return () => { wsRef.current?.close() }
  }, [])

  // ── Рендер ────────────────────────────────────────────────────────────────
  const filteredSites = sites.filter(s => {
    const status = s.last_probe?.status || 'unknown'
    if (statusFilter === 'up'   && status !== 'up') return false
    if (statusFilter === 'down' && status === 'up') return false
    if (siteSearch.trim()) {
      const q = siteSearch.toLowerCase()
      return (s.name||'').toLowerCase().includes(q)
          || (s.url||'').toLowerCase().includes(q)
          || (s.id||'').toLowerCase().includes(q)
    }
    return true
  })

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <div className="page">
          <h1>Веб-сайты</h1>
          <div style={{display:'flex',gap:16}}>

            {/* ── Список ── */}
            <div className="list-panel card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <h4 style={{margin:0}}>Сайты ({sites.length})</h4>
                <button onClick={()=>setShowAdd(!showAdd)} style={{background:'#00d4ff',color:'#000',border:'none',borderRadius:4,padding:'4px 10px',cursor:'pointer',fontSize:12,fontWeight:600}}>
                  {showAdd ? '✕' : '+ Добавить'}
                </button>
              </div>
              <input
                value={siteSearch} onChange={e=>setSiteSearch(e.target.value)}
                placeholder="🔍 Поиск сайта..."
                style={{width:'100%',padding:'5px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:11,marginBottom:6,outline:'none',boxSizing:'border-box'}}
              />
              <div style={{display:'flex',gap:3,marginBottom:8}}>
                {[{id:'all',l:'Все'},{id:'up',l:'Online'},{id:'down',l:'Offline'}].map(f => (
                  <button key={f.id} onClick={()=>setStatusFilter(f.id)} style={{flex:1,padding:'3px 0',borderRadius:4,border:'none',cursor:'pointer',fontSize:10,fontWeight:600,background:statusFilter===f.id?'#00d4ff30':'#0d1b2e',color:statusFilter===f.id?'#00d4ff':'#9aa4b2'}}>
                    {f.l}
                  </button>
                ))}
              </div>

              {showAdd && (
                <form onSubmit={handleAddSite} style={{marginBottom:12,padding:10,background:'#0a1a2e60',borderRadius:6,display:'flex',flexDirection:'column',gap:6}}>
                  <input placeholder="ID (напр. site-3)" value={addForm.id} onChange={e=>setAddForm({...addForm,id:e.target.value})} style={{padding:'6px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#071226',color:'#fff',fontSize:12}}/>
                  <input placeholder="Название сайта"    value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})} style={{padding:'6px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#071226',color:'#fff',fontSize:12}}/>
                  <input placeholder="URL (https://...)" value={addForm.url}  onChange={e=>setAddForm({...addForm,url:e.target.value})}  style={{padding:'6px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#071226',color:'#fff',fontSize:12}}/>
                  {addError && <div style={{color:'#ef4444',fontSize:11}}>{addError}</div>}
                  <button type="submit" disabled={addLoading} style={{padding:'6px 0',borderRadius:4,border:'none',background:'#00d4ff',color:'#000',cursor:'pointer',fontSize:12,fontWeight:600}}>
                    {addLoading ? '...' : 'Добавить'}
                  </button>
                </form>
              )}

              {loading && <div style={{color:'var(--muted)',fontSize:13}}>Загрузка...</div>}
              {error   && <div style={{color:'#ef4444',fontSize:13}}>{error}</div>}

              <div>
                {filteredSites.map(s => (
                  <div key={s.id} className="list-item" style={{display:'flex',alignItems:'center',gap:4}}>
                    <button onClick={() => setSelected(s)} style={{flex:1,opacity:selected?.id===s.id?1:0.7,textAlign:'left'}}>
                      <StatusBadge status={s.last_probe?.status || 'unknown'}/>{s.name}
                    </button>
                    <UptimePct pct={slaMap[s.id]?.uptime_30d}/>
                    <button onClick={()=>handleDeleteSite(s.id)} title="Удалить" style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14,padding:'2px 4px',opacity:0.6}}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Детали ── */}
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:12}}>

              {/* Заголовок + фильтр */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                <div>
                  <h2 style={{margin:0,fontSize:20}}>{selected ? selected.name : '—'}</h2>
                  {selected && <span style={{fontSize:12,color:'#9aa4b2'}}>{selected.url}</span>}
                </div>
                {selected && (
                  <TimeRangeFilter onChange={handleTimeRangeChange} accent="#00d4ff"/>
                )}
              </div>

              {!selected ? (
                <div className="card" style={{padding:60,textAlign:'center'}}>
                  <div style={{fontSize:36,marginBottom:12,opacity:0.3}}>🌐</div>
                  <div style={{color:'#9aa4b2',fontSize:14}}>Выберите сайт из списка слева</div>
                </div>
              ) : (
                <>
                  {/* 2×2 диаграммы */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,position:'relative'}}>
                    {protoLoading && (
                      <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(7,18,38,0.6)',borderRadius:8,zIndex:2}}>
                        <span style={{color:'#9aa4b2',fontSize:12}}>Загрузка...</span>
                      </div>
                    )}
                    {PROTO_CONFIGS.map(proto => {
                      const history = protoHistory[proto.key] || []
                      const last = history[history.length - 1]
                      const statusColor = (last?.status === 'ok' || last?.status === 'up') ? '#4ade80'
                        : last?.status === 'degraded' ? '#facc15'
                        : last?.status ? '#ef4444' : '#9aa4b2'
                      const isEmpty = history.length === 0

                      // Вычисляем min/avg/max для подписи
                      const rts = history.map(p => p.rt).filter(v => v != null)
                      const avg = rts.length ? Math.round(rts.reduce((a,b)=>a+b,0)/rts.length) : null
                      const minRt = rts.length ? Math.min(...rts) : null
                      const maxRt = rts.length ? Math.max(...rts) : null

                      return (
                        <div className="card" key={proto.key} style={{padding:14}}>
                          {/* Заголовок карточки */}
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                            <span style={{fontSize:13,fontWeight:600,color:'#d6deea'}}>{proto.label}</span>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              {last && (
                                <span style={{fontSize:12,fontWeight:700,color:proto.color}}>
                                  {last.rt != null ? `${last.rt} мс` : '—'}
                                </span>
                              )}
                              <span style={{width:7,height:7,borderRadius:'50%',background:statusColor,flexShrink:0}}/>
                            </div>
                          </div>

                          {/* min / avg / max */}
                          {!isEmpty && avg != null && (
                            <div style={{display:'flex',gap:12,marginBottom:6}}>
                              {[['min', minRt],['avg', avg],['max', maxRt]].map(([lbl,val]) => (
                                <span key={lbl} style={{fontSize:10,color:'#9aa4b2'}}>
                                  <span style={{color:'#5a6a7a'}}>{lbl} </span>
                                  <span style={{color:'#c8d1dc',fontWeight:600}}>{val} мс</span>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* График */}
                          <div style={{height:120}}>
                            {isEmpty ? (
                              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#9aa4b2',fontSize:11}}>
                                {protoLoading ? '' : 'Нет данных за выбранный период'}
                              </div>
                            ) : (
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={history} margin={{top:4,right:4,left:-26,bottom:0}}>
                                  <defs>
                                    <linearGradient id={`grad-${proto.key}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%"   stopColor={proto.color} stopOpacity={0.45}/>
                                      <stop offset="100%" stopColor={proto.color} stopOpacity={0.03}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.05}/>
                                  <XAxis
                                    dataKey="time"
                                    tick={{fill:'#9aa4b2',fontSize:9}}
                                    interval="preserveStartEnd"
                                    tickFormatter={fmtTime}
                                  />
                                  <YAxis
                                    tick={{fill:'#9aa4b2',fontSize:9}}
                                    unit=" мс"
                                    width={48}
                                  />
                                  <Tooltip
                                    contentStyle={{background:'#07111e',border:`1px solid ${proto.color}40`,borderRadius:6,fontSize:11}}
                                    formatter={v => v != null ? [`${v} мс`, proto.label] : ['—', proto.label]}
                                    labelFormatter={fmtDateTime}
                                  />
                                  <Area
                                    type="monotone"
                                    dataKey="rt"
                                    stroke={proto.color}
                                    strokeWidth={1.5}
                                    fill={`url(#grad-${proto.key})`}
                                    isAnimationActive={false}
                                    connectNulls={false}
                                    dot={false}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Uptime */}
                  {slaMap[selected.id] && (
                    <div className="card" style={{padding:16}}>
                      <div style={{fontSize:11,color:'var(--muted)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:10}}>Uptime</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                        {[['24 часа','uptime_24h'],['7 дней','uptime_7d'],['30 дней','uptime_30d']].map(([label,key]) => {
                          const pct = slaMap[selected.id][key]
                          const color = pct == null ? '#9aa4b2' : pct >= 99.9 ? '#4ade80' : pct >= 99.0 ? '#facc15' : '#ef4444'
                          return (
                            <div key={key} style={{textAlign:'center',padding:'10px 6px',background:'#07111e',borderRadius:6}}>
                              <div style={{fontSize:16,fontWeight:700,color}}>{pct != null ? pct.toFixed(2)+'%' : '—'}</div>
                              <div style={{fontSize:10,color:'#9aa4b2',marginTop:3}}>{label}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Информация */}
                  <div className="card" style={{padding:16}}>
                    <div style={{fontSize:11,color:'var(--muted)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>Информация о сайте</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:13}}>
                      <div><span style={{color:'var(--muted)'}}>ID:</span> {selected.id}</div>
                      <div><span style={{color:'var(--muted)'}}>Статус:</span> <StatusBadge status={selected.last_probe?.status||'unknown'}/>{selected.last_probe?.status||'—'}</div>
                      <div><span style={{color:'var(--muted)'}}>URL:</span> {selected.url||'—'}</div>
                      <div><span style={{color:'var(--muted)'}}>Время ответа:</span> {selected.last_probe?.response_time != null ? Number(selected.last_probe.response_time).toFixed(0)+' мс' : '—'}</div>
                    </div>
                  </div>

                  {/* SSL */}
                  {selected.ssl && (
                    <div className="card" style={{padding:16}}>
                      <div style={{fontSize:11,color:'var(--muted)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>SSL-сертификат</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:13}}>
                        <div><span style={{color:'var(--muted)'}}>Статус:</span> <span style={{color:selected.ssl.valid?'#4ade80':'#ef4444',fontWeight:600}}>{selected.ssl.valid?'Валидный':'Невалидный'}</span></div>
                        <div><span style={{color:'var(--muted)'}}>Издатель:</span> {selected.ssl.issuer||'—'}</div>
                        <div><span style={{color:'var(--muted)'}}>Истекает:</span> {selected.ssl.expires||'—'}</div>
                        <div>
                          <span style={{color:'var(--muted)'}}>Осталось дней:</span>{' '}
                          <span style={{color:selected.ssl.days_left<30?selected.ssl.days_left<7?'#ef4444':'#facc15':'#4ade80',fontWeight:600}}>
                            {selected.ssl.days_left ?? '—'}
                          </span>
                        </div>
                      </div>
                      {selected.ssl.days_left != null && selected.ssl.days_left < 30 && (
                        <div style={{marginTop:10,padding:'8px 12px',borderRadius:6,borderLeft:`3px solid ${selected.ssl.days_left<7?'#ef4444':'#facc15'}`,background:selected.ssl.days_left<7?'#ef444420':'#facc1520',fontSize:12,color:selected.ssl.days_left<7?'#ef4444':'#facc15'}}>
                          {selected.ssl.days_left < 7 ? 'Сертификат истекает менее чем через 7 дней!' : 'Сертификат истекает менее чем через 30 дней'}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
