import {useEffect, useState, useCallback} from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  Layers,
  Server,
  Cpu,
  HardDrive,
  RefreshCw,
  Trash2,
  Plus,
  Search,
  ArrowUpRight,
  Activity,
  Play,
  Pause,
  Sliders,
  Radio
} from 'lucide-react'


function StatBox({label, value, color}) {
  return (
    <div style={{
      background: '#101726',
      border: '1px solid #1e293b',
      borderRadius: 6,
      padding: '12px 18px',
      minWidth: 130,
      textAlign: 'center'
    }}>
      <div style={{fontSize:22,fontWeight:700,color:color||'#f8fafc',fontVariantNumeric:'tabular-nums'}}>{value}</div>
      <div style={{fontSize:11,color:'#64748b',marginTop:4}}>{label}</div>
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
  const c = cfg[(type||'').toLowerCase()] || {bg:'rgba(30, 41, 59, 0.5)',color:'#9aa4b2',label:type||'VM'}
  return <span style={{padding:'2px 8px',borderRadius:4,background:c.bg,color:c.color,fontSize:10,fontWeight:700}}>{c.label}</span>
}

function formatUptime(sec) {
  if (!sec) return '—'
  const d = Math.floor(sec/86400), h = Math.floor((sec%86400)/3600), m = Math.floor((sec%3600)/60)
  if (d > 0) return `${d}д ${h}ч`
  if (h > 0) return `${h}ч ${m}м`
  return `${m}м`
}

function vmCpuCount(vm) {
  return vm.cpu_count ?? vm.cpus ?? vm.cpu ?? 0
}

function vmCpuUsage(vm) {
  const value = vm.cpu_usage ?? vm.cpu_percent ?? vm.cpu_load
  return typeof value === 'number' ? value : Number(value || 0)
}

function vmRamMb(vm) {
  return vm.ram_mb ?? vm.memory_mb ?? vm.mem_mb ?? vm.ram ?? null
}

function vmDiskGb(vm) {
  return vm.disk_gb ?? vm.storage_gb ?? vm.disk ?? null
}

function findMatchedServer(vm, servers) {
  if (!vm?.ip_address || !servers?.length) return null
  return servers.find(s => s.host === vm.ip_address || s.id === vm.ip_address)
}

export default function VMs() {
  const [mounted, setMounted] = useState(false)
  const [vms, setVms] = useState([])
  const [stats, setStats] = useState({total:0,running:0,stopped:0,paused:0})
  const [hypervisors, setHypervisors] = useState([])
  const [servers, setServers] = useState([])
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
      const [vmData, hvData, srvData] = await Promise.all([
        apiFetch('/api/vm/all'),
        apiFetch('/api/vm/hypervisors'),
        apiFetch('/api/servers').catch(() => ({ servers: [] })),
      ])
      setVms(vmData.vms || [])
      setStats(vmData.stats || {total:0,running:0,stopped:0,paused:0})
      setHypervisors(hvData.hypervisors || [])
      setServers(srvData.servers || [])
    } catch(e) {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    setMounted(true)
    loadData()
    const t = setInterval(loadData, 15000)
    return () => clearInterval(t)
  }, [loadData])

  async function handleAdd(e) {
    e.preventDefault(); setAddError(null)
    if(!addForm.name.trim()) { setAddError('Имя обязательно'); return }
    setAddLoading(true)
    try {
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
      await apiFetch(`/api/vm/hypervisors/${id}`, {method:'DELETE'})
      await loadData()
    } catch(e) {}
  }

  async function handleRefresh(id) {
    try {
      await apiFetch(`/api/vm/hypervisors/${id}/refresh`, {method:'POST'})
      await loadData()
    } catch(e) {}
  }

  // Filters
  const filtered = vms.filter(v => {
    if(search.trim()) {
      const q = search.toLowerCase()
      const matchName = (v.name||'').toLowerCase().includes(q)
      const matchSource = (v.source_name||'').toLowerCase().includes(q)
      const matchIp = (v.ip_address||'').toLowerCase().includes(q)
      const matchOs = (v.os||'').toLowerCase().includes(q)
      if(!matchName && !matchSource && !matchIp && !matchOs) return false
    }
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

  const inputStyle = {padding:'6px 10px',borderRadius:4,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none'}

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="app-shell">
        <Sidebar/>
        <div className="page" style={{maxWidth:'100%'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <h1 style={{margin:0}}> Виртуальные машины</h1>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setTab(tab==='vms'?'hypervisors':'vms')} style={{padding:'6px 14px',borderRadius:4,border:'1px solid #1e293b',background:tab==='hypervisors'?'#101726':'transparent',color:'#9aa4b2',cursor:'pointer',fontSize:12}}>{tab==='vms'?'Гипервизоры':'← Все ВМ'}</button>
              <button onClick={()=>setShowAdd(!showAdd)} style={{padding:'6px 14px',borderRadius:4,border:'none',background:'#2563eb',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>{showAdd?'✕':'+ Добавить гипервизор'}</button>
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
                <button type="submit" disabled={addLoading} style={{padding:'7px 16px',borderRadius:4,border:'none',background:'#2563eb',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>{addLoading?'...':'Добавить'}</button>
              </div>
              {addError && <div style={{color:'#ef4444',fontSize:11,marginTop:8}}>{addError}</div>}
            </form>
          )}

          {loading && <div style={{color:'#9aa4b2',textAlign:'center',padding:40}}>Загрузка...</div>}

          {/* Tab: Hypervisors */}
          {!loading && tab==='hypervisors' && (
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              {hypervisors.length===0 && (
                <div className="card" style={{padding:40,textAlign:'center'}}>
                  <div style={{fontSize:40,opacity:0.3,marginBottom:12}}></div>
                  <div style={{color:'#9aa4b2',fontSize:14}}>Гипервизоры не добавлены</div>
                </div>
              )}
              {hypervisors.map(h=>{
                const hs = h.host_stats || {}
                return (
                  <div key={h.id} className="card" style={{padding:16}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <TypeBadge type={h.hv_type}/>
                        <span style={{fontSize:17,fontWeight:700,color:'#fff'}}>{h.name}</span>
                        <StateDot state={h.last_status}/>
                      </div>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>handleRefresh(h.id)} style={{padding:'5px 12px',borderRadius:4,border:'1px solid #1e293b',background:'#101726',color:'#d6deea',cursor:'pointer',fontSize:11}}>🔄 Обновить</button>
                        <button onClick={()=>handleDeleteHv(h.id)} style={{padding:'5px 10px',borderRadius:4,border:'1px solid #ef444460',background:'transparent',color:'#ef4444',cursor:'pointer',fontSize:11}}>✕</button>
                      </div>
                    </div>

                    <div style={{display:'flex',gap:16,fontSize:12,color:'#9aa4b2',marginBottom:12,flexWrap:'wrap'}}>
                      {h.api_url && <span>URL: <code style={{color:'#60a5fa'}}>{h.api_url}</code></span>}
                      {h.server_id && <span>Агент: <code>{h.server_id}</code></span>}
                      <span>ВМ всего: <strong style={{color:'#fff'}}>{h.stats?.total || 0}</strong></span>
                      <span style={{color:'#4ade80'}}>▲ {h.stats?.running || 0} онлайн</span>
                      <span style={{color:'#ef4444'}}>▼ {h.stats?.stopped || 0} выкл</span>
                      {h.last_check && <span>Обновлено: {new Date(h.last_check).toLocaleString('ru-RU')}</span>}
                    </div>

                    {/* Host hardware resource bars */}
                    {hs.cpu_cores > 0 && (
                      <div style={{background:'#090d16',borderRadius:8,padding:'12px 16px',marginBottom:16,border:'1px solid #1e293b'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,fontSize:11,color:'#9aa4b2',flexWrap:'wrap',gap:6}}>
                          <span style={{fontWeight:600,color:'#d6deea'}}> Оборудование хоста: {hs.model}</span>
                          <span style={{color:'#818cf8'}}>{hs.version}</span>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14}}>
                          {/* CPU */}
                          <div>
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                              <span style={{color:'#9aa4b2'}}>CPU ({hs.cpu_cores} ядер)</span>
                              <span style={{color:hs.cpu_pct>80?'#ef4444':'#60a5fa',fontWeight:600}}>
                                {hs.cpu_pct}% ({Math.round(hs.cpu_mhz_used || 0)} / {Math.round(hs.cpu_mhz_total || 0)} MHz)
                              </span>
                            </div>
                            <div style={{height:6,background:'#1e293b',borderRadius:3,overflow:'hidden'}}>
                              <div style={{width:`${Math.min(100, hs.cpu_pct||0)}%`,height:'100%',background:hs.cpu_pct>80?'#ef4444':'#3b82f6',transition:'width 0.3s'}}/>
                            </div>
                          </div>
                          {/* RAM */}
                          <div>
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                              <span style={{color:'#9aa4b2'}}>RAM хоста</span>
                              <span style={{color:hs.ram_pct>85?'#ef4444':'#a78bfa',fontWeight:600}}>
                                {hs.ram_pct}% ({Math.round((hs.ram_mb_used||0)/1024*10)/10} / {Math.round((hs.ram_mb_total||0)/1024*10)/10} GB)
                              </span>
                            </div>
                            <div style={{height:6,background:'#1e293b',borderRadius:3,overflow:'hidden'}}>
                              <div style={{width:`${Math.min(100, hs.ram_pct||0)}%`,height:'100%',background:hs.ram_pct>85?'#ef4444':'#8b5cf6',transition:'width 0.3s'}}/>
                            </div>
                          </div>
                          {/* Datastore */}
                          {hs.disk_gb_total > 0 && (
                            <div>
                              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                                <span style={{color:'#9aa4b2'}}>Хранилище (Datastore)</span>
                                <span style={{color:hs.disk_pct>85?'#ef4444':'#34d399',fontWeight:600}}>
                                  {hs.disk_pct}% ({Math.round(hs.disk_gb_used||0)} / {Math.round(hs.disk_gb_total||0)} GB)
                                </span>
                              </div>
                              <div style={{height:6,background:'#1e293b',borderRadius:3,overflow:'hidden'}}>
                                <div style={{width:`${Math.min(100, hs.disk_pct||0)}%`,height:'100%',background:hs.disk_pct>85?'#ef4444':'#10b981',transition:'width 0.3s'}}/>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {h.vms?.length > 0 && (
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                          <thead>
                            <tr style={{borderBottom:'1px solid #1e293b'}}>
                              <th style={thStyle}>Имя ВМ</th>
                              <th style={thStyle}>Статус</th>
                              <th style={thStyle}>IP / Привязка к серверу</th>
                              <th style={thStyle}>CPU</th>
                              <th style={thStyle}>RAM</th>
                              <th style={thStyle}>Диск</th>
                              <th style={thStyle}>ОС</th>
                              <th style={thStyle}>Uptime</th>
                            </tr>
                          </thead>
                          <tbody>
                            {h.vms.map((vm,i)=>{
                              const matched = findMatchedServer(vm, servers)
                              return (
                                <tr key={i} style={{borderBottom:'1px solid #101726'}}>
                                  <td style={tdStyle}><span style={{fontWeight:600,color:'#fff'}}>{vm.name}</span></td>
                                  <td style={tdStyle}><StateDot state={vm.state}/></td>
                                  <td style={tdStyle}>
                                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                                      {vm.ip_address ? <span style={{fontFamily:'monospace',color:'#9aa4b2'}}>{vm.ip_address}</span> : '—'}
                                      {matched && (
                                        <Link href="/servers" style={{padding:'2px 7px',borderRadius:4,background:'rgba(37, 99, 235, 0.1)',color:'#818cf8',textDecoration:'none',fontSize:11,fontWeight:600}}>
                                           {matched.name}
                                        </Link>
                                      )}
                                    </div>
                                  </td>
                                  <td style={tdStyle}>{vm.cpu_count||0} vCPU {vm.cpu_usage>0?<span style={{color:'#60a5fa'}}>({vm.cpu_usage}%)</span>:''}</td>
                                  <td style={tdStyle}>{vm.ram_mb||0} MB</td>
                                  <td style={tdStyle}>{vm.disk_gb ? `${vm.disk_gb} GB` : '—'}</td>
                                  <td style={tdStyle}><span style={{color:'#9aa4b2',fontSize:11}}>{vm.os || '—'}</span></td>
                                  <td style={tdStyle}>{formatUptime(vm.uptime)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Tab: All VMs */}
          {!loading && tab==='vms' && (
            <>
              {/* Filters */}
              <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по имени, IP, ОС..." style={{...inputStyle,width:240}}/>
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
                  <div style={{fontSize:48,opacity:0.3,marginBottom:16}}></div>
                  <div style={{color:'#9aa4b2',fontSize:15}}>Виртуальные машины не найдены</div>
                  <div style={{color:'#9aa4b2',fontSize:12,marginTop:8}}>Добавьте гипервизор или обновите агент на сервере с Hyper-V</div>
                </div>
              )}

              {filtered.length>0 && (
                <div className="card" style={{padding:0,overflow:'hidden'}}>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                      <thead>
                        <tr style={{background:'#101726'}}>
                          <th style={thStyle}>Имя</th>
                          <th style={thStyle}>Статус</th>
                          <th style={thStyle}>Тип</th>
                          <th style={thStyle}>IP / Привязка к серверу</th>
                          <th style={thStyle}>CPU</th>
                          <th style={thStyle}>CPU%</th>
                          <th style={thStyle}>RAM</th>
                          <th style={thStyle}>Диск</th>
                          <th style={thStyle}>ОС</th>
                          <th style={thStyle}>Uptime</th>
                          <th style={thStyle}>Источник</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((vm,i) => {
                          const matched = findMatchedServer(vm, servers)
                          return (
                            <tr key={i} style={{borderBottom:'1px solid #101726',transition:'background 0.15s'}}
                                onMouseEnter={e=>e.currentTarget.style.background='#131d31'}
                                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <td style={tdStyle}><span style={{fontWeight:600,color:'#fff'}}>{vm.name||'—'}</span></td>
                              <td style={tdStyle}><StateDot state={vm.state}/></td>
                              <td style={tdStyle}><TypeBadge type={vm.type||vm.hv_type}/></td>
                              <td style={tdStyle}>
                                <div style={{display:'flex',alignItems:'center',gap:6}}>
                                  {vm.ip_address ? <span style={{fontFamily:'monospace',color:'#9aa4b2'}}>{vm.ip_address}</span> : '—'}
                                  {matched && (
                                    <Link href="/servers" style={{padding:'2px 7px',borderRadius:4,background:'rgba(37, 99, 235, 0.1)',color:'#818cf8',textDecoration:'none',fontSize:11,fontWeight:600}}>
                                       {matched.name}
                                    </Link>
                                  )}
                                </div>
                              </td>
                              <td style={tdStyle}>{vmCpuCount(vm)} vCPU</td>
                              <td style={tdStyle}>{vmCpuUsage(vm)>0 ? <span style={{color:vmCpuUsage(vm)>80?'#ef4444':vmCpuUsage(vm)>50?'#facc15':'#4ade80'}}>{vmCpuUsage(vm)}%</span> : <span style={{color:'#9aa4b2'}}>—</span>}</td>
                              <td style={tdStyle}>{vmRamMb(vm) ? `${vmRamMb(vm)} MB` : '—'}</td>
                              <td style={tdStyle}>{vmDiskGb(vm) ? `${vmDiskGb(vm)} GB` : '—'}</td>
                              <td style={tdStyle}><span style={{color:'#9aa4b2',fontSize:11}}>{vm.os || '—'}</span></td>
                              <td style={tdStyle}>{formatUptime(vm.uptime)}</td>
                              <td style={tdStyle}>
                                <span style={{padding:'2px 8px',borderRadius:4,background:'#1e293b',color:'#9aa4b2',fontSize:10}}>{vm.source_name||'—'}</span>
                              </td>
                            </tr>
                          )
                        })}
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
