import {useEffect, useState} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'

export default function Logs() {
  const [servers, setServers] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [logTab, setLogTab] = useState('system')
  const [serverSearch, setServerSearch] = useState('')
  const [logSearch, setLogSearch] = useState('')

  useEffect(() => {
    import('../lib/api').then(({default: apiFetch}) => {
      apiFetch('/api/servers').then(d => { setServers(d.servers||[]); setLoading(false) }).catch(()=>setLoading(false))
    })
  }, [])

  function selectServer(s) {
    setSelected(s)
    setDetail(null)
    import('../lib/api').then(({default: apiFetch}) => {
      apiFetch(`/api/servers/${s.id}/detail`).then(d => setDetail(d.detail||null)).catch(()=>setDetail(null))
    })
  }

  // auto-refresh logs every 20s
  useEffect(() => {
    if(!selected) return
    const iv = setInterval(() => {
      import('../lib/api').then(({default: apiFetch}) => {
        apiFetch(`/api/servers/${selected.id}/detail`).then(d => setDetail(d.detail||null)).catch(()=>{})
      })
    }, 20000)
    return () => clearInterval(iv)
  }, [selected])

  const logs = detail?.recent_logs || {}
  const entries = logs[logTab] || []
  const filteredEntries = logSearch.trim() ? entries.filter(l=>l.toLowerCase().includes(logSearch.toLowerCase())) : entries
  const filteredServers = serverSearch.trim() ? servers.filter(s=>(s.name||'').toLowerCase().includes(serverSearch.toLowerCase())||(s.host||'').toLowerCase().includes(serverSearch.toLowerCase())) : servers

  const LOG_TABS = [
    {key:'system', label:'System Log', color:'#6c5ce7', desc:'syslog / messages'},
    {key:'auth', label:'Auth / Security', color:'#ef4444', desc:'auth.log / secure'},
    {key:'error', label:'Error / Kernel', color:'#facc15', desc:'kern.log / dmesg'},
  ]

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <div className="page" style={{maxWidth:'100%'}}>
          <h1>Логи серверов</h1>

          <div style={{display:'flex',gap:16,minHeight:'calc(100vh - 120px)'}}>
            {/* Server list */}
            <div className="card" style={{width:220,minWidth:220,padding:12,alignSelf:'flex-start',position:'sticky',top:16}}>
              <h4 style={{margin:'0 0 8px',fontSize:14}}>Серверы</h4>
              <input value={serverSearch} onChange={e=>setServerSearch(e.target.value)} placeholder="🔍 Поиск..." style={{width:'100%',padding:'5px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:11,marginBottom:6,outline:'none',boxSizing:'border-box'}}/>
              {loading && <div style={{color:'#9aa4b2',fontSize:12,padding:8}}>Загрузка...</div>}
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {filteredServers.map(s => (
                  <div key={s.id} onClick={()=>selectServer(s)} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 10px',borderRadius:6,cursor:'pointer',background:selected?.id===s.id?'#6c5ce720':'transparent',border:selected?.id===s.id?'1px solid #6c5ce740':'1px solid transparent'}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:s.status==='ok'?'#4ade80':s.status==='down'?'#ef4444':'#9aa4b2'}}/>
                    <span style={{fontSize:13,color:'#fff'}}>{s.name}</span>
                  </div>
                ))}
                {!loading && servers.length===0 && <div style={{color:'#9aa4b2',fontSize:12}}>Нет серверов</div>}
              </div>
            </div>

            {/* Logs panel */}
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:12}}>
              {!selected ? (
                <div className="card" style={{padding:60,textAlign:'center'}}>
                  <div style={{fontSize:40,marginBottom:16,opacity:0.3}}>📜</div>
                  <div style={{color:'#9aa4b2',fontSize:15}}>Выберите сервер для просмотра логов</div>
                  <div style={{color:'#9aa4b2',fontSize:12,marginTop:8}}>Логи собираются агентом на Linux-серверах</div>
                </div>
              ) : (<>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <h2 style={{margin:0,fontSize:18}}>{selected.name} — Логи</h2>
                  <span style={{fontSize:12,color:'#9aa4b2'}}>{selected.host || selected.id}</span>
                </div>

                {/* Log type tabs */}
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  {LOG_TABS.map(t => (
                    <button key={t.key} onClick={()=>setLogTab(t.key)} style={{padding:'8px 16px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:logTab===t.key?t.color+'30':'#0d1b2e',color:logTab===t.key?t.color:'#9aa4b2'}}>
                      {t.label}
                      <span style={{fontSize:10,marginLeft:6,opacity:0.6}}>({(logs[t.key]||[]).length})</span>
                    </button>
                  ))}
                  <div style={{flex:1}}/>
                  <input value={logSearch} onChange={e=>setLogSearch(e.target.value)} placeholder="🔍 Поиск в логах..." style={{padding:'5px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:11,width:200,outline:'none'}}/>
                </div>

                <div className="card" style={{padding:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <div style={{fontSize:12,color:'#9aa4b2'}}>{LOG_TABS.find(t=>t.key===logTab)?.desc}</div>
                    <span style={{fontSize:11,color:'#9aa4b2'}}>{entries.length} строк</span>
                  </div>

                  {entries.length === 0 ? (
                    <div style={{padding:40,textAlign:'center',color:'#9aa4b2',fontSize:13}}>
                      Нет логов. Логи доступны только на Linux с правами чтения (агент)
                    </div>
                  ) : filteredEntries.length === 0 ? (
                    <div style={{padding:40,textAlign:'center',color:'#9aa4b2',fontSize:13}}>
                      Ничего не найдено по запросу "{logSearch}"
                    </div>
                  ) : (
                    <div style={{maxHeight:600,overflowY:'auto',background:'#050d1a',borderRadius:6,padding:12}}>
                      <pre style={{margin:0,fontFamily:'"JetBrains Mono",Consolas,monospace',fontSize:11,lineHeight:1.7,whiteSpace:'pre-wrap',wordBreak:'break-all'}}>
                        {filteredEntries.map((line,i) => {
                          const isError = /error|fail|crit|panic|emergency/i.test(line)
                          const isWarn = /warn|timeout|refused|denied/i.test(line)
                          const isSsh = /ssh|sshd|session opened|accepted/i.test(line)
                          const color = isError ? '#ef4444' : isWarn ? '#facc15' : isSsh ? '#00d4ff' : '#c8d1dc'
                          return <div key={i} style={{color,padding:'1px 0',borderBottom:'1px solid #1a294015'}}><span style={{color:'#9aa4b2',marginRight:8,fontSize:10,userSelect:'none'}}>{String(i+1).padStart(3)}</span>{line}</div>
                        })}
                      </pre>
                    </div>
                  )}
                  {logSearch && <div style={{fontSize:10,color:'#9aa4b2',marginTop:6}}>Найдено: {filteredEntries.length} из {entries.length}</div>}
                </div>
              </>)}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
