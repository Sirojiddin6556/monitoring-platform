import {useEffect, useState, useCallback} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'

function StatBox({label, value, color}) {
  return (
    <div className="card" style={{padding:'16px 20px',minWidth:130,textAlign:'center'}}>
      <div style={{fontSize:24,fontWeight:700,color:color||'#fff'}}>{value}</div>
      <div style={{fontSize:11,color:'#9aa4b2',marginTop:4}}>{label}</div>
    </div>
  )
}

function StateDot({state}) {
  const s = (state||'').toLowerCase()
  const colors = {running:'#4ade80',started:'#4ade80',on:'#4ade80',stopped:'#ef4444',off:'#ef4444',poweroff:'#ef4444',shutoff:'#ef4444',paused:'#facc15',suspended:'#facc15',saved:'#818cf8'}
  const labels = {running:'Работает',started:'Работает',on:'Работает',stopped:'Остановлена',off:'Остановлена',poweroff:'Остановлена',shutoff:'Остановлена',paused:'Пауза',suspended:'Пауза',saved:'Сохранена'}
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:colors[s]||'#9aa4b2'}}/>
      <span style={{fontSize:12,color:colors[s]||'#9aa4b2',fontWeight:600}}>{labels[s]||state||'—'}</span>
    </span>
  )
}

function TypeBadge({type}) {
  const cfg = {
    hyperv: {bg:'#0078d420',color:'#60a5fa',label:'Hyper-V'},
    proxmox: {bg:'#e5650020',color:'#fb923c',label:'Proxmox'},
    vmware: {bg:'#60793020',color:'#a3e635',label:'VMware'},
    virtualbox: {bg:'#18356820',color:'#818cf8',label:'VirtualBox'},
    qemu: {bg:'#e5650020',color:'#fb923c',label:'QEMU'},
    lxc: {bg:'#06b6d420',color:'#22d3ee',label:'LXC'},
  }
  const c = cfg[(type||'').toLowerCase()] || {bg:'#1a294020',color:'#9aa4b2',label:type||'VM'}
  return <span style={{padding:'2px 8px',borderRadius:4,background:c.bg,color:c.color,fontSize:10,fontWeight:700}}>{c.label}</span>
}

function formatUptime(sec) {
  if (!sec) return '—'
  const d = Math.floor(sec/86400), h = Math.floor((sec%86400)/3600), m = Math.floor((sec%3600)/60)
  if (d > 0) return `${d}д ${h}ч`
  if (h > 0) return `${h}ч ${m}м`
  return `${m}м`
}

export default function VMs() {
  const [vms, setVms] = useState([])
  const [stats, setStats] = useState({total:0,running:0,stopped:0,paused:0})
  const [hypervisors, setHypervisors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({name:'',hv_type:'hyperv',api_url:'',username:'',password:'',token:'',server_id:''})
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState(null)
  const [tab, setTab] = useState('vms') // vms | hypervisors

  const loadData = useCallback(async () => {
    try {
      const {default: apiFetch} = await import('../lib/api')
      const [vmData, hvData] = await Promise.all([
        apiFetch('/api/vm/all'),
        apiFetch('/api/vm/hypervisors'),
      ])
      setVms(vmData.vms || [])
      setStats(vmData.stats || {total:0,running:0,stopped:0,paused:0})
      setHypervisors(hvData.hypervisors || [])
    } catch(e) {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    loadData()
    const t = setInterval(loadData, 20000)
    return () => clearInterval(t)
  }, [loadData])

  async function handleAdd(e) {
    e.preventDefault(); setAddError(null)
    if(!addForm.name.trim()) { setAddError('Имя обязательно'); return }
    setAddLoading(true)
    try {
      const {default: apiFetch} = await import('../lib/api')
      await apiFetch('/api/vm/hypervisors', {method:'POST',body:JSON.stringify(addForm)})
      setAddForm({name:'',hv_type:'hyperv',api_url:'',username:'',password:'',token:'',server_id:''})
      setShowAdd(false)
      await loadData()
    } catch(err) { setAddError(err.message) }
    finally { setAddLoading(false) }
  }

  async function handleDeleteHv(id) {
    if(!confirm('Удалить гипервизор?')) return
    try {
      const {default: apiFetch} = await import('../lib/api')
      await apiFetch(`/api/vm/hypervisors/${id}`, {method:'DELETE'})
      await loadData()
    } catch(e) {}
  }

  async function handleRefresh(id) {
    try {
      const {default: apiFetch} = await import('../lib/api')
      await apiFetch(`/api/vm/hypervisors/${id}/refresh`, {method:'POST'})
      await loadData()
    } catch(e) {}
  }

  // Filters
  const filtered = vms.filter(v => {
    if(search.trim() && !(v.name||'').toLowerCase().includes(search.toLowerCase()) && !(v.source_name||'').toLowerCase().includes(search.toLowerCase())) return false
    const s = (v.state||'').toLowerCase()
    if(statusFilter==='running' && !['running','started','on'].includes(s)) return false
    if(statusFilter==='stopped' && !['stopped','off','shutoff','poweroff'].includes(s)) return false
    if(statusFilter==='paused' && !['paused','suspended','saved'].includes(s)) return false
    if(typeFilter!=='all' && (v.type||'').toLowerCase()!==typeFilter && (v.hv_type||'').toLowerCase()!==typeFilter) return false
    if(sourceFilter!=='all' && (v.source_name||'')!==sourceFilter) return false
    return true
  })

  const sources = [...new Set(vms.map(v=>v.source_name).filter(Boolean))]
  const types = [...new Set(vms.map(v=>v.type||v.hv_type).filter(Boolean))]

  const inputStyle = {padding:'6px 10px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:12,outline:'none'}

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar/>
        <div className="page" style={{maxWidth:'100%'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <h1 style={{margin:0}}>🖥️ Виртуальные машины</h1>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setTab(tab==='vms'?'hypervisors':'vms')} style={{padding:'6px 14px',borderRadius:4,border:'1px solid #1a2940',background:tab==='hypervisors'?'#0d1b2e':'transparent',color:'#9aa4b2',cursor:'pointer',fontSize:12}}>{tab==='vms'?'Гипервизоры':'← Все ВМ'}</button>
              <button onClick={()=>setShowAdd(!showAdd)} style={{padding:'6px 14px',borderRadius:4,border:'none',background:'#6366f1',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>{showAdd?'✕':'+ Добавить гипервизор'}</button>
            </div>
          </div>

          {/* Stats */}
          <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
            <StatBox label="Всего ВМ" value={stats.total} color="#fff"/>
            <StatBox label="Работают" value={stats.running} color="#4ade80"/>
            <StatBox label="Остановлены" value={stats.stopped} color="#ef4444"/>
            <StatBox label="Пауза/Сохр." value={stats.paused} color="#facc15"/>
            <StatBox label="Гипервизоров" value={hypervisors.length} color="#818cf8"/>
          </div>

          {/* Add form */}
          {showAdd && (
            <form onSubmit={handleAdd} className="card" style={{padding:16,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>Добавить гипервизор</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end'}}>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <label style={{fontSize:11,color:'#9aa4b2'}}>Название</label>
                  <input value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})} placeholder="My Hypervisor" style={{...inputStyle,width:160}}/>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <label style={{fontSize:11,color:'#9aa4b2'}}>Тип</label>
                  <select value={addForm.hv_type} onChange={e=>setAddForm({...addForm,hv_type:e.target.value})} style={{...inputStyle,width:130}}>
                    <option value="hyperv">Hyper-V</option>
                    <option value="proxmox">Proxmox</option>
                    <option value="vmware">VMware</option>
                  </select>
                </div>
                {addForm.hv_type==='hyperv' ? (
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    <label style={{fontSize:11,color:'#9aa4b2'}}>Server ID (агент)</label>
                    <input value={addForm.server_id} onChange={e=>setAddForm({...addForm,server_id:e.target.value})} placeholder="win-server-1" style={{...inputStyle,width:180}}/>
                  </div>
                ) : (<>
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    <label style={{fontSize:11,color:'#9aa4b2'}}>API URL</label>
                    <input value={addForm.api_url} onChange={e=>setAddForm({...addForm,api_url:e.target.value})} placeholder="https://192.168.1.10:8006" style={{...inputStyle,width:220}}/>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    <label style={{fontSize:11,color:'#9aa4b2'}}>Пользователь</label>
                    <input value={addForm.username} onChange={e=>setAddForm({...addForm,username:e.target.value})} placeholder="root@pam" style={{...inputStyle,width:140}}/>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    <label style={{fontSize:11,color:'#9aa4b2'}}>Пароль</label>
                    <input value={addForm.password} onChange={e=>setAddForm({...addForm,password:e.target.value})} type="password" style={{...inputStyle,width:140}}/>
                  </div>
                  {addForm.hv_type==='proxmox' && (
                    <div style={{display:'flex',flexDirection:'column',gap:4}}>
                      <label style={{fontSize:11,color:'#9aa4b2'}}>API Token (опциональный)</label>
                      <input value={addForm.token} onChange={e=>setAddForm({...addForm,token:e.target.value})} placeholder="user@pam!token=..." style={{...inputStyle,width:220}}/>
                    </div>
                  )}
                </>)}
                <button type="submit" disabled={addLoading} style={{padding:'7px 16px',borderRadius:4,border:'none',background:'#6366f1',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>{addLoading?'...':'Добавить'}</button>
              </div>
              {addError && <div style={{color:'#ef4444',fontSize:11,marginTop:8}}>{addError}</div>}
            </form>
          )}

          {loading && <div style={{color:'#9aa4b2',textAlign:'center',padding:40}}>Загрузка...</div>}

          {/* Tab: Hypervisors */}
          {!loading && tab==='hypervisors' && (
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {hypervisors.length===0 && (
                <div className="card" style={{padding:40,textAlign:'center'}}>
                  <div style={{fontSize:40,opacity:0.3,marginBottom:12}}>🖥️</div>
                  <div style={{color:'#9aa4b2',fontSize:14}}>Гипервизоры не добавлены</div>
                </div>
              )}
              {hypervisors.map(h=>(
                <div key={h.id} className="card" style={{padding:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <TypeBadge type={h.hv_type}/>
                      <span style={{fontSize:16,fontWeight:600}}>{h.name}</span>
                      <StateDot state={h.last_status}/>
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>handleRefresh(h.id)} style={{padding:'4px 10px',borderRadius:4,border:'1px solid #1a2940',background:'#0d1b2e',color:'#9aa4b2',cursor:'pointer',fontSize:11}}>🔄 Обновить</button>
                      <button onClick={()=>handleDeleteHv(h.id)} style={{padding:'4px 10px',borderRadius:4,border:'1px solid #ef444460',background:'transparent',color:'#ef4444',cursor:'pointer',fontSize:11}}>✕</button>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:16,fontSize:12,color:'#9aa4b2',marginBottom:10}}>
                    {h.api_url && <span>URL: {h.api_url}</span>}
                    {h.server_id && <span>Агент: {h.server_id}</span>}
                    <span>ВМ: {h.stats.total}</span>
                    <span style={{color:'#4ade80'}}>▲ {h.stats.running}</span>
                    <span style={{color:'#ef4444'}}>▼ {h.stats.stopped}</span>
                    {h.last_check && <span>Обновлено: {new Date(h.last_check).toLocaleString('ru-RU')}</span>}
                  </div>
                  {h.vms.length > 0 && (
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead>
                          <tr style={{borderBottom:'1px solid #1a2940'}}>
                            <th style={thStyle}>Имя</th>
                            <th style={thStyle}>Статус</th>
                            <th style={thStyle}>Тип</th>
                            <th style={thStyle}>CPU</th>
                            <th style={thStyle}>RAM</th>
                            <th style={thStyle}>Диск</th>
                            <th style={thStyle}>Uptime</th>
                          </tr>
                        </thead>
                        <tbody>
                          {h.vms.map((vm,i)=>(
                            <tr key={i} style={{borderBottom:'1px solid #0d1b2e'}}>
                              <td style={tdStyle}><span style={{fontWeight:600,color:'#fff'}}>{vm.name}</span></td>
                              <td style={tdStyle}><StateDot state={vm.state}/></td>
                              <td style={tdStyle}><TypeBadge type={vm.type}/></td>
                              <td style={tdStyle}>{vm.cpu_count||0} vCPU {vm.cpu_usage>0?<span style={{color:'#60a5fa'}}>({vm.cpu_usage}%)</span>:''}</td>
                              <td style={tdStyle}>{vm.ram_mb||0} MB</td>
                              <td style={tdStyle}>{vm.disk_gb ? `${vm.disk_gb} GB` : '—'}</td>
                              <td style={tdStyle}>{formatUptime(vm.uptime)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tab: All VMs */}
          {!loading && tab==='vms' && (
            <>
              {/* Filters */}
              <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Поиск по имени..." style={{...inputStyle,width:220}}/>
                <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{...inputStyle,width:140}}>
                  <option value="all">Все статусы</option>
                  <option value="running">Работают</option>
                  <option value="stopped">Остановлены</option>
                  <option value="paused">Пауза</option>
                </select>
                {types.length>1 && (
                  <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{...inputStyle,width:140}}>
                    <option value="all">Все типы</option>
                    {types.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                )}
                {sources.length>1 && (
                  <select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)} style={{...inputStyle,width:180}}>
                    <option value="all">Все источники</option>
                    {sources.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                <span style={{fontSize:11,color:'#9aa4b2'}}>Показано: {filtered.length} из {vms.length}</span>
              </div>

              {vms.length===0 && (
                <div className="card" style={{padding:60,textAlign:'center'}}>
                  <div style={{fontSize:48,opacity:0.3,marginBottom:16}}>🖥️</div>
                  <div style={{color:'#9aa4b2',fontSize:15}}>Виртуальные машины не найдены</div>
                  <div style={{color:'#9aa4b2',fontSize:12,marginTop:8}}>Добавьте гипервизор или обновите агент на сервере с Hyper-V</div>
                </div>
              )}

              {filtered.length>0 && (
                <div className="card" style={{padding:0,overflow:'hidden'}}>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                      <thead>
                        <tr style={{background:'#0a1929'}}>
                          <th style={thStyle}>Имя</th>
                          <th style={thStyle}>Статус</th>
                          <th style={thStyle}>Тип</th>
                          <th style={thStyle}>CPU</th>
                          <th style={thStyle}>CPU%</th>
                          <th style={thStyle}>RAM</th>
                          <th style={thStyle}>Диск</th>
                          <th style={thStyle}>Uptime</th>
                          <th style={thStyle}>Источник</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((vm,i) => (
                          <tr key={i} style={{borderBottom:'1px solid #0d1b2e',transition:'background 0.15s'}}
                              onMouseEnter={e=>e.currentTarget.style.background='#0d1b2e40'}
                              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <td style={tdStyle}><span style={{fontWeight:600,color:'#fff'}}>{vm.name||'—'}</span></td>
                            <td style={tdStyle}><StateDot state={vm.state}/></td>
                            <td style={tdStyle}><TypeBadge type={vm.type||vm.hv_type}/></td>
                            <td style={tdStyle}>{vm.cpu_count||0} vCPU</td>
                            <td style={tdStyle}>{vm.cpu_usage!=null && vm.cpu_usage>0 ? <span style={{color:vm.cpu_usage>80?'#ef4444':vm.cpu_usage>50?'#facc15':'#4ade80'}}>{vm.cpu_usage}%</span> : <span style={{color:'#9aa4b2'}}>—</span>}</td>
                            <td style={tdStyle}>{vm.ram_mb ? `${vm.ram_mb} MB` : '—'}</td>
                            <td style={tdStyle}>{vm.disk_gb ? `${vm.disk_gb} GB` : '—'}</td>
                            <td style={tdStyle}>{formatUptime(vm.uptime)}</td>
                            <td style={tdStyle}>
                              <span style={{padding:'2px 8px',borderRadius:4,background:'#1a294040',color:'#9aa4b2',fontSize:10}}>{vm.source_name||'—'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}

const thStyle = {padding:'10px 12px',textAlign:'left',color:'#9aa4b2',fontWeight:600,fontSize:11,textTransform:'uppercase',letterSpacing:0.3,whiteSpace:'nowrap'}
const tdStyle = {padding:'10px 12px',color:'#c8d0da',whiteSpace:'nowrap'}
