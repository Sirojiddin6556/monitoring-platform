import {useState, useCallback, useEffect} from 'react'
import {ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, RadialBarChart, RadialBar} from 'recharts'
import apiFetch from '../lib/api'

const TIP = {background:'#0d1b2e',border:'1px solid #1a2940',borderRadius:6,fontSize:12,color:'#fff'}

export default function BotHealthDashboard({bot, onCheck}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const runCheck = useCallback(async () => {
    if (!bot?.id) return
    setLoading(true)
    try {

      const res = await apiFetch(`/api/telegram/bots/${bot.id}/check`, {method:'POST'})
      setResult(res.info || res)
      if (onCheck) onCheck()
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }, [bot?.id, onCheck])

  useEffect(() => {
    if (bot?.id) runCheck()
  }, [bot?.id])

  // Используем result (свежий) или last_info (кэшированный)
  const info = result || bot?.last_info || {}
  const status = info.status || bot?.last_status || 'unknown'
  const apiTime = info.api_response_time
  const webhookTime = info.webhook_response_time
  const users = info.users_stats || {}
  const checkedAt = info.checked_at || bot?.last_check

  // Данные для gauge статуса
  const statusColor = status === 'online' ? '#4ade80' : status === 'error' ? '#facc15' : '#ef4444'
  const statusLabel = status === 'online' ? 'Онлайн' : status === 'error' ? 'Ошибка' : 'Оффлайн'
  const gaugeData = [{name:'status', value: status === 'online' ? 100 : status === 'error' ? 50 : 5, fill: statusColor}]

  // Данные для бар-чарта времени ответа
  const timeData = []
  if (apiTime != null) timeData.push({name:'getMe API', ms: apiTime, fill: apiTime < 300 ? '#4ade80' : apiTime < 700 ? '#facc15' : '#ef4444'})
  if (webhookTime != null) timeData.push({name:'Webhook API', ms: webhookTime, fill: webhookTime < 300 ? '#4ade80' : webhookTime < 700 ? '#facc15' : '#ef4444'})

  // Данные для pie пользователей
  const usersPie = []
  if (users.active > 0) usersPie.push({name:'Активные', value: users.active, color:'#4ade80'})
  if (users.inactive > 0) usersPie.push({name:'Неактивные', value: users.inactive, color:'#6b7280'})

  // Данные для pie уведомлений
  const notifyPie = []
  if (users.notify_critical > 0) notifyPie.push({name:'Critical', value: users.notify_critical, color:'#ef4444'})
  if (users.notify_warning > 0) notifyPie.push({name:'Warning', value: users.notify_warning, color:'#facc15'})
  if (users.notify_info > 0) notifyPie.push({name:'Info', value: users.notify_info, color:'#3b82f6'})

  // Features
  const features = [
    {name:'Группы', ok: info.can_join_groups},
    {name:'Inline', ok: info.supports_inline},
    {name:'Чтение сообщений', ok: info.can_read_messages},
    {name:'Webhook', ok: !!info.webhook_url},
  ]

  return (
    <div className="card" style={{padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={{fontSize:11,color:'#9aa4b2',textTransform:'uppercase',letterSpacing:0.5}}>🏥 Health Check бота</div>
        <button onClick={runCheck} disabled={loading} style={{padding:'4px 12px',borderRadius:4,border:'1px solid #1a2940',background:'#0d1b2e',color:'#9aa4b2',cursor:'pointer',fontSize:11}}>
          {loading ? '⏳ Проверка...' : '🔄 Проверить'}
        </button>
      </div>

      {/* Summary row */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10,marginBottom:16}}>
        {/* Status gauge */}
        <div style={{background:'#07111e',borderRadius:8,padding:'10px 8px',border:'1px solid #1a294060',textAlign:'center'}}>
          <ResponsiveContainer width="100%" height={90}>
            <RadialBarChart cx="50%" cy="90%" innerRadius="60%" outerRadius="100%" startAngle={180} endAngle={0} barSize={10} data={gaugeData}>
              <RadialBar background={{fill:'#1a294060'}} dataKey="value" cornerRadius={5}/>
            </RadialBarChart>
          </ResponsiveContainer>
          <div style={{fontSize:13,fontWeight:700,color:statusColor,marginTop:-10}}>{statusLabel}</div>
          <div style={{fontSize:10,color:'#9aa4b2'}}>@{info.username || bot?.last_username || '—'}</div>
        </div>

        {/* API Response Time */}
        <div style={{background:'#07111e',borderRadius:8,padding:'14px 12px',border:'1px solid #1a294060',textAlign:'center'}}>
          <div style={{fontSize:10,color:'#9aa4b2',marginBottom:6}}>⏱ Время ответа API</div>
          <div style={{fontSize:26,fontWeight:700,color: apiTime != null ? (apiTime < 300 ? '#4ade80' : apiTime < 700 ? '#facc15' : '#ef4444') : '#9aa4b2'}}>
            {apiTime != null ? `${Math.round(apiTime)}` : '—'}
          </div>
          <div style={{fontSize:10,color:'#9aa4b2'}}>мс</div>
        </div>

        {/* Pending updates */}
        <div style={{background:'#07111e',borderRadius:8,padding:'14px 12px',border:'1px solid #1a294060',textAlign:'center'}}>
          <div style={{fontSize:10,color:'#9aa4b2',marginBottom:6}}>📨 Pending Updates</div>
          <div style={{fontSize:26,fontWeight:700,color: (info.pending_updates || 0) > 0 ? '#facc15' : '#4ade80'}}>
            {info.pending_updates ?? '—'}
          </div>
          <div style={{fontSize:10,color:'#9aa4b2'}}>в очереди</div>
        </div>

        {/* Users */}
        <div style={{background:'#07111e',borderRadius:8,padding:'14px 12px',border:'1px solid #1a294060',textAlign:'center'}}>
          <div style={{fontSize:10,color:'#9aa4b2',marginBottom:6}}>👥 Пользователи</div>
          <div style={{fontSize:26,fontWeight:700,color:'#fff'}}>
            {users.total ?? '—'}
          </div>
          <div style={{fontSize:10,color:'#9aa4b2'}}>
            {users.active != null ? <><span style={{color:'#4ade80'}}>{users.active} акт.</span> / <span style={{color:'#6b7280'}}>{users.inactive} неакт.</span></> : 'бот не проверен'}
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{display:'grid',gridTemplateColumns: (timeData.length > 0 ? '2fr ' : '') + (usersPie.length > 0 ? '1fr ' : '') + (notifyPie.length > 0 ? '1fr' : ''), gap:12, marginBottom:16}}>
        {/* Response time bar chart */}
        {timeData.length > 0 && (
          <div style={{background:'#07111e',borderRadius:8,padding:12,border:'1px solid #1a294060'}}>
            <div style={{fontSize:11,color:'#9aa4b2',marginBottom:4,textAlign:'center'}}>⏱ Время ответа Telegram API (мс)</div>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={timeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1a294060"/>
                <XAxis type="number" tick={{fontSize:10,fill:'#9aa4b2'}}/>
                <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:'#9aa4b2'}} width={80}/>
                <Tooltip contentStyle={TIP} formatter={(v)=>[`${v} мс`,'Время']}/>
                <Bar dataKey="ms" radius={[0,4,4,0]} barSize={20}>
                  {timeData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Users pie */}
        {usersPie.length > 0 && (
          <div style={{background:'#07111e',borderRadius:8,padding:12,border:'1px solid #1a294060'}}>
            <div style={{fontSize:11,color:'#9aa4b2',marginBottom:4,textAlign:'center'}}>👥 Пользователи</div>
            <ResponsiveContainer width="100%" height={110}>
              <PieChart>
                <Pie data={usersPie} dataKey="value" cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={3}>
                  {usersPie.map((d,i)=><Cell key={i} fill={d.color}/>)}
                </Pie>
                <Tooltip contentStyle={TIP} formatter={(v,n)=>[v,n]}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{display:'flex',justifyContent:'center',gap:8,fontSize:10}}>
              {usersPie.map((d,i)=><span key={i} style={{color:d.color}}>● {d.name}: {d.value}</span>)}
            </div>
          </div>
        )}

        {/* Notifications pie */}
        {notifyPie.length > 0 && (
          <div style={{background:'#07111e',borderRadius:8,padding:12,border:'1px solid #1a294060'}}>
            <div style={{fontSize:11,color:'#9aa4b2',marginBottom:4,textAlign:'center'}}>🔔 Подписки</div>
            <ResponsiveContainer width="100%" height={110}>
              <PieChart>
                <Pie data={notifyPie} dataKey="value" cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={3}>
                  {notifyPie.map((d,i)=><Cell key={i} fill={d.color}/>)}
                </Pie>
                <Tooltip contentStyle={TIP} formatter={(v,n)=>[v,n]}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{display:'flex',justifyContent:'center',gap:8,fontSize:10}}>
              {notifyPie.map((d,i)=><span key={i} style={{color:d.color}}>● {d.name}: {d.value}</span>)}
            </div>
          </div>
        )}
      </div>

      {/* Features row */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom: checkedAt ? 8 : 0}}>
        {features.map((f,i) => (
          <div key={i} style={{
            padding:'4px 10px',borderRadius:12,fontSize:11,fontWeight:600,
            background: f.ok ? '#4ade8015' : '#1a294030',
            color: f.ok ? '#4ade80' : '#6b7280',
            border: `1px solid ${f.ok ? '#4ade8030' : '#1a294060'}`,
          }}>
            {f.ok ? '✅' : '❌'} {f.name}
          </div>
        ))}
        {info.webhook_url && (
          <div style={{padding:'4px 10px',borderRadius:12,fontSize:11,color:'#9aa4b2',background:'#1a294030',border:'1px solid #1a294060',overflow:'hidden',textOverflow:'ellipsis',maxWidth:200}}>
            🔗 {info.webhook_url}
          </div>
        )}
      </div>

      {/* Checked at */}
      {checkedAt && (
        <div style={{fontSize:10,color:'#9aa4b2',textAlign:'right'}}>
          🕐 Проверено: {new Date(checkedAt).toLocaleString('ru-RU')}
        </div>
      )}
    </div>
  )
}
