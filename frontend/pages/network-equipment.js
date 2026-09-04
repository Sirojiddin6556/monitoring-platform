import {useEffect, useState, useCallback} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

function StatusBadge({status}){
  const colors = {up:'#4ade80', running:'#4ade80', active:'#4ade80', down:'#ef4444', exited:'#ef4444', inactive:'#ef4444'}
  const labels = {up:'Online', running:'Online', active:'Online', down:'Offline', exited:'Offline', inactive:'Offline'}
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:colors[status]||'#9aa4b2'}}/>
      <span style={{fontSize:12,color:colors[status]||'#9aa4b2',fontWeight:600}}>{labels[status]||status}</span>
    </span>
  )
}

export default function NetworkEquipment() {
  const [equipment, setEquipment] = useState([])
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

      let allEquip = []
      for (const item of details) {
        const items = item.detail.network_equipment || []
        for (const eq of items) {
          allEquip.push({
            ...eq,
            serverName: item.serverName,
          })
        }
      }
      setEquipment(allEquip)
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

  const filtered = equipment.filter(eq => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (eq.name || '').toLowerCase().includes(q) ||
      (eq.ip || '').toLowerCase().includes(q) ||
      (eq.serverName || '').toLowerCase().includes(q)
    )
  })

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <div className="page">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <h1 style={{margin:0}}>Сетевое оборудование</h1>
            <span style={{fontSize:12,color:'#9aa4b2'}}>Всего отслеживается: {equipment.length}</span>
          </div>

          <div style={{marginBottom:16}}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Поиск сетевых устройств по имени, IP или серверу..."
              style={{width:'100%',padding:'10px 14px',borderRadius:6,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:13,outline:'none'}}
            />
          </div>

          <div className="card" style={{padding:16}}>
            {loading && equipment.length === 0 ? (
              <div style={{color:'#9aa4b2',padding:20,textAlign:'center'}}>Загрузка данных...</div>
            ) : filtered.length === 0 ? (
              <div style={{color:'#9aa4b2',padding:20,textAlign:'center'}}>Нет отслеживаемого сетевого оборудования. Настройте переменную MONITOR_NET_EQUIP на агенте.</div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid #1a2940',textAlign:'left',color:'#9aa4b2'}}>
                      <th style={{padding:10}}>Название устройства</th>
                      <th style={{padding:10}}>IP адрес</th>
                      <th style={{padding:10}}>Контролирующий сервер</th>
                      <th style={{padding:10}}>Статус</th>
                      <th style={{padding:10}}>Задержка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((eq, i) => (
                      <tr key={i} style={{borderBottom:'1px solid #1a294020'}}>
                        <td style={{padding:10,fontWeight:600,color:'#fff'}}>{eq.name}</td>
                        <td style={{padding:10,fontFamily:'monospace',color:'#9aa4b2'}}>{eq.ip}</td>
                        <td style={{padding:10,color:'#38bdf8'}}>{eq.serverName}</td>
                        <td style={{padding:10}}><StatusBadge status={eq.status} /></td>
                        <td style={{padding:10,fontWeight:500,color:'#4ade80'}}>{eq.latency_ms?.toFixed(2)} мс</td>
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
