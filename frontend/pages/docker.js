import {useEffect, useState, useMemo} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'

function StatusBadge({status}) {
  const colors = {running:'#4ade80', exited:'#ef4444', paused:'#facc15', created:'#9aa4b2', restarting:'#f97316'}
  const labels = {running:'Running', exited:'Exited', paused:'Paused', created:'Created', restarting:'Restarting'}
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:colors[status]||'#9aa4b2'}}/>
      <span style={{fontSize:11,color:colors[status]||'#9aa4b2',fontWeight:600}}>{labels[status]||status||'—'}</span>
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

export default function Docker() {
  const [containers, setContainers] = useState([])
  const [stats, setStats] = useState({total:0, running:0, stopped:0, servers_with_docker:0})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [serverFilter, setServerFilter] = useState('all')

  const loadData = async () => {
    try {
      setError(null)
      const {default: apiFetch} = await import('../lib/api')
      const [cRes, sRes] = await Promise.all([
        apiFetch('/api/docker/containers'),
        apiFetch('/api/docker/stats')
      ])
      setContainers(cRes.containers || [])
      setStats(sRes || {total:0, running:0, stopped:0, servers_with_docker:0})
    } catch(err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const iv = setInterval(loadData, 15000)
    return () => clearInterval(iv)
  }, [])

  const servers = useMemo(() => {
    const map = {}
    containers.forEach(c => { map[c.server_id] = c.server_name || c.server_id })
    return Object.entries(map).map(([id, name]) => ({id, name}))
  }, [containers])

  const filtered = useMemo(() => {
    return containers.filter(c => {
      if(statusFilter !== 'all' && c.status !== statusFilter) return false
      if(serverFilter !== 'all' && c.server_id !== serverFilter) return false
      if(search.trim()) {
        const q = search.toLowerCase()
        return (c.name||'').toLowerCase().includes(q) || (c.image||'').toLowerCase().includes(q) || (c.server_name||'').toLowerCase().includes(q)
      }
      return true
    })
  }, [containers, search, statusFilter, serverFilter])

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <div className="page" style={{maxWidth:'100%'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <h1 style={{margin:0}}>🐳 Docker контейнеры</h1>
            <button onClick={loadData} style={{padding:'6px 14px',borderRadius:4,border:'1px solid #1a2940',background:'#0d1b2e',color:'#9aa4b2',cursor:'pointer',fontSize:12}}>Обновить</button>
          </div>

          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
            <StatBox label="Всего контейнеров" value={stats.total} color="#00d4ff" icon="📦"/>
            <StatBox label="Запущенных" value={stats.running} color="#4ade80" icon="▶️"/>
            <StatBox label="Остановленных" value={stats.stopped} color={stats.stopped>0?'#ef4444':'#9aa4b2'} icon="⏹️"/>
            <StatBox label="Серверов с Docker" value={stats.servers_with_docker} color="#6c5ce7" icon="🖥️"/>
          </div>

          {/* Filters */}
          <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Поиск по имени, образу..." style={{padding:'6px 10px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:12,width:240,outline:'none'}}/>
            {[{id:'all',l:'Все'},{id:'running',l:'Запущенные'},{id:'exited',l:'Остановленные'}].map(f=>(
              <button key={f.id} onClick={()=>setStatusFilter(f.id)} style={{padding:'6px 12px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:statusFilter===f.id?'#6c5ce730':'#0d1b2e',color:statusFilter===f.id?'#6c5ce7':'#9aa4b2'}}>{f.l}</button>
            ))}
            {servers.length > 1 && (
              <select value={serverFilter} onChange={e=>setServerFilter(e.target.value)} style={{padding:'6px 10px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:12,outline:'none'}}>
                <option value="all">Все серверы</option>
                {servers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {search && <span style={{fontSize:11,color:'#9aa4b2'}}>Найдено: {filtered.length}</span>}
          </div>

          {loading && <div style={{color:'#9aa4b2',fontSize:13,padding:20,textAlign:'center'}}>Загрузка...</div>}
          {error && <div style={{color:'#ef4444',fontSize:13,padding:12,background:'#ef444410',borderRadius:6,marginBottom:12}}>{error}</div>}

          {!loading && containers.length === 0 && (
            <div className="card" style={{padding:60,textAlign:'center'}}>
              <div style={{fontSize:48,marginBottom:16,opacity:0.3}}>🐳</div>
              <div style={{color:'#9aa4b2',fontSize:15}}>Docker контейнеры не обнаружены</div>
              <div style={{color:'#9aa4b2',fontSize:12,marginTop:8}}>Мониторинг Docker работает через агенты, установленные на серверах</div>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="card" style={{padding:16}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Контейнер</th>
                      <th style={thStyle}>Образ</th>
                      <th style={thStyle}>Статус</th>
                      <th style={thStyle}>CPU %</th>
                      <th style={thStyle}>RAM MB</th>
                      <th style={thStyle}>RAM %</th>
                      <th style={thStyle}>Рестарты</th>
                      <th style={thStyle}>Сервер</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c,i) => (
                      <tr key={i} style={{borderBottom:'1px solid #1a294040'}}>
                        <td style={tdStyle}><span style={{fontWeight:500}}>{c.name||'—'}</span></td>
                        <td style={{...tdStyle,color:'#9aa4b2',fontSize:11,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.image||'—'}</td>
                        <td style={tdStyle}><StatusBadge status={c.status}/></td>
                        <td style={{...tdStyle,color:c.cpu_percent>50?'#ef4444':c.cpu_percent>20?'#facc15':'#fff'}}>{c.cpu_percent!=null?c.cpu_percent.toFixed(1):'—'}</td>
                        <td style={tdStyle}>{c.mem_mb!=null?c.mem_mb.toFixed(0):'—'}</td>
                        <td style={{...tdStyle,color:c.mem_percent>80?'#ef4444':c.mem_percent>50?'#facc15':'#fff'}}>{c.mem_percent!=null?c.mem_percent.toFixed(1)+'%':'—'}</td>
                        <td style={{...tdStyle,color:c.restarts>0?'#facc15':'#fff'}}>{c.restarts??'—'}</td>
                        <td style={{...tdStyle,fontSize:11}}>
                          <span style={{padding:'2px 6px',background:'#1a2940',borderRadius:3,color:'#9aa4b2'}}>{c.server_name||c.server_id}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
