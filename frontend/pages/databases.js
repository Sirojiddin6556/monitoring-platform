import {useEffect, useState, useCallback} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

function StatusBadge({status}){
  const colors = {ok:'#4ade80', active:'#4ade80', running:'#4ade80', inactive:'#ef4444', failed:'#ef4444', exited:'#ef4444', down:'#ef4444'}
  const labels = {ok:'Online', active:'Active', running:'Running', inactive:'Stopped', failed:'Failed', exited:'Stopped', down:'Offline'}
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:colors[status]||'#9aa4b2'}}/>
      <span style={{fontSize:12,color:colors[status]||'#9aa4b2',fontWeight:600}}>{labels[status]||status}</span>
    </span>
  )
}

export default function Databases() {
  const [databases, setDatabases] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const loadData = useCallback(async () => {
    try {
      const serversData = await apiFetch('/api/servers')
      const serversList = Array.isArray(serversData) ? serversData : (serversData?.servers || [])
      const details = await Promise.all(
        serversList.map(async (s) => {
          try {
            const res = await apiFetch(`/api/servers/${s.id}/detail`)
            return { serverName: s.name, detail: res?.detail || {} }
          } catch {
            return { serverName: s.name, detail: {} }
          }
        })
      )

      let allDbs = []
      for (const item of details) {
        const dbs = item.detail.databases || []
        for (const db of dbs) {
          allDbs.push({
            ...db,
            serverName: item.serverName,
          })
        }
      }
      setDatabases(allDbs)
    } catch(e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const t = setInterval(loadData, 15000)
    return () => clearInterval(t)
  }, [loadData])

  const filtered = databases.filter(db => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (db.name || '').toLowerCase().includes(q) ||
      (db.type || '').toLowerCase().includes(q) ||
      (db.serverName || '').toLowerCase().includes(q)
    )
  })

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <div className="page">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <h1 style={{margin:0}}>Базы данных</h1>
            <span style={{fontSize:12,color:'#9aa4b2'}}>Всего отслеживается: {databases.length}</span>
          </div>

          <div style={{marginBottom:16}}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Поиск баз данных по имени, типу или серверу..."
              style={{width:'100%',padding:'10px 14px',borderRadius:6,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:13,outline:'none'}}
            />
          </div>

          <div className="card" style={{padding:16}}>
            {loading && databases.length === 0 ? (
              <div style={{color:'#9aa4b2',padding:20,textAlign:'center'}}>Загрузка данных...</div>
            ) : filtered.length === 0 ? (
              <div style={{color:'#9aa4b2',padding:20,textAlign:'center'}}>Нет доступных баз данных. Настройте переменную MONITOR_DATABASES в файле agent.env.</div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid #1a2940',textAlign:'left',color:'#9aa4b2'}}>
                      <th style={{padding:10}}>Имя</th>
                      <th style={{padding:10}}>Тип</th>
                      <th style={{padding:10}}>Сервер</th>
                      <th style={{padding:10}}>Статус</th>
                      <th style={{padding:10}}>Задержка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((db, i) => (
                      <tr key={i} style={{borderBottom:'1px solid #1a294020'}}>
                        <td style={{padding:10,fontWeight:600,color:'#fff'}}>{db.name}</td>
                        <td style={{padding:10}}><span style={{textTransform:'uppercase',fontSize:11,background:'#1a294040',padding:'2px 6px',borderRadius:4}}>{db.type}</span></td>
                        <td style={{padding:10,color:'#38bdf8'}}>{db.serverName}</td>
                        <td style={{padding:10}}><StatusBadge status={db.status} /></td>
                        <td style={{padding:10,fontWeight:500,color:'#4ade80'}}>{db.latency_ms?.toFixed(2)} мс</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
