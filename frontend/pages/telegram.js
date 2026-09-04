import {useEffect, useState} from 'react'
import dynamic from 'next/dynamic'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

const BotHealthDashboard = dynamic(() => import('../components/BotHealthDashboard'), {ssr: false, loading: () => <div style={{padding:40,textAlign:'center',color:'#9aa4b2',fontSize:13}}>Загрузка диаграмм...</div>})

const ALL_CATEGORIES = [
  {value: 'system', label: 'Система'},
  {value: 'website', label: 'Веб-сайты'},
  {value: 'service', label: 'Сервисы'},
  {value: 'docker', label: 'Docker'},
  {value: 'security', label: 'Безопасность'},
]

function StatusDot({status}) {
  const colors = {online:'#4ade80', offline:'#ef4444', error:'#facc15', unknown:'#9aa4b2'}
  const labels = {online:'Онлайн', offline:'Оффлайн', error:'Ошибка', unknown:'Неизвестно'}
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:colors[status]||'#9aa4b2'}}/>
      <span style={{fontSize:11,color:colors[status]||'#9aa4b2',fontWeight:600}}>{labels[status]||status||'—'}</span>
    </span>
  )
}

export default function Telegram() {
  const [bots, setBots] = useState([])
  const [selected, setSelected] = useState(null)
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({name:'', token:'', chat_id:''})
  const [addError, setAddError] = useState(null)
  const [addLoading, setAddLoading] = useState(false)
  const [checkLoading, setCheckLoading] = useState(false)
  const [sendForm, setSendForm] = useState('')
  const [sendResult, setSendResult] = useState(null)
  const [search, setSearch] = useState('')
  const [botUsers, setBotUsers] = useState([])
  const [botUsersLoading, setBotUsersLoading] = useState(false)
  const [orgs, setOrgs] = useState([])
  const [showAddUser, setShowAddUser] = useState(false)
  const [addUserForm, setAddUserForm] = useState({telegram_id:'', username:'', first_name:'', last_name:'', org_id:null, notify_critical:true, notify_warning:true, notify_info:false, notify_categories:[]})
  const [addUserError, setAddUserError] = useState(null)
  const [addUserSaving, setAddUserSaving] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [editUserForm, setEditUserForm] = useState({org_id:null, notify_critical:true, notify_warning:true, notify_info:false, notify_categories:[]})
  const [editUserSaving, setEditUserSaving] = useState(false)
  const [sendUserModal, setSendUserModal] = useState(null)
  const [sendUserMsg, setSendUserMsg] = useState('')
  const [sendUserSending, setSendUserSending] = useState(false)
  const [sendUserResult, setSendUserResult] = useState(null)

  const loadBots = async () => {
    try {
      setError(null)

      const d = await apiFetch('/api/telegram/bots')
      setBots(d.bots || [])
    } catch(err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    // Load bots immediately (cached data), then auto-check status in background
    ;(async () => {
      try {
        setError(null)

        const d = await apiFetch('/api/telegram/bots')
        const botList = d.bots || []
        setBots(botList)
        setLoading(false)
        if (botList.length > 0) {
          await Promise.allSettled(botList.map(b =>
            apiFetch(`/api/telegram/bots/${b.id}/check`, { method: 'POST' })
          ))
          const fresh = await apiFetch('/api/telegram/bots')
          setBots(fresh.bots || [])
        }
      } catch(err) { setError(err.message); setLoading(false) }
    })()
    ;(async()=>{
      try {

        const d = await apiFetch('/api/organizations')
        setOrgs(d.organizations||[])
      } catch {}
    })()
    const interval = setInterval(loadBots, 60000)
    return () => clearInterval(interval)
  }, [])

  async function handleAdd(e) {
    e.preventDefault(); setAddError(null)
    if(!addForm.name.trim() || !addForm.token.trim()) { setAddError('Имя и токен обязательны'); return }
    setAddLoading(true)
    try {

      const res = await apiFetch('/api/telegram/bots', {method:'POST', body:JSON.stringify(addForm)})
      if(res.detail) { setAddError(res.detail); return }
      setAddForm({name:'', token:'', chat_id:''}); setShowAdd(false)
      await loadBots()
    } catch(err) { setAddError(err.message||'Ошибка') }
    finally { setAddLoading(false) }
  }

  async function handleDelete(id) {
    if(!confirm('Удалить бота?')) return
    try {

      await apiFetch(`/api/telegram/bots/${id}`, {method:'DELETE'})
      if(selected?.id===id) { setSelected(null); setUpdates([]) }
      await loadBots()
    } catch(err) { setError('Ошибка удаления') }
  }

  async function handleCheck(id) {
    setCheckLoading(true)
    try {

      await apiFetch(`/api/telegram/bots/${id}/check`, {method:'POST'})
      await loadBots()
    } catch(err) { setError('Ошибка проверки') }
    finally { setCheckLoading(false) }
  }

  async function loadUpdates(bot) {
    setSelected(bot)
    setUpdates([])
    setSendResult(null)
    setBotUsers([])
    setBotUsersLoading(true)
    try {

      const [d, u] = await Promise.all([
        apiFetch(`/api/telegram/bots/${bot.id}/updates`),
        apiFetch(`/api/telegram/bots/${bot.id}/users`)
      ])
      setUpdates(d.updates||[])
      setBotUsers(u.users||[])
    } catch(err) { }
    finally { setBotUsersLoading(false) }
  }

  async function loadBotUsers(botId) {
    try {

      const u = await apiFetch(`/api/telegram/bots/${botId}/users`)
      setBotUsers(u.users||[])
    } catch {}
  }

  async function handleToggleUser(userId) {
    if (!selected) return
    try {

      await apiFetch(`/api/telegram/bots/${selected.id}/users/${userId}/toggle`, {method: 'POST'})
      await loadBotUsers(selected.id)
    } catch {}
  }

  async function handleDeleteUser(userId) {
    if (!confirm('Удалить пользователя?')) return
    if (!selected) return
    try {

      await apiFetch(`/api/telegram/bots/${selected.id}/users/${userId}`, {method: 'DELETE'})
      await loadBotUsers(selected.id)
    } catch {}
  }

  function openAddUser() {
    setAddUserForm({telegram_id:'', username:'', first_name:'', last_name:'', org_id:null, notify_critical:true, notify_warning:true, notify_info:false, notify_categories:[]})
    setAddUserError(null)
    setShowAddUser(true)
  }

  async function handleAddUser() {
    if (!selected) return
    if (!addUserForm.telegram_id.trim()) { setAddUserError('Telegram ID обязателен'); return }
    setAddUserSaving(true); setAddUserError(null)
    try {

      await apiFetch(`/api/telegram/bots/${selected.id}/users`, {method:'POST', body:JSON.stringify(addUserForm)})
      setShowAddUser(false); await loadBotUsers(selected.id)
    } catch(err) { setAddUserError(err.message||'Ошибка создания') }
    finally { setAddUserSaving(false) }
  }

  function openEditUser(u) {
    setEditUser(u)
    setEditUserForm({org_id:u.org_id||null, notify_critical:u.notify_critical, notify_warning:u.notify_warning, notify_info:u.notify_info, notify_categories:u.notify_categories||[]})
  }

  async function handleSaveUser() {
    if (!selected || !editUser) return
    setEditUserSaving(true)
    try {

      await apiFetch(`/api/telegram/bots/${selected.id}/users/${editUser.id}`, {method:'PUT', body:JSON.stringify(editUserForm)})
      setEditUser(null); await loadBotUsers(selected.id)
    } catch {} finally { setEditUserSaving(false) }
  }

  function openSendUser(u) {
    setSendUserModal(u); setSendUserMsg(''); setSendUserResult(null)
  }

  async function handleSendToUser() {
    if (!selected || !sendUserModal || !sendUserMsg.trim()) return
    setSendUserSending(true); setSendUserResult(null)
    try {

      const r = await apiFetch(`/api/telegram/bots/${selected.id}/users/${sendUserModal.id}/send`, {method:'POST', body:JSON.stringify({message:sendUserMsg})})
      setSendUserResult(r)
    } catch(err) { setSendUserResult({sent:false, error:err.message}) }
    finally { setSendUserSending(false) }
  }

  async function handleSend() {
    if(!selected || !sendForm.trim()) return
    setSendResult(null)
    try {

      const res = await apiFetch(`/api/telegram/bots/${selected.id}/send`, {
        method:'POST', body:JSON.stringify({message:sendForm})
      })
      setSendResult(res)
      if(res.sent) setSendForm('')
    } catch(err) { setSendResult({sent:false, error:err.message}) }
  }

  const selBot = selected ? bots.find(b=>b.id===selected.id) || selected : null
  const info = selBot?.last_info || {}

  const filteredBots = search.trim() ? bots.filter(b=>(b.name||'').toLowerCase().includes(search.toLowerCase())||(b.last_username||'').toLowerCase().includes(search.toLowerCase())) : bots

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="app-shell">
        <Sidebar />
        <div className="page" style={{maxWidth:'100%'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <h1 style={{margin:0}}>🤖 Telegram боты</h1>
            <button onClick={()=>setShowAdd(!showAdd)} style={{padding:'6px 14px',borderRadius:4,border:'none',background:'#0088cc',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>{showAdd?'✕':'+ Добавить бота'}</button>
          </div>

          {showAdd && (
            <form onSubmit={handleAdd} className="card" style={{padding:16,marginBottom:16}}>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end'}}>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <label style={{fontSize:11,color:'#9aa4b2'}}>Название</label>
                  <input value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})} placeholder="Мой бот" style={inputStyle}/>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <label style={{fontSize:11,color:'#9aa4b2'}}>Bot Token</label>
                  <input value={addForm.token} onChange={e=>setAddForm({...addForm,token:e.target.value})} placeholder="123456:ABC-..." style={{...inputStyle,width:300}} type="password"/>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <label style={{fontSize:11,color:'#9aa4b2'}}>Chat ID (для уведомлений)</label>
                  <input value={addForm.chat_id} onChange={e=>setAddForm({...addForm,chat_id:e.target.value})} placeholder="-1001234..." style={inputStyle}/>
                </div>
                {addError && <div style={{color:'#ef4444',fontSize:11}}>{addError}</div>}
                <button type="submit" disabled={addLoading} style={{padding:'7px 16px',borderRadius:4,border:'none',background:'#0088cc',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>{addLoading?'...':'Добавить'}</button>
              </div>
            </form>
          )}

          {loading && <div style={{color:'#9aa4b2',fontSize:13,padding:20,textAlign:'center'}}>Загрузка...</div>}
          {error && <div style={{color:'#ef4444',fontSize:13,padding:12,background:'#ef444410',borderRadius:6,marginBottom:12}}>{error}</div>}

          {!loading && bots.length === 0 && !showAdd && (
            <div className="card" style={{padding:60,textAlign:'center'}}>
              <div style={{fontSize:48,marginBottom:16,opacity:0.3}}>🤖</div>
              <div style={{color:'#9aa4b2',fontSize:15}}>Telegram боты не добавлены</div>
              <div style={{color:'#9aa4b2',fontSize:12,marginTop:8}}>Добавьте бота через токен из @BotFather</div>
            </div>
          )}

          {bots.length > 0 && (
            <div style={{display:'flex',gap:16,minHeight:'calc(100vh - 160px)'}}>
              {/* Bot list */}
              <div className="card" style={{width:280,minWidth:280,padding:12,alignSelf:'flex-start',position:'sticky',top:16}}>
                <h4 style={{margin:'0 0 8px',fontSize:14}}>Боты</h4>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Поиск..." style={{width:'100%',padding:'5px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:11,marginBottom:8,outline:'none',boxSizing:'border-box'}}/>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {filteredBots.map(b => (
                    <div key={b.id} onClick={()=>loadUpdates(b)} style={{display:'flex',alignItems:'center',gap:6,padding:'10px 10px',borderRadius:6,cursor:'pointer',background:selected?.id===b.id?'#0088cc20':'transparent',border:selected?.id===b.id?'1px solid #0088cc40':'1px solid transparent'}}>
                      <div style={{width:32,height:32,borderRadius:'50%',background:'#0088cc20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>🤖</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,color:'#fff',fontWeight:selected?.id===b.id?600:400}}>{b.name}</div>
                        <div style={{fontSize:10,color:'#9aa4b2'}}>@{b.last_username||'—'}</div>
                        <StatusDot status={b.last_status}/>
                      </div>
                      <button onClick={e=>{e.stopPropagation();handleDelete(b.id)}} title="Удалить" style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:12,padding:2,opacity:0.4}}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detail panel */}
              <div style={{flex:1,display:'flex',flexDirection:'column',gap:14}}>
                {!selBot ? (
                  <div className="card" style={{padding:60,textAlign:'center'}}>
                    <div style={{fontSize:40,marginBottom:16,opacity:0.3}}>🤖</div>
                    <div style={{color:'#9aa4b2',fontSize:15}}>Выберите бота из списка</div>
                  </div>
                ) : (<>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <h2 style={{margin:0,fontSize:20}}>{selBot.name}</h2>
                      <span style={{fontSize:12,color:'#9aa4b2'}}>@{selBot.last_username||'—'}</span>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <StatusDot status={selBot.last_status}/>
                      <button onClick={()=>handleCheck(selBot.id)} disabled={checkLoading} style={{padding:'6px 14px',borderRadius:4,border:'1px solid #1a2940',background:'#0d1b2e',color:'#9aa4b2',cursor:'pointer',fontSize:12}}>{checkLoading?'...':'Проверить'}</button>
                    </div>
                  </div>

                  {/* Bot info */}
                  <div className="card" style={{padding:16}}>
                    <div style={{fontSize:11,color:'#9aa4b2',textTransform:'uppercase',letterSpacing:0.5,marginBottom:10}}>Информация о боте</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,fontSize:13}}>
                      <div><span style={{color:'#9aa4b2'}}>Username:</span> <span style={{color:'#fff'}}>@{info.username||'—'}</span></div>
                      <div><span style={{color:'#9aa4b2'}}>Имя:</span> <span style={{color:'#fff'}}>{info.first_name||'—'}</span></div>
                      <div><span style={{color:'#9aa4b2'}}>Статус:</span> <StatusDot status={selBot.last_status}/></div>
                      <div><span style={{color:'#9aa4b2'}}>Группы:</span> <span style={{color:info.can_join_groups?'#4ade80':'#ef4444'}}>{info.can_join_groups?'Да':'Нет'}</span></div>
                      <div><span style={{color:'#9aa4b2'}}>Inline:</span> <span style={{color:info.supports_inline?'#4ade80':'#9aa4b2'}}>{info.supports_inline?'Да':'Нет'}</span></div>
                      <div><span style={{color:'#9aa4b2'}}>Webhook:</span> <span style={{color:'#fff',fontSize:11}}>{info.webhook_url||'Не задан'}</span></div>
                      <div><span style={{color:'#9aa4b2'}}>Pending:</span> <span style={{color:info.pending_updates>0?'#facc15':'#4ade80'}}>{info.pending_updates||0}</span></div>
                      <div><span style={{color:'#9aa4b2'}}>Chat ID:</span> <span style={{color:'#fff'}}>{selBot.chat_id||'Не задан'}</span></div>
                      <div><span style={{color:'#9aa4b2'}}>Проверено:</span> <span style={{color:'#fff',fontSize:11}}>{selBot.last_check ? new Date(selBot.last_check).toLocaleString('ru-RU') : '—'}</span></div>
                    </div>
                  </div>

                  {/* Health Check Dashboard бота */}
                  <BotHealthDashboard bot={selBot} onCheck={loadBots} />

                  {/* Bot users */}
                  <div className="card" style={{padding:16}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                      <div style={{fontSize:11,color:'#9aa4b2',textTransform:'uppercase',letterSpacing:0.5}}>👥 Пользователи бота <span style={{color:'#fff',fontWeight:700}}>({botUsers.length})</span></div>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>loadBotUsers(selBot.id)} style={{padding:'4px 10px',borderRadius:4,border:'1px solid #1a2940',background:'#0d1b2e',color:'#9aa4b2',cursor:'pointer',fontSize:11}}>🔄</button>
                        <button onClick={openAddUser} style={{padding:'4px 10px',borderRadius:4,border:'1px solid #0088cc40',background:'#0088cc15',color:'#0088cc',cursor:'pointer',fontSize:11,fontWeight:600}}>➕ Добавить</button>
                      </div>
                    </div>
                    {botUsersLoading ? (
                      <div style={{padding:20,textAlign:'center',color:'#9aa4b2',fontSize:13}}>Загрузка...</div>
                    ) : botUsers.length === 0 ? (
                      <div style={{padding:24,textAlign:'center'}}>
                        <div style={{color:'#9aa4b2',fontSize:13}}>Нет зарегистрированных пользователей</div>
                        <button onClick={openAddUser} style={{marginTop:10,padding:'6px 16px',borderRadius:4,border:'1px solid #0088cc40',background:'#0088cc15',color:'#0088cc',cursor:'pointer',fontSize:12,fontWeight:600}}>➕ Добавить пользователя</button>
                      </div>
                    ) : (
                      <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:320,overflowY:'auto'}}>
                        {botUsers.map(u => (
                          <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#07111e',borderRadius:6,border:'1px solid #1a294060'}}>
                            <div style={{width:36,height:36,borderRadius:'50%',background:u.is_active?'#229ED920':'#ef444420',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>{u.is_active?'👤':'🚫'}</div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:13,color:'#fff',fontWeight:600}}>
                                {u.first_name||'Без имени'}{u.last_name?` ${u.last_name}`:''}
                              </div>
                              <div style={{fontSize:11,color:'#229ED9'}}>{u.username?`@${u.username}`:`ID: ${u.telegram_id}`}</div>
                              <div style={{display:'flex',gap:8,marginTop:3,fontSize:10,color:'#9aa4b2'}}>
                                <span>🏢 {u.org_name||'—'}</span>
                                <span>{u.notify_critical?'🔴':''}{u.notify_warning?'🟡':''}{u.notify_info?'🔵':''}{!u.notify_critical&&!u.notify_warning&&!u.notify_info?'❌ Выкл':''}</span>
                              </div>
                            </div>
                            <div style={{display:'flex',gap:4,flexShrink:0}}>
                              <button onClick={()=>openEditUser(u)} title="Настройки" style={{padding:'4px 8px',borderRadius:4,border:'1px solid #0088cc40',background:'#0088cc10',color:'#0088cc',cursor:'pointer',fontSize:11}}>⚙️</button>
                              <button onClick={()=>openSendUser(u)} title="Отправить сообщение" style={{padding:'4px 8px',borderRadius:4,border:'1px solid #8b5cf640',background:'#8b5cf610',color:'#8b5cf6',cursor:'pointer',fontSize:11}}>💬</button>
                              <button onClick={()=>handleToggleUser(u.id)} title={u.is_active?'Отключить':'Включить'} style={{padding:'4px 8px',borderRadius:4,border:'1px solid '+(u.is_active?'#facc1540':'#4ade8040'),background:u.is_active?'#facc1510':'#4ade8010',color:u.is_active?'#facc15':'#4ade80',cursor:'pointer',fontSize:11}}>{u.is_active?'⏸':'▶'}</button>
                              <button onClick={()=>handleDeleteUser(u.id)} title="Удалить" style={{padding:'4px 8px',borderRadius:4,border:'1px solid #ef444440',background:'#ef444410',color:'#ef4444',cursor:'pointer',fontSize:11}}>🗑</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Send test message */}
                  {selBot.chat_id && (
                    <div className="card" style={{padding:16}}>
                      <div style={{fontSize:11,color:'#9aa4b2',textTransform:'uppercase',letterSpacing:0.5,marginBottom:10}}>Отправить сообщение</div>
                      <div style={{display:'flex',gap:8}}>
                        <input value={sendForm} onChange={e=>setSendForm(e.target.value)} placeholder="Текст сообщения..." style={{flex:1,padding:'8px 12px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:12,outline:'none'}}
                          onKeyDown={e=>{if(e.key==='Enter')handleSend()}}/>
                        <button onClick={handleSend} style={{padding:'8px 20px',borderRadius:4,border:'none',background:'#0088cc',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>Отправить</button>
                      </div>
                      {sendResult && (
                        <div style={{marginTop:8,padding:'6px 10px',borderRadius:4,background:sendResult.sent?'#4ade8010':'#ef444410',color:sendResult.sent?'#4ade80':'#ef4444',fontSize:12}}>
                          {sendResult.sent ? `✓ Отправлено (ID: ${sendResult.message_id})` : `✕ Ошибка: ${sendResult.error}`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Updates */}
                  <div className="card" style={{padding:16}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                      <div style={{fontSize:11,color:'#9aa4b2',textTransform:'uppercase',letterSpacing:0.5}}>Последние сообщения</div>
                      <button onClick={()=>loadUpdates(selBot)} style={{padding:'4px 10px',borderRadius:4,border:'1px solid #1a2940',background:'#0d1b2e',color:'#9aa4b2',cursor:'pointer',fontSize:11}}>🔄 Обновить</button>
                    </div>
                    {updates.length === 0 ? (
                      <div style={{padding:30,textAlign:'center',color:'#9aa4b2',fontSize:13}}>Нет сообщений</div>
                    ) : (
                      <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:400,overflowY:'auto'}}>
                        {updates.map((u,i) => (
                          <div key={u.update_id||i} style={{padding:'10px 12px',background:'#07111e',borderRadius:6,borderLeft:'3px solid #0088cc'}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                              <span style={{fontSize:12,fontWeight:600,color:'#0088cc'}}>@{u.from||'—'}</span>
                              <span style={{fontSize:10,color:'#9aa4b2'}}>{u.date ? new Date(u.date*1000).toLocaleString('ru-RU') : '—'}</span>
                            </div>
                            <div style={{fontSize:13,color:'#fff'}}>{u.text||'—'}</div>
                            <div style={{fontSize:10,color:'#9aa4b2',marginTop:4}}>Chat: {u.chat_title} ({u.chat_id})</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add user modal */}
      {showAddUser && (
        <div style={{position:'fixed',inset:0,background:'#000a',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={()=>setShowAddUser(false)}>
          <div className="card" style={{width:'100%',maxWidth:520,maxHeight:'90vh',overflow:'auto',padding:24}} onClick={e=>e.stopPropagation()}>
            <h3 style={{marginTop:0}}>➕ Добавить пользователя</h3>
            {addUserError && <div style={{background:'#ef444420',border:'1px solid #ef4444',color:'#ef4444',padding:10,borderRadius:8,marginBottom:16,fontSize:13}}>{addUserError}</div>}
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <label style={{fontSize:12,color:'#9aa4b2'}}>Telegram ID *
                <input className="input" value={addUserForm.telegram_id} onChange={e=>setAddUserForm({...addUserForm,telegram_id:e.target.value})} placeholder="Например: 123456789" style={{marginTop:4,width:'100%'}}/>
                <div style={{fontSize:11,color:'#4b5563',marginTop:4}}>Числовой ID пользователя в Telegram (можно узнать через @userinfobot)</div>
              </label>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <label style={{fontSize:12,color:'#9aa4b2'}}>Имя
                  <input className="input" value={addUserForm.first_name} onChange={e=>setAddUserForm({...addUserForm,first_name:e.target.value})} placeholder="Имя" style={{marginTop:4,width:'100%'}}/>
                </label>
                <label style={{fontSize:12,color:'#9aa4b2'}}>Фамилия
                  <input className="input" value={addUserForm.last_name} onChange={e=>setAddUserForm({...addUserForm,last_name:e.target.value})} placeholder="Фамилия" style={{marginTop:4,width:'100%'}}/>
                </label>
              </div>
              <label style={{fontSize:12,color:'#9aa4b2'}}>Username
                <input className="input" value={addUserForm.username} onChange={e=>setAddUserForm({...addUserForm,username:e.target.value})} placeholder="@username (без @)" style={{marginTop:4,width:'100%'}}/>
              </label>
              <div>
                <div style={{fontSize:12,color:'#9aa4b2',marginBottom:6}}>🏢 Организация</div>
                <select className="input" value={addUserForm.org_id||''} onChange={e=>setAddUserForm({...addUserForm,org_id:e.target.value?parseInt(e.target.value):null})} style={{width:'100%'}}>
                  <option value="">Не назначена</option>
                  {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:12,color:'#9aa4b2',marginBottom:8}}>🔔 Уровни серьезности</div>
                <div style={{display:'flex',gap:8}}>
                  {[{key:'notify_critical',label:'Critical',color:'#ef4444'},{key:'notify_warning',label:'Warning',color:'#f59e0b'},{key:'notify_info',label:'Info',color:'#3b82f6'}].map(s=>(
                    <button key={s.key} type="button" onClick={()=>setAddUserForm({...addUserForm,[s.key]:!addUserForm[s.key]})} style={{flex:1,padding:'10px',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:13,textAlign:'center',transition:'all 0.2s',border:`2px solid ${addUserForm[s.key]?s.color:'#1a2940'}`,background:addUserForm[s.key]?s.color+'20':'#0d1b2a',color:addUserForm[s.key]?s.color:'#4b5563'}}>
                      {addUserForm[s.key]?'✓':'✗'} {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{fontSize:12,color:'#9aa4b2',marginBottom:8}}>📂 Категории уведомлений</div>
                <div style={{fontSize:11,color:'#4b5563',marginBottom:8}}>Оставьте пустым для получения всех категорий</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))',gap:6}}>
                  {ALL_CATEGORIES.map(cat=>{
                    const active=(addUserForm.notify_categories||[]).includes(cat.value)
                    return (<button key={cat.value} type="button" onClick={()=>{const cats=addUserForm.notify_categories||[];setAddUserForm({...addUserForm,notify_categories:active?cats.filter(c=>c!==cat.value):[...cats,cat.value]})}} style={{padding:'8px',borderRadius:6,cursor:'pointer',fontSize:12,textAlign:'center',transition:'all 0.2s',border:`2px solid ${active?'#00d4ff':'#1a2940'}`,background:active?'#00d4ff15':'#0d1b2a',color:active?'#00d4ff':'#6b7280'}}>{active?'✓':'○'} {cat.label}</button>)
                  })}
                </div>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
                <button type="button" className="btn" onClick={()=>setShowAddUser(false)} style={{background:'#1a2940',color:'#9aa4b2'}}>Отмена</button>
                <button type="button" className="btn btn-primary" disabled={addUserSaving} onClick={handleAddUser}>{addUserSaving?'Сохранение...':'➕ Добавить'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit user modal */}
      {editUser && (
        <div style={{position:'fixed',inset:0,background:'#000a',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={()=>setEditUser(null)}>
          <div className="card" style={{width:'100%',maxWidth:520,maxHeight:'90vh',overflow:'auto',padding:24}} onClick={e=>e.stopPropagation()}>
            <h3 style={{marginTop:0}}>⚙️ Настройка пользователя</h3>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20,padding:12,background:'#0a1628',borderRadius:8,border:'1px solid #1a2940'}}>
              <span style={{fontSize:28}}>👤</span>
              <div>
                <div style={{fontWeight:600}}>{editUser.first_name||'Без имени'}{editUser.last_name?` ${editUser.last_name}`:''}</div>
                <div style={{fontSize:12,color:'#229ED9'}}>{editUser.username?`@${editUser.username}`:`ID: ${editUser.telegram_id}`}</div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div>
                <div style={{fontSize:12,color:'#9aa4b2',marginBottom:6}}>🏢 Организация</div>
                <select className="input" value={editUserForm.org_id||''} onChange={e=>setEditUserForm({...editUserForm,org_id:e.target.value?parseInt(e.target.value):null})} style={{width:'100%'}}>
                  <option value="">Не назначена</option>
                  {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                {orgs.length===0 && (
                  <div style={{fontSize:11,color:'#f59e0b',marginTop:6,padding:'6px 8px',background:'#f59e0b10',borderRadius:4,border:'1px solid #f59e0b30'}}>
                    ⚠️ Нет организаций. <a href="/organizations" style={{color:'#00d4ff',textDecoration:'underline'}}>Создайте организацию</a> чтобы привязать пользователя.
                  </div>
                )}
                <div style={{fontSize:11,color:'#4b5563',marginTop:4}}>Пользователь будет получать уведомления только по ресурсам этой организации</div>
              </div>
              <div>
                <div style={{fontSize:12,color:'#9aa4b2',marginBottom:8}}>🔔 Уровни серьезности</div>
                <div style={{display:'flex',gap:8}}>
                  {[{key:'notify_critical',label:'Critical',color:'#ef4444'},{key:'notify_warning',label:'Warning',color:'#f59e0b'},{key:'notify_info',label:'Info',color:'#3b82f6'}].map(s=>(
                    <button key={s.key} type="button" onClick={()=>setEditUserForm({...editUserForm,[s.key]:!editUserForm[s.key]})} style={{flex:1,padding:'10px',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:13,textAlign:'center',transition:'all 0.2s',border:`2px solid ${editUserForm[s.key]?s.color:'#1a2940'}`,background:editUserForm[s.key]?s.color+'20':'#0d1b2a',color:editUserForm[s.key]?s.color:'#4b5563'}}>
                      {editUserForm[s.key]?'✓':'✗'} {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{fontSize:12,color:'#9aa4b2',marginBottom:8}}>📂 Категории уведомлений</div>
                <div style={{fontSize:11,color:'#4b5563',marginBottom:8}}>Оставьте пустым для получения всех категорий</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))',gap:6}}>
                  {ALL_CATEGORIES.map(cat=>{
                    const active=(editUserForm.notify_categories||[]).includes(cat.value)
                    return (<button key={cat.value} type="button" onClick={()=>{const cats=editUserForm.notify_categories||[];setEditUserForm({...editUserForm,notify_categories:active?cats.filter(c=>c!==cat.value):[...cats,cat.value]})}} style={{padding:'8px',borderRadius:6,cursor:'pointer',fontSize:12,textAlign:'center',transition:'all 0.2s',border:`2px solid ${active?'#00d4ff':'#1a2940'}`,background:active?'#00d4ff15':'#0d1b2a',color:active?'#00d4ff':'#6b7280'}}>{active?'✓':'○'} {cat.label}</button>)
                  })}
                </div>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
                <button type="button" className="btn" onClick={()=>setEditUser(null)} style={{background:'#1a2940',color:'#9aa4b2'}}>Отмена</button>
                <button type="button" className="btn btn-primary" disabled={editUserSaving} onClick={handleSaveUser}>{editUserSaving?'Сохранение...':'💾 Сохранить'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send message to user modal */}
      {sendUserModal && (
        <div style={{position:'fixed',inset:0,background:'#000a',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={()=>setSendUserModal(null)}>
          <div className="card" style={{width:'100%',maxWidth:440,padding:24}} onClick={e=>e.stopPropagation()}>
            <h3 style={{marginTop:0}}>💬 Отправить сообщение</h3>
            <div style={{fontSize:13,color:'#9aa4b2',marginBottom:12}}>
              Кому: <b style={{color:'#fff'}}>{sendUserModal.first_name||sendUserModal.username||sendUserModal.telegram_id}</b>
            </div>
            <textarea className="input" rows={4} value={sendUserMsg} onChange={e=>setSendUserMsg(e.target.value)} placeholder="Введите сообщение..." style={{width:'100%',marginBottom:12}}/>
            {sendUserResult && (
              <div style={{fontSize:12,marginBottom:12,padding:'6px 10px',borderRadius:4,background:sendUserResult.sent?'#4ade8020':'#ef444420',color:sendUserResult.sent?'#4ade80':'#ef4444'}}>
                {sendUserResult.sent?'✓ Сообщение отправлено!':`✗ ${sendUserResult.error||'Ошибка'}`}
              </div>
            )}
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button type="button" className="btn" onClick={()=>setSendUserModal(null)} style={{background:'#1a2940',color:'#9aa4b2'}}>Закрыть</button>
              <button type="button" className="btn btn-primary" disabled={sendUserSending||!sendUserMsg.trim()} onClick={handleSendToUser}>{sendUserSending?'Отправка...':'📤 Отправить'}</button>
            </div>
          </div>
        </div>
      )}

    </ProtectedRoute>
  )
}

const inputStyle = {padding:'6px 10px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:12,width:180,outline:'none'}
