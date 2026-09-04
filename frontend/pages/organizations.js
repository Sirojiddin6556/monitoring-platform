import {useState, useEffect} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 4,
  border: '1px solid #1a2940', background: '#07111e', color: '#fff', fontSize: 12, outline: 'none'
}

const btnPrimary = {
  padding: '8px 16px', background: '#6c5ce740', color: '#6c5ce7',
  border: '1px solid #6c5ce7', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer'
}

const btnDanger = {
  padding: '6px 12px', background: '#ef444440', color: '#ef4444',
  border: '1px solid #ef4444', borderRadius: 4, fontSize: 11, cursor: 'pointer'
}

const btnSmall = {
  padding: '4px 10px', background: '#00d4ff30', color: '#00d4ff',
  border: '1px solid #00d4ff', borderRadius: 3, fontSize: 11, cursor: 'pointer'
}

function OrgCard({org, selected, onClick}) {
  return (
    <div onClick={onClick} style={{
      padding: 14, borderRadius: 8, cursor: 'pointer',
      background: selected ? '#0a1a2e' : '#071226',
      border: selected ? `2px solid ${org.color || '#6c5ce7'}` : '1px solid #1a2940',
      transition: 'all 0.2s'
    }}>
      <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8}}>
        <div style={{width: 12, height: 12, borderRadius: 3, background: org.color || '#6c5ce7'}}/>
        <span style={{fontSize: 14, fontWeight: 600, color: '#fff'}}>{org.name}</span>
      </div>
      {org.description && <div style={{fontSize: 11, color: '#9aa4b2', marginBottom: 8}}>{org.description}</div>}
      <div style={{display: 'flex', gap: 12, fontSize: 11, color: '#9aa4b2'}}>
        <span>👥 {org.members_count || 0}</span>
        <span>🖥️ {org.servers_count || 0}</span>
        <span>🌐 {org.websites_count || 0}</span>
      </div>
    </div>
  )
}

function Modal({title, children, onClose}) {
  return (
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'#00000080',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}}>
      <div style={{background:'#0a1a2e',border:'1px solid #1a2940',borderRadius:8,padding:24,maxWidth:480,width:'100%',maxHeight:'80vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{margin:0,color:'#fff'}}>{title}</h3>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#9aa4b2',fontSize:18,cursor:'pointer'}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function Organizations() {
  const [orgs, setOrgs] = useState([])
  const [selected, setSelected] = useState(null)
  const [members, setMembers] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [allServers, setAllServers] = useState([])
  const [allWebsites, setAllWebsites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [user, setUser] = useState(null)

  // Modals
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [showEditOrg, setShowEditOrg] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [showAssignServer, setShowAssignServer] = useState(false)
  const [showAssignWebsite, setShowAssignWebsite] = useState(false)

  // Form
  const [orgForm, setOrgForm] = useState({name:'', description:'', color:'#6c5ce7'})
  const [formError, setFormError] = useState(null)
  const [formLoading, setFormLoading] = useState(false)

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if(storedUser) setUser(JSON.parse(storedUser))
    loadOrgs()
  }, [])

  const isAdmin = user?.role === 'admin'

  async function loadOrgs() {
    setLoading(true); setError(null)
    try {

      const d = await apiFetch('/api/organizations')
      setOrgs(d.organizations || [])
    } catch(e) { setError('Ошибка загрузки организаций') }
    finally { setLoading(false) }
  }

  async function loadMembers(orgId) {
    try {

      const d = await apiFetch(`/api/organizations/${orgId}/members`)
      setMembers(d.members || [])
    } catch(e) { setMembers([]) }
  }

  async function loadAllUsers() {
    try {

      const d = await apiFetch('/api/admin/users')
      setAllUsers(Array.isArray(d) ? d : (d.users || []))
    } catch(e) { setAllUsers([]) }
  }

  async function loadAllServers() {
    try {

      const d = await apiFetch('/api/servers')
      setAllServers(d.servers || [])
    } catch(e) { setAllServers([]) }
  }

  async function loadAllWebsites() {
    try {

      const d = await apiFetch('/api/websites')
      setAllWebsites(d.websites || [])
    } catch(e) { setAllWebsites([]) }
  }

  function selectOrg(org) {
    setSelected(org)
    loadMembers(org.id)
    loadAllServers()
    loadAllWebsites()
    if(isAdmin) {
      loadAllUsers()
    }
  }

  // CRUD
  async function handleCreateOrg(e) {
    e.preventDefault(); setFormError(null); setFormLoading(true)
    try {

      const res = await apiFetch('/api/organizations', {method:'POST', body: JSON.stringify(orgForm)})
      if(res.detail) { setFormError(res.detail); return }
      setShowCreateOrg(false); setOrgForm({name:'',description:'',color:'#6c5ce7'}); await loadOrgs()
    } catch(err) { setFormError(err.message) }
    finally { setFormLoading(false) }
  }

  async function handleEditOrg(e) {
    e.preventDefault(); setFormError(null); setFormLoading(true)
    try {

      const res = await apiFetch(`/api/organizations/${selected.id}`, {method:'PUT', body: JSON.stringify(orgForm)})
      if(res.detail) { setFormError(res.detail); return }
      setShowEditOrg(false); await loadOrgs()
      setSelected({...selected, ...orgForm})
    } catch(err) { setFormError(err.message) }
    finally { setFormLoading(false) }
  }

  async function handleDeleteOrg(orgId) {
    if(!confirm('Удалить организацию?')) return
    try {

      await apiFetch(`/api/organizations/${orgId}`, {method:'DELETE'})
      setSelected(null); setMembers([]); await loadOrgs()
    } catch(err) { setError(err.message) }
  }

  async function handleAddMember(userId) {
    try {

      const res = await apiFetch(`/api/organizations/${selected.id}/members`, {method:'POST', body: JSON.stringify({user_id: userId})})
      if(res.detail && !res.message) { alert(res.detail); return }
      await loadMembers(selected.id); await loadOrgs(); await loadAllUsers()
    } catch(err) { alert(err.message) }
  }

  async function handleRemoveMember(userId) {
    if(!confirm('Убрать пользователя из организации?')) return
    try {

      await apiFetch(`/api/organizations/${selected.id}/members/${userId}`, {method:'DELETE'})
      await loadMembers(selected.id); await loadOrgs(); await loadAllUsers()
    } catch(err) { alert(err.message) }
  }

  async function handleAssignServer(serverId, orgId) {
    try {

      await apiFetch(`/api/servers/${serverId}/organization`, {method:'PUT', body: JSON.stringify({org_id: orgId})})
      await loadAllServers(); await loadOrgs()
    } catch(err) { alert(err.message) }
  }

  async function handleAssignWebsite(websiteId, orgId) {
    try {

      await apiFetch(`/api/websites/${websiteId}/organization`, {method:'PUT', body: JSON.stringify({org_id: orgId})})
      await loadAllWebsites(); await loadOrgs()
    } catch(err) { alert(err.message) }
  }

  const orgServers = allServers.filter(s => s.org_id === selected?.id)
  const orgWebsites = allWebsites.filter(w => w.org_id === selected?.id)
  const availableUsers = allUsers.filter(u => !members.find(m => m.id === u.id))
  const unassignedServers = allServers.filter(s => !s.org_id)
  const unassignedWebsites = allWebsites.filter(w => !w.org_id)

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar/>
        <div className="page" style={{padding: 24}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <div>
              <h1 style={{margin:0,color:'#fff',fontSize:22}}>Организации</h1>
              <p style={{margin:'4px 0 0',color:'#9aa4b2',fontSize:13}}>Группировка ресурсов и управление доступом</p>
            </div>
            {isAdmin && (
              <button onClick={() => {setOrgForm({name:'',description:'',color:'#6c5ce7'}); setShowCreateOrg(true)}} style={btnPrimary}>
                + Создать организацию
              </button>
            )}
          </div>

          {error && <div style={{color:'#ef4444',marginBottom:12,padding:10,background:'#ef444420',borderRadius:6}}>{error}</div>}

          <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:20,alignItems:'start'}}>
            {/* Список организаций */}
            <div>
              <div style={{fontSize:13,color:'#9aa4b2',marginBottom:8,fontWeight:600}}>Все организации ({orgs.length})</div>
              {loading ? (
                <div style={{color:'#9aa4b2',fontSize:12,padding:20,textAlign:'center'}}>Загрузка...</div>
              ) : orgs.length === 0 ? (
                <div style={{color:'#9aa4b2',fontSize:12,padding:20,textAlign:'center',background:'#071226',borderRadius:8,border:'1px solid #1a2940'}}>
                  Нет организаций
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {orgs.map(org => (
                    <OrgCard key={org.id} org={org} selected={selected?.id === org.id} onClick={() => selectOrg(org)}/>
                  ))}
                </div>
              )}
            </div>

            {/* Детали выбранной организации */}
            {selected ? (
              <div>
                {/* Заголовок */}
                <div className="card" style={{padding:20,marginBottom:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:20,height:20,borderRadius:4,background:selected.color||'#6c5ce7'}}/>
                      <div>
                        <h2 style={{margin:0,color:'#fff',fontSize:18}}>{selected.name}</h2>
                        {selected.description && <div style={{fontSize:12,color:'#9aa4b2',marginTop:2}}>{selected.description}</div>}
                      </div>
                    </div>
                    {isAdmin && (
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={() => {setOrgForm({name:selected.name,description:selected.description||'',color:selected.color||'#6c5ce7'}); setShowEditOrg(true)}} style={btnSmall}>
                          ✏️ Редактировать
                        </button>
                        <button onClick={() => handleDeleteOrg(selected.id)} style={btnDanger}>
                          🗑 Удалить
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Статистика */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
                  <div className="card" style={{padding:16,textAlign:'center'}}>
                    <div style={{fontSize:24,fontWeight:700,color:'#6c5ce7'}}>{members.length}</div>
                    <div style={{fontSize:11,color:'#9aa4b2'}}>Пользователей</div>
                  </div>
                  <div className="card" style={{padding:16,textAlign:'center'}}>
                    <div style={{fontSize:24,fontWeight:700,color:'#4ade80'}}>{orgServers.length}</div>
                    <div style={{fontSize:11,color:'#9aa4b2'}}>Серверов</div>
                  </div>
                  <div className="card" style={{padding:16,textAlign:'center'}}>
                    <div style={{fontSize:24,fontWeight:700,color:'#00d4ff'}}>{orgWebsites.length}</div>
                    <div style={{fontSize:11,color:'#9aa4b2'}}>Веб-сайтов</div>
                  </div>
                </div>

                {/* Пользователи */}
                <div className="card" style={{padding:16,marginBottom:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <h3 style={{margin:0,color:'#fff',fontSize:14}}>👥 Пользователи</h3>
                    {isAdmin && (
                      <button onClick={() => {loadAllUsers(); setShowAddMember(true)}} style={btnSmall}>
                        + Добавить
                      </button>
                    )}
                  </div>
                  {members.length === 0 ? (
                    <div style={{color:'#9aa4b2',fontSize:12,textAlign:'center',padding:12}}>Нет пользователей</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {members.map(m => (
                        <div key={m.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:'#07111e',borderRadius:4}}>
                          <div>
                            <span style={{color:'#fff',fontSize:13,fontWeight:500}}>{m.name || m.email}</span>
                            <span style={{marginLeft:8,fontSize:11,padding:'2px 6px',borderRadius:3,
                              background: m.role === 'admin' ? '#facc1530' : '#3b82f630',
                              color: m.role === 'admin' ? '#facc15' : '#3b82f6'
                            }}>{m.role}</span>
                          </div>
                          {isAdmin && (
                            <button onClick={() => handleRemoveMember(m.id)} style={{...btnDanger,padding:'3px 8px',fontSize:10}}>
                              Убрать
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Серверы */}
                <div className="card" style={{padding:16,marginBottom:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <h3 style={{margin:0,color:'#fff',fontSize:14}}>🖥️ Серверы</h3>
                    {isAdmin && (
                      <button onClick={() => {loadAllServers(); setShowAssignServer(true)}} style={btnSmall}>
                        + Привязать
                      </button>
                    )}
                  </div>
                  {orgServers.length === 0 ? (
                    <div style={{color:'#9aa4b2',fontSize:12,textAlign:'center',padding:12}}>Нет серверов</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {orgServers.map(s => (
                        <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:'#07111e',borderRadius:4}}>
                          <div>
                            <span style={{color:'#fff',fontSize:13,fontWeight:500}}>{s.name}</span>
                            <span style={{marginLeft:8,color:'#9aa4b2',fontSize:11}}>{s.host || s.id}</span>
                          </div>
                          {isAdmin && (
                            <button onClick={() => handleAssignServer(s.id, null)} style={{...btnDanger,padding:'3px 8px',fontSize:10}}>
                              Отвязать
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Веб-сайты */}
                <div className="card" style={{padding:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <h3 style={{margin:0,color:'#fff',fontSize:14}}>🌐 Веб-сайты</h3>
                    {isAdmin && (
                      <button onClick={() => {loadAllWebsites(); setShowAssignWebsite(true)}} style={btnSmall}>
                        + Привязать
                      </button>
                    )}
                  </div>
                  {orgWebsites.length === 0 ? (
                    <div style={{color:'#9aa4b2',fontSize:12,textAlign:'center',padding:12}}>Нет веб-сайтов</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {orgWebsites.map(w => (
                        <div key={w.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:'#07111e',borderRadius:4}}>
                          <div>
                            <span style={{color:'#fff',fontSize:13,fontWeight:500}}>{w.name}</span>
                            <span style={{marginLeft:8,color:'#9aa4b2',fontSize:11}}>{w.url}</span>
                          </div>
                          {isAdmin && (
                            <button onClick={() => handleAssignWebsite(w.id, null)} style={{...btnDanger,padding:'3px 8px',fontSize:10}}>
                              Отвязать
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:300,color:'#9aa4b2',fontSize:14}}>
                Выберите организацию из списка
              </div>
            )}
          </div>

          {/* Модал: Создание организации */}
          {showCreateOrg && (
            <Modal title="Создать организацию" onClose={() => setShowCreateOrg(false)}>
              <form onSubmit={handleCreateOrg}>
                {formError && <div style={{color:'#ef4444',marginBottom:10,fontSize:12}}>{formError}</div>}
                <div style={{marginBottom:12}}>
                  <label style={{color:'#9aa4b2',fontSize:11,display:'block',marginBottom:4}}>Название *</label>
                  <input value={orgForm.name} onChange={e => setOrgForm({...orgForm, name: e.target.value})} required style={inputStyle} placeholder="Например: Отдел разработки"/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{color:'#9aa4b2',fontSize:11,display:'block',marginBottom:4}}>Описание</label>
                  <textarea value={orgForm.description} onChange={e => setOrgForm({...orgForm, description: e.target.value})} style={{...inputStyle,height:60,resize:'vertical'}} placeholder="Опционально"/>
                </div>
                <div style={{marginBottom:16}}>
                  <label style={{color:'#9aa4b2',fontSize:11,display:'block',marginBottom:4}}>Цвет</label>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <input type="color" value={orgForm.color} onChange={e => setOrgForm({...orgForm, color: e.target.value})} style={{width:40,height:32,border:'none',cursor:'pointer',background:'transparent'}}/>
                    <span style={{color:'#9aa4b2',fontSize:11}}>{orgForm.color}</span>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                  <button type="button" onClick={() => setShowCreateOrg(false)} style={{...btnDanger,background:'transparent'}}>Отмена</button>
                  <button type="submit" disabled={formLoading} style={btnPrimary}>{formLoading ? 'Создание...' : 'Создать'}</button>
                </div>
              </form>
            </Modal>
          )}

          {/* Модал: Редактирование */}
          {showEditOrg && (
            <Modal title="Редактировать организацию" onClose={() => setShowEditOrg(false)}>
              <form onSubmit={handleEditOrg}>
                {formError && <div style={{color:'#ef4444',marginBottom:10,fontSize:12}}>{formError}</div>}
                <div style={{marginBottom:12}}>
                  <label style={{color:'#9aa4b2',fontSize:11,display:'block',marginBottom:4}}>Название</label>
                  <input value={orgForm.name} onChange={e => setOrgForm({...orgForm, name: e.target.value})} required style={inputStyle}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{color:'#9aa4b2',fontSize:11,display:'block',marginBottom:4}}>Описание</label>
                  <textarea value={orgForm.description} onChange={e => setOrgForm({...orgForm, description: e.target.value})} style={{...inputStyle,height:60,resize:'vertical'}}/>
                </div>
                <div style={{marginBottom:16}}>
                  <label style={{color:'#9aa4b2',fontSize:11,display:'block',marginBottom:4}}>Цвет</label>
                  <input type="color" value={orgForm.color} onChange={e => setOrgForm({...orgForm, color: e.target.value})} style={{width:40,height:32,border:'none',cursor:'pointer',background:'transparent'}}/>
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                  <button type="button" onClick={() => setShowEditOrg(false)} style={{...btnDanger,background:'transparent'}}>Отмена</button>
                  <button type="submit" disabled={formLoading} style={btnPrimary}>{formLoading ? 'Сохранение...' : 'Сохранить'}</button>
                </div>
              </form>
            </Modal>
          )}

          {/* Модал: Добавить пользователя */}
          {showAddMember && (
            <Modal title="Добавить пользователя" onClose={() => setShowAddMember(false)}>
              {availableUsers.length === 0 ? (
                <div style={{color:'#9aa4b2',fontSize:12,textAlign:'center',padding:20}}>Все пользователи уже добавлены</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {availableUsers.map(u => (
                    <div key={u.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:'#07111e',borderRadius:4}}>
                      <div>
                        <span style={{color:'#fff',fontSize:13}}>{u.username || u.email}</span>
                        <span style={{marginLeft:8,fontSize:11,color:'#9aa4b2'}}>{u.role}</span>
                      </div>
                      <button onClick={() => handleAddMember(u.id)} style={btnSmall}>Добавить</button>
                    </div>
                  ))}
                </div>
              )}
            </Modal>
          )}

          {/* Модал: Привязать сервер */}
          {showAssignServer && (
            <Modal title="Привязать сервер" onClose={() => setShowAssignServer(false)}>
              {unassignedServers.length === 0 ? (
                <div style={{color:'#9aa4b2',fontSize:12,textAlign:'center',padding:20}}>Все серверы уже привязаны</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {unassignedServers.map(s => (
                    <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:'#07111e',borderRadius:4}}>
                      <div>
                        <span style={{color:'#fff',fontSize:13}}>{s.name}</span>
                        <span style={{marginLeft:8,color:'#9aa4b2',fontSize:11}}>{s.host || s.id}</span>
                      </div>
                      <button onClick={() => {handleAssignServer(s.id, selected.id); setShowAssignServer(false)}} style={btnSmall}>Привязать</button>
                    </div>
                  ))}
                </div>
              )}
            </Modal>
          )}

          {/* Модал: Привязать веб-сайт */}
          {showAssignWebsite && (
            <Modal title="Привязать веб-сайт" onClose={() => setShowAssignWebsite(false)}>
              {unassignedWebsites.length === 0 ? (
                <div style={{color:'#9aa4b2',fontSize:12,textAlign:'center',padding:20}}>Все сайты уже привязаны</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {unassignedWebsites.map(w => (
                    <div key={w.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:'#07111e',borderRadius:4}}>
                      <div>
                        <span style={{color:'#fff',fontSize:13}}>{w.name}</span>
                        <span style={{marginLeft:8,color:'#9aa4b2',fontSize:11}}>{w.url}</span>
                      </div>
                      <button onClick={() => {handleAssignWebsite(w.id, selected.id); setShowAssignWebsite(false)}} style={btnSmall}>Привязать</button>
                    </div>
                  ))}
                </div>
              )}
            </Modal>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
