import {useEffect, useState, useMemo} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'

function StatusBadge({status, colors: customColors}) {
  const defaultColors = {Running:'#4ade80', Succeeded:'#4ade80', Active:'#4ade80', Ready:'#4ade80', Pending:'#facc15', Failed:'#ef4444', Unknown:'#9aa4b2', NotReady:'#ef4444', Terminating:'#f97316'}
  const c = customColors || defaultColors
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:c[status]||'#9aa4b2'}}/>
      <span style={{fontSize:11,color:c[status]||'#9aa4b2',fontWeight:600}}>{status||'—'}</span>
    </span>
  )
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

export default function Kubernetes() {
  const [clusters, setClusters] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('pods')
  const [search, setSearch] = useState('')
  const [nsFilter, setNsFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({name:'', api_url:'', token:''})
  const [addError, setAddError] = useState(null)
  const [addLoading, setAddLoading] = useState(false)

  const loadClusters = async () => {
    try {
      setError(null)
      const {default: apiFetch} = await import('../lib/api')
      const d = await apiFetch('/api/kubernetes/clusters')
      setClusters(d.clusters || [])
    } catch(err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadClusters() }, [])

  async function handleAdd(e) {
    e.preventDefault(); setAddError(null)
    if(!addForm.name.trim() || !addForm.api_url.trim()) { setAddError('Имя и API URL обязательны'); return }
    setAddLoading(true)
    try {
      const {default: apiFetch} = await import('../lib/api')
      const res = await apiFetch('/api/kubernetes/clusters', {
        method: 'POST', body: JSON.stringify(addForm)
      })
      if(res.detail) { setAddError(res.detail); return }
      setAddForm({name:'', api_url:'', token:''}); setShowAdd(false)
      await loadClusters()
    } catch(err) { setAddError(err.message || 'Ошибка') }
    finally { setAddLoading(false) }
  }

  async function handleDelete(id) {
    if(!confirm('Удалить кластер?')) return
    try {
      const {default: apiFetch} = await import('../lib/api')
      await apiFetch(`/api/kubernetes/clusters/${id}`, {method:'DELETE'})
      if(selected?.id === id) setSelected(null)
      await loadClusters()
    } catch(err) { setError('Ошибка удаления') }
  }

  async function handleRefresh(id) {
    try {
      const {default: apiFetch} = await import('../lib/api')
      await apiFetch(`/api/kubernetes/clusters/${id}/refresh`, {method:'POST'})
      await loadClusters()
    } catch(err) { setError('Ошибка обновления') }
  }

  const sel = selected ? clusters.find(c=>c.id===selected.id) : null
  const pods = sel?.pods || []
  const nodes = sel?.nodes || []
  const deployments = sel?.deployments || []
  const namespaces = sel?.namespaces || []
  const stats = sel?.stats || {}

  const allNs = useMemo(() => [...new Set(pods.map(p=>p.namespace))].sort(), [pods])

  const filteredPods = useMemo(() => {
    return pods.filter(p => {
      if(nsFilter !== 'all' && p.namespace !== nsFilter) return false
      if(search.trim()) {
        const q = search.toLowerCase()
        return (p.name||'').toLowerCase().includes(q) || (p.namespace||'').toLowerCase().includes(q) || (p.node||'').toLowerCase().includes(q)
      }
      return true
    })
  }, [pods, nsFilter, search])

  const filteredDeployments = useMemo(() => {
    return deployments.filter(d => {
      if(nsFilter !== 'all' && d.namespace !== nsFilter) return false
      if(search.trim()) {
        const q = search.toLowerCase()
        return (d.name||'').toLowerCase().includes(q) || (d.namespace||'').toLowerCase().includes(q)
      }
      return true
    })
  }, [deployments, nsFilter, search])

  const TABS = [
    {id:'pods', label:'Поды', icon:'🟢', count: pods.length},
    {id:'deployments', label:'Деплойменты', icon:'📦', count: deployments.length},
    {id:'nodes', label:'Ноды', icon:'🖥️', count: nodes.length},
    {id:'namespaces', label:'Неймспейсы', icon:'📁', count: namespaces.length},
  ]

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <div className="page" style={{maxWidth:'100%'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <h1 style={{margin:0}}>☸️ Kubernetes</h1>
            <button onClick={()=>setShowAdd(!showAdd)} style={{padding:'6px 14px',borderRadius:4,border:'none',background:'#6c5ce7',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>{showAdd?'✕':'+ Добавить кластер'}</button>
          </div>

          {showAdd && (
            <form onSubmit={handleAdd} className="card" style={{padding:16,marginBottom:16,display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <label style={{fontSize:11,color:'#9aa4b2'}}>Название</label>
                <input value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})} placeholder="production" style={inputStyle}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <label style={{fontSize:11,color:'#9aa4b2'}}>API URL</label>
                <input value={addForm.api_url} onChange={e=>setAddForm({...addForm,api_url:e.target.value})} placeholder="https://k8s-api:6443" style={{...inputStyle,width:260}}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <label style={{fontSize:11,color:'#9aa4b2'}}>Bearer Token</label>
                <input value={addForm.token} onChange={e=>setAddForm({...addForm,token:e.target.value})} placeholder="опционально" type="password" style={inputStyle}/>
              </div>
              {addError && <div style={{color:'#ef4444',fontSize:11}}>{addError}</div>}
              <button type="submit" disabled={addLoading} style={{padding:'7px 16px',borderRadius:4,border:'none',background:'#6c5ce7',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>{addLoading?'...':'Добавить'}</button>
            </form>
          )}

          {loading && <div style={{color:'#9aa4b2',fontSize:13,padding:20,textAlign:'center'}}>Загрузка...</div>}
          {error && <div style={{color:'#ef4444',fontSize:13,padding:12,background:'#ef444410',borderRadius:6,marginBottom:12}}>{error}</div>}

          {!loading && clusters.length === 0 && !showAdd && (
            <div className="card" style={{padding:60,textAlign:'center'}}>
              <div style={{fontSize:48,marginBottom:16,opacity:0.3}}>☸️</div>
              <div style={{color:'#9aa4b2',fontSize:15}}>Кластеры Kubernetes не добавлены</div>
              <div style={{color:'#9aa4b2',fontSize:12,marginTop:8}}>Нажмите «+ Добавить кластер» чтобы начать мониторинг</div>
            </div>
          )}

          {clusters.length > 0 && (
            <div style={{display:'flex',gap:16,minHeight:'calc(100vh - 160px)'}}>
              {/* Cluster list */}
              <div className="card" style={{width:240,minWidth:240,padding:12,alignSelf:'flex-start',position:'sticky',top:16}}>
                <h4 style={{margin:'0 0 10px',fontSize:14}}>Кластеры</h4>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {clusters.map(c => (
                    <div key={c.id} onClick={()=>{setSelected(c);setActiveTab('pods');setSearch('');setNsFilter('all')}} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 10px',borderRadius:6,cursor:'pointer',background:selected?.id===c.id?'#6c5ce720':'transparent',border:selected?.id===c.id?'1px solid #6c5ce740':'1px solid transparent'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,color:'#fff',fontWeight:selected?.id===c.id?600:400}}>{c.name}</div>
                        <div style={{fontSize:10,color:'#9aa4b2'}}>{c.api_url}</div>
                        <StatusBadge status={c.last_status==='ok'?'Ready':c.last_status==='error'?'NotReady':'Unknown'}/>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:2}}>
                        <button onClick={e=>{e.stopPropagation();handleRefresh(c.id)}} title="Обновить" style={{background:'none',border:'none',color:'#00d4ff',cursor:'pointer',fontSize:12,padding:2}}>🔄</button>
                        <button onClick={e=>{e.stopPropagation();handleDelete(c.id)}} title="Удалить" style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:12,padding:2,opacity:0.5}}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detail panel */}
              <div style={{flex:1,display:'flex',flexDirection:'column',gap:14}}>
                {!sel ? (
                  <div className="card" style={{padding:60,textAlign:'center'}}>
                    <div style={{fontSize:40,marginBottom:16,opacity:0.3}}>☸️</div>
                    <div style={{color:'#9aa4b2',fontSize:15}}>Выберите кластер из списка</div>
                  </div>
                ) : (<>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <h2 style={{margin:0,fontSize:20}}>{sel.name}</h2>
                      <span style={{fontSize:12,color:'#9aa4b2'}}>{sel.api_url}</span>
                    </div>
                    <StatusBadge status={sel.last_status==='ok'?'Ready':'NotReady'}/>
                  </div>

                  {/* Stats */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10}}>
                    <StatBox label="Подов" value={stats.total_pods||0} color="#00d4ff" icon="🟢"/>
                    <StatBox label="Запущено" value={stats.running_pods||0} color="#4ade80" icon="▶️"/>
                    <StatBox label="Pending" value={stats.pending_pods||0} color={stats.pending_pods>0?'#facc15':'#9aa4b2'} icon="⏳"/>
                    <StatBox label="Failed" value={stats.failed_pods||0} color={stats.failed_pods>0?'#ef4444':'#9aa4b2'} icon="❌"/>
                    <StatBox label="Нод" value={stats.total_nodes||0} color="#6c5ce7" icon="🖥️"/>
                    <StatBox label="Ready нод" value={stats.ready_nodes||0} color="#4ade80" icon="✅"/>
                    <StatBox label="Деплойментов" value={stats.total_deployments||0} color="#f97316" icon="📦"/>
                    <StatBox label="Неймспейсов" value={stats.total_namespaces||0} color="#00d4ff" icon="📁"/>
                  </div>

                  {/* Tabs */}
                  <div style={{display:'flex',gap:4}}>
                    {TABS.map(t=>(
                      <button key={t.id} onClick={()=>{setActiveTab(t.id);setSearch('')}} style={{padding:'8px 14px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:activeTab===t.id?'#6c5ce730':'#0d1b2e',color:activeTab===t.id?'#6c5ce7':'#9aa4b2'}}>
                        <span style={{marginRight:4}}>{t.icon}</span>{t.label} <span style={{opacity:0.6}}>({t.count})</span>
                      </button>
                    ))}
                  </div>

                  {/* Filter bar */}
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Поиск..." style={{padding:'6px 10px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:12,width:220,outline:'none'}}/>
                    {(activeTab==='pods'||activeTab==='deployments') && allNs.length>1 && (
                      <select value={nsFilter} onChange={e=>setNsFilter(e.target.value)} style={{padding:'6px 10px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:12,outline:'none'}}>
                        <option value="all">Все неймспейсы</option>
                        {allNs.map(ns=><option key={ns} value={ns}>{ns}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Tab content */}
                  {activeTab==='pods' && (
                    <div className="card" style={{padding:16}}>
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                          <thead><tr>
                            <th style={thStyle}>Pod</th>
                            <th style={thStyle}>Namespace</th>
                            <th style={thStyle}>Статус</th>
                            <th style={thStyle}>Node</th>
                            <th style={thStyle}>IP</th>
                            <th style={thStyle}>Контейнеры</th>
                            <th style={thStyle}>Рестарты</th>
                          </tr></thead>
                          <tbody>
                            {filteredPods.length===0 ? (
                              <tr><td colSpan={7} style={{padding:20,textAlign:'center',color:'#9aa4b2'}}>Нет подов</td></tr>
                            ) : filteredPods.map((p,i)=>(
                              <tr key={i} style={{borderBottom:'1px solid #1a294040'}}>
                                <td style={tdStyle}><span style={{fontWeight:500}}>{p.name}</span></td>
                                <td style={tdStyle}><span style={{padding:'2px 6px',background:'#1a2940',borderRadius:3,fontSize:10}}>{p.namespace}</span></td>
                                <td style={tdStyle}><StatusBadge status={p.status}/></td>
                                <td style={{...tdStyle,color:'#9aa4b2',fontSize:11}}>{p.node}</td>
                                <td style={{...tdStyle,color:'#9aa4b2',fontSize:11}}>{p.ip}</td>
                                <td style={tdStyle}>
                                  {(p.containers||[]).map((c,j)=>(
                                    <span key={j} style={{display:'inline-block',padding:'1px 5px',borderRadius:3,fontSize:10,marginRight:3,background:c.ready?'#4ade8020':'#ef444420',color:c.ready?'#4ade80':'#ef4444'}}>{c.name}</span>
                                  ))}
                                </td>
                                <td style={{...tdStyle,color:p.restarts>0?'#facc15':'#fff'}}>{p.restarts}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {activeTab==='deployments' && (
                    <div className="card" style={{padding:16}}>
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                          <thead><tr>
                            <th style={thStyle}>Deployment</th>
                            <th style={thStyle}>Namespace</th>
                            <th style={thStyle}>Реплики</th>
                            <th style={thStyle}>Ready</th>
                            <th style={thStyle}>Available</th>
                            <th style={thStyle}>Updated</th>
                          </tr></thead>
                          <tbody>
                            {filteredDeployments.length===0 ? (
                              <tr><td colSpan={6} style={{padding:20,textAlign:'center',color:'#9aa4b2'}}>Нет деплойментов</td></tr>
                            ) : filteredDeployments.map((d,i)=>(
                              <tr key={i} style={{borderBottom:'1px solid #1a294040'}}>
                                <td style={tdStyle}><span style={{fontWeight:500}}>{d.name}</span></td>
                                <td style={tdStyle}><span style={{padding:'2px 6px',background:'#1a2940',borderRadius:3,fontSize:10}}>{d.namespace}</span></td>
                                <td style={tdStyle}>{d.replicas||0}</td>
                                <td style={{...tdStyle,color:d.ready===d.replicas?'#4ade80':'#facc15'}}>{d.ready||0}/{d.replicas||0}</td>
                                <td style={{...tdStyle,color:d.available===d.replicas?'#4ade80':'#facc15'}}>{d.available||0}</td>
                                <td style={tdStyle}>{d.updated||0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {activeTab==='nodes' && (
                    <div className="card" style={{padding:16}}>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
                        {nodes.length===0 ? (
                          <div style={{padding:20,textAlign:'center',color:'#9aa4b2'}}>Нет данных о нодах</div>
                        ) : nodes.filter(n=>!search.trim()||(n.name||'').toLowerCase().includes(search.toLowerCase())).map((n,i)=>(
                          <div key={i} style={{padding:14,background:'#07111e',borderRadius:8,borderLeft:`3px solid ${n.status==='Ready'?'#4ade80':'#ef4444'}`}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                              <span style={{fontSize:14,fontWeight:600,color:'#fff'}}>{n.name}</span>
                              <StatusBadge status={n.status}/>
                            </div>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,fontSize:11}}>
                              <div><span style={{color:'#9aa4b2'}}>CPU:</span> <span style={{color:'#fff'}}>{n.cpu}</span></div>
                              <div><span style={{color:'#9aa4b2'}}>RAM:</span> <span style={{color:'#fff'}}>{n.memory}</span></div>
                              <div><span style={{color:'#9aa4b2'}}>Pods:</span> <span style={{color:'#fff'}}>{n.pods_capacity}</span></div>
                              <div><span style={{color:'#9aa4b2'}}>Runtime:</span> <span style={{color:'#fff'}}>{n.runtime}</span></div>
                              <div style={{gridColumn:'1/3'}}><span style={{color:'#9aa4b2'}}>OS:</span> <span style={{color:'#fff',fontSize:10}}>{n.os}</span></div>
                              <div style={{gridColumn:'1/3'}}><span style={{color:'#9aa4b2'}}>Kubelet:</span> <span style={{color:'#fff'}}>{n.kubelet}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab==='namespaces' && (
                    <div className="card" style={{padding:16}}>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        {namespaces.length===0 ? (
                          <div style={{padding:20,textAlign:'center',color:'#9aa4b2',width:'100%'}}>Нет данных</div>
                        ) : namespaces.filter(ns=>!search.trim()||(ns.name||'').toLowerCase().includes(search.toLowerCase())).map((ns,i)=>(
                          <div key={i} style={{padding:'10px 16px',background:'#07111e',borderRadius:6,borderLeft:`3px solid ${ns.status==='Active'?'#4ade80':'#9aa4b2'}`}}>
                            <div style={{fontSize:13,fontWeight:500,color:'#fff'}}>{ns.name}</div>
                            <div style={{fontSize:10,color:ns.status==='Active'?'#4ade80':'#9aa4b2',marginTop:2}}>{ns.status}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}

const thStyle = {textAlign:'left',padding:'8px 10px',color:'#9aa4b2',borderBottom:'1px solid #1a2940',fontSize:11,fontWeight:600}
const tdStyle = {padding:'8px 10px',color:'#fff'}
const inputStyle = {padding:'6px 10px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:12,width:180,outline:'none'}
