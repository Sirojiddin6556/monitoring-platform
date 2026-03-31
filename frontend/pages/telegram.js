import {useEffect, useState} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'

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

  const loadBots = async () => {
    try {
      setError(null)
      const {default: apiFetch} = await import('../lib/api')
      const d = await apiFetch('/api/telegram/bots')
      setBots(d.bots || [])
    } catch(err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadBots() }, [])

  async function handleAdd(e) {
    e.preventDefault(); setAddError(null)
    if(!addForm.name.trim() || !addForm.token.trim()) { setAddError('Имя и токен обязательны'); return }
    setAddLoading(true)
    try {
      const {default: apiFetch} = await import('../lib/api')
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
      const {default: apiFetch} = await import('../lib/api')
      await apiFetch(`/api/telegram/bots/${id}`, {method:'DELETE'})
      if(selected?.id===id) { setSelected(null); setUpdates([]) }
      await loadBots()
    } catch(err) { setError('Ошибка удаления') }
  }

  async function handleCheck(id) {
    setCheckLoading(true)
    try {
      const {default: apiFetch} = await import('../lib/api')
      await apiFetch(`/api/telegram/bots/${id}/check`, {method:'POST'})
      await loadBots()
    } catch(err) { setError('Ошибка проверки') }
    finally { setCheckLoading(false) }
  }

  async function loadUpdates(bot) {
    setSelected(bot)
    setUpdates([])
    setSendResult(null)
    try {
      const {default: apiFetch} = await import('../lib/api')
      const d = await apiFetch(`/api/telegram/bots/${bot.id}/updates`)
      setUpdates(d.updates||[])
    } catch(err) { }
  }

  async function handleSend() {
    if(!selected || !sendForm.trim()) return
    setSendResult(null)
    try {
      const {default: apiFetch} = await import('../lib/api')
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
    <ProtectedRoute>
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
    </ProtectedRoute>
  )
}

const inputStyle = {padding:'6px 10px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:12,width:180,outline:'none'}
