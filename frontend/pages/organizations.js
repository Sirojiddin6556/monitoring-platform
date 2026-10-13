import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  Building2,
  Users,
  Server,
  Globe,
  Plus,
  Trash2,
  Edit2,
  X,
  AlertTriangle,
  Check,
  Shield,
  Layers,
  ChevronRight,
  RefreshCw,
  ExternalLink
} from 'lucide-react'

function OrgCard({ org, selected, onClick }) {
  const orgColor = org.color || '#3b82f6'
  return (
    <div
      onClick={onClick}
      style={{
        padding: 14,
        borderRadius: 10,
        cursor: 'pointer',
        background: selected ? 'rgba(37, 99, 235, 0.15)' : '#101726',
        border: selected ? `1px solid ${orgColor}` : '1px solid #1e293b',
        boxShadow: selected ? `0 0 12px ${orgColor}25` : 'none',
        transition: 'all 0.15s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: orgColor, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{org.name}</span>
      </div>

      {org.description && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 1.4 }}>
          {org.description}
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#64748b' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Users size={12} color="#94a3b8" />
          {org.members_count || 0}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Server size={12} color="#94a3b8" />
          {org.servers_count || 0}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Globe size={12} color="#94a3b8" />
          {org.websites_count || 0}
        </span>
      </div>
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#101726',
          border: '1px solid #1e293b',
          borderRadius: 12,
          padding: 24,
          maxWidth: 480,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function Organizations() {
  const [mounted, setMounted] = useState(false)
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
  const [orgForm, setOrgForm] = useState({ name: '', description: '', color: '#3b82f6' })
  const [formError, setFormError] = useState(null)
  const [formLoading, setFormLoading] = useState(false)

  useEffect(() => {
    setMounted(true)
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch {}
    }
    loadOrgs()
  }, [])

  const isAdmin = user?.role === 'admin'

  async function loadOrgs() {
    setLoading(true)
    setError(null)
    try {
      const d = await apiFetch('/api/organizations')
      const orgList = d.organizations || []
      setOrgs(orgList)
      if (orgList.length > 0 && !selected) {
        selectOrg(orgList[0])
      }
    } catch (e) {
      setError('Ошибка загрузки списка организаций')
    } finally {
      setLoading(false)
    }
  }

  async function loadMembers(orgId) {
    try {
      const d = await apiFetch(`/api/organizations/${orgId}/members`)
      setMembers(d.members || [])
    } catch (e) {
      setMembers([])
    }
  }

  async function loadAllUsers() {
    try {
      const d = await apiFetch('/api/admin/users')
      setAllUsers(Array.isArray(d) ? d : d.users || [])
    } catch (e) {
      setAllUsers([])
    }
  }

  async function loadAllServers() {
    try {
      const d = await apiFetch('/api/servers')
      setAllServers(d.servers || [])
    } catch (e) {
      setAllServers([])
    }
  }

  async function loadAllWebsites() {
    try {
      const d = await apiFetch('/api/websites')
      setAllWebsites(d.websites || [])
    } catch (e) {
      setAllWebsites([])
    }
  }

  function selectOrg(org) {
    setSelected(org)
    loadMembers(org.id)
    loadAllServers()
    loadAllWebsites()
    if (isAdmin) {
      loadAllUsers()
    }
  }

  async function handleCreateOrg(e) {
    e.preventDefault()
    setFormError(null)
    setFormLoading(true)
    try {
      const res = await apiFetch('/api/organizations', {
        method: 'POST',
        body: JSON.stringify(orgForm)
      })
      if (res.detail) {
        setFormError(res.detail)
        return
      }
      setShowCreateOrg(false)
      setOrgForm({ name: '', description: '', color: '#3b82f6' })
      await loadOrgs()
    } catch (err) {
      setFormError(err.message || 'Ошибка создания организации')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleEditOrg(e) {
    e.preventDefault()
    setFormError(null)
    setFormLoading(true)
    try {
      const res = await apiFetch(`/api/organizations/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify(orgForm)
      })
      if (res.detail) {
        setFormError(res.detail)
        return
      }
      setShowEditOrg(false)
      await loadOrgs()
      setSelected({ ...selected, ...orgForm })
    } catch (err) {
      setFormError(err.message || 'Ошибка обновления')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDeleteOrg(orgId) {
    if (!confirm('Вы действительно хотите удалить данную организацию?')) return
    try {
      await apiFetch(`/api/organizations/${orgId}`, { method: 'DELETE' })
      setSelected(null)
      setMembers([])
      await loadOrgs()
    } catch (err) {
      setError(err.message || 'Ошибка удаления')
    }
  }

  async function handleAddMember(userId) {
    try {
      const res = await apiFetch(`/api/organizations/${selected.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId })
      })
      if (res.detail && !res.message) {
        alert(res.detail)
        return
      }
      await loadMembers(selected.id)
      await loadOrgs()
      await loadAllUsers()
    } catch (err) {
      alert(err.message || 'Ошибка добавления пользователя')
    }
  }

  async function handleRemoveMember(userId) {
    if (!confirm('Удалить пользователя из состава организации?')) return
    try {
      await apiFetch(`/api/organizations/${selected.id}/members/${userId}`, { method: 'DELETE' })
      await loadMembers(selected.id)
      await loadOrgs()
      await loadAllUsers()
    } catch (err) {
      alert(err.message || 'Ошибка исключения пользователя')
    }
  }

  async function handleAssignServer(serverId, orgId) {
    try {
      await apiFetch(`/api/servers/${serverId}/organization`, {
        method: 'PUT',
        body: JSON.stringify({ org_id: orgId })
      })
      await loadAllServers()
      await loadOrgs()
    } catch (err) {
      alert(err.message || 'Ошибка привязки сервера')
    }
  }

  async function handleAssignWebsite(websiteId, orgId) {
    try {
      await apiFetch(`/api/websites/${websiteId}/organization`, {
        method: 'PUT',
        body: JSON.stringify({ org_id: orgId })
      })
      await loadAllWebsites()
      await loadOrgs()
    } catch (err) {
      alert(err.message || 'Ошибка привязки веб-сайта')
    }
  }

  if (!mounted) return null

  const orgServers = allServers.filter(s => s.org_id === selected?.id)
  const orgWebsites = allWebsites.filter(w => w.org_id === selected?.id)
  const availableUsers = allUsers.filter(u => !members.find(m => m.id === u.id))
  const unassignedServers = allServers.filter(s => !s.org_id)
  const unassignedWebsites = allWebsites.filter(w => !w.org_id)

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '24px 32px', overflow: 'auto', boxSizing: 'border-box' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 24,
              flexWrap: 'wrap',
              gap: 16
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                <Building2 size={26} color="#38bdf8" />
                Организации & Структуры
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
                Разграничение прав доступа, группировка серверов, веб-сайтов и сотрудников
              </p>
            </div>

            {isAdmin && (
              <button
                onClick={() => {
                  setOrgForm({ name: '', description: '', color: '#3b82f6' })
                  setShowCreateOrg(true)
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Plus size={16} />
                Создать организацию
              </button>
            )}
          </div>

          {error && (
            <div
              style={{
                marginBottom: 20,
                padding: '12px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 8,
                color: '#f87171',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}
            >
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
            {/* Left Column: Organization List */}
            <div
              style={{
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 12,
                padding: 16
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Все организации ({orgs.length})
                </span>
                <button
                  onClick={loadOrgs}
                  title="Обновить список"
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              {loading ? (
                <div style={{ color: '#94a3b8', fontSize: 13, padding: 30, textAlign: 'center' }}>
                  <RefreshCw size={18} className="spin" style={{ margin: '0 auto 8px' }} />
                  Загрузка...
                </div>
              ) : orgs.length === 0 ? (
                <div
                  style={{
                    color: '#94a3b8',
                    fontSize: 13,
                    padding: 30,
                    textAlign: 'center',
                    background: '#090d16',
                    borderRadius: 8,
                    border: '1px dashed #1e293b'
                  }}
                >
                  Организации отсутствуют
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {orgs.map(org => (
                    <OrgCard
                      key={org.id}
                      org={org}
                      selected={selected?.id === org.id}
                      onClick={() => selectOrg(org)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Selected Org Details */}
            {selected ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Header Card */}
                <div
                  style={{
                    background: '#101726',
                    border: '1px solid #1e293b',
                    borderRadius: 12,
                    padding: 20
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          background: selected.color || '#3b82f6',
                          flexShrink: 0
                        }}
                      />
                      <div>
                        <h2 style={{ margin: 0, color: '#fff', fontSize: 20, fontWeight: 700 }}>{selected.name}</h2>
                        {selected.description && (
                          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 3 }}>{selected.description}</div>
                        )}
                      </div>
                    </div>

                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => {
                            setOrgForm({
                              name: selected.name,
                              description: selected.description || '',
                              color: selected.color || '#3b82f6'
                            })
                            setShowEditOrg(true)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: '1px solid #334155',
                            background: '#1e293b',
                            color: '#94a3b8',
                            fontSize: 12,
                            cursor: 'pointer'
                          }}
                        >
                          <Edit2 size={13} />
                          Редактировать
                        </button>
                        <button
                          onClick={() => handleDeleteOrg(selected.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#f87171',
                            fontSize: 12,
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={13} />
                          Удалить
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* KPI Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <div
                    style={{
                      background: '#101726',
                      border: '1px solid #1e293b',
                      borderRadius: 12,
                      padding: 16,
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: 26, fontWeight: 700, color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Users size={20} />
                      {members.length}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Сотрудников в организации</div>
                  </div>

                  <div
                    style={{
                      background: '#101726',
                      border: '1px solid #1e293b',
                      borderRadius: 12,
                      padding: 16,
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: 26, fontWeight: 700, color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Server size={20} />
                      {orgServers.length}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Привязанных серверов</div>
                  </div>

                  <div
                    style={{
                      background: '#101726',
                      border: '1px solid #1e293b',
                      borderRadius: 12,
                      padding: 16,
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: 26, fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Globe size={20} />
                      {orgWebsites.length}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Веб-ресурсов на мониторинге</div>
                  </div>
                </div>

                {/* Members Section */}
                <div
                  style={{
                    background: '#101726',
                    border: '1px solid #1e293b',
                    borderRadius: 12,
                    padding: 20
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Users size={16} color="#38bdf8" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Пользователи ({members.length})
                      </span>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          loadAllUsers()
                          setShowAddMember(true)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: '#2563eb',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <Plus size={14} />
                        Добавить сотрудника
                      </button>
                    )}
                  </div>

                  {members.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: 20 }}>
                      Пользователи еще не включены в эту организацию
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {members.map(m => (
                        <div
                          key={m.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 14px',
                            background: '#090d16',
                            borderRadius: 8,
                            border: '1px solid #1e293b'
                          }}
                        >
                          <div>
                            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{m.name || m.email}</span>
                            <span
                              style={{
                                marginLeft: 10,
                                fontSize: 10,
                                padding: '2px 8px',
                                borderRadius: 10,
                                background: m.role === 'admin' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                                color: m.role === 'admin' ? '#facc15' : '#38bdf8',
                                fontWeight: 700,
                                textTransform: 'uppercase'
                              }}
                            >
                              {m.role}
                            </span>
                          </div>

                          {isAdmin && (
                            <button
                              onClick={() => handleRemoveMember(m.id)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 4,
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                background: 'transparent',
                                color: '#f87171',
                                fontSize: 11,
                                cursor: 'pointer'
                              }}
                            >
                              Исключить
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Servers Section */}
                <div
                  style={{
                    background: '#101726',
                    border: '1px solid #1e293b',
                    borderRadius: 12,
                    padding: 20
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Server size={16} color="#38bdf8" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Привязанные серверы ({orgServers.length})
                      </span>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          loadAllServers()
                          setShowAssignServer(true)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid rgba(56, 189, 248, 0.4)',
                          background: 'rgba(56, 189, 248, 0.1)',
                          color: '#38bdf8',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <Plus size={14} />
                        Привязать сервер
                      </button>
                    )}
                  </div>

                  {orgServers.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: 20 }}>
                      Серверы не привязаны к этой организации
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {orgServers.map(s => (
                        <div
                          key={s.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 14px',
                            background: '#090d16',
                            borderRadius: 8,
                            border: '1px solid #1e293b'
                          }}
                        >
                          <div>
                            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                            <span style={{ marginLeft: 10, color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }}>
                              {s.host || s.id}
                            </span>
                          </div>

                          {isAdmin && (
                            <button
                              onClick={() => handleAssignServer(s.id, null)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 4,
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                background: 'transparent',
                                color: '#f87171',
                                fontSize: 11,
                                cursor: 'pointer'
                              }}
                            >
                              Отвязать
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Websites Section */}
                <div
                  style={{
                    background: '#101726',
                    border: '1px solid #1e293b',
                    borderRadius: 12,
                    padding: 20
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Globe size={16} color="#38bdf8" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Веб-ресурсы ({orgWebsites.length})
                      </span>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          loadAllWebsites()
                          setShowAssignWebsite(true)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid rgba(56, 189, 248, 0.4)',
                          background: 'rgba(56, 189, 248, 0.1)',
                          color: '#38bdf8',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <Plus size={14} />
                        Привязать веб-сайт
                      </button>
                    )}
                  </div>

                  {orgWebsites.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: 20 }}>
                      Веб-ресурсы не привязаны к этой организации
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {orgWebsites.map(w => (
                        <div
                          key={w.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 14px',
                            background: '#090d16',
                            borderRadius: 8,
                            border: '1px solid #1e293b'
                          }}
                        >
                          <div>
                            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{w.name}</span>
                            <span style={{ marginLeft: 10, color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }}>
                              {w.url}
                            </span>
                          </div>

                          {isAdmin && (
                            <button
                              onClick={() => handleAssignWebsite(w.id, null)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 4,
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                background: 'transparent',
                                color: '#f87171',
                                fontSize: 11,
                                cursor: 'pointer'
                              }}
                            >
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
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 340,
                  color: '#64748b',
                  fontSize: 14,
                  background: '#101726',
                  borderRadius: 12,
                  border: '1px dashed #1e293b'
                }}
              >
                <Building2 size={36} color="#334155" style={{ marginBottom: 12 }} />
                <div>Выберите организацию из списка слева</div>
              </div>
            )}
          </div>

          {/* Modal: Create Org */}
          {showCreateOrg && (
            <Modal title="Создать новую организацию" onClose={() => setShowCreateOrg(false)}>
              <form onSubmit={handleCreateOrg}>
                {formError && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      padding: 10,
                      borderRadius: 8,
                      marginBottom: 14,
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <AlertTriangle size={16} />
                    {formError}
                  </div>
                )}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 6 }}>
                    Название организации <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    value={orgForm.name}
                    onChange={e => setOrgForm({ ...orgForm, name: e.target.value })}
                    required
                    style={modernInputStyle}
                    placeholder="Например: Департамент информационных технологий"
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 6 }}>Описание</label>
                  <textarea
                    value={orgForm.description}
                    onChange={e => setOrgForm({ ...orgForm, description: e.target.value })}
                    style={{ ...modernInputStyle, height: 70, resize: 'vertical' }}
                    placeholder="Краткое назначение и подразделения..."
                  />
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 6 }}>Фирменный цвет</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={orgForm.color}
                      onChange={e => setOrgForm({ ...orgForm, color: e.target.value })}
                      style={{ width: 44, height: 34, border: 'none', cursor: 'pointer', background: 'transparent' }}
                    />
                    <span style={{ color: '#fff', fontSize: 13, fontFamily: 'monospace' }}>{orgForm.color}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateOrg(false)}
                    style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#2563eb',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {formLoading ? 'Создание...' : 'Создать'}
                  </button>
                </div>
              </form>
            </Modal>
          )}

          {/* Modal: Edit Org */}
          {showEditOrg && (
            <Modal title="Редактировать организацию" onClose={() => setShowEditOrg(false)}>
              <form onSubmit={handleEditOrg}>
                {formError && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      padding: 10,
                      borderRadius: 8,
                      marginBottom: 14,
                      fontSize: 12
                    }}
                  >
                    {formError}
                  </div>
                )}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 6 }}>Название</label>
                  <input
                    value={orgForm.name}
                    onChange={e => setOrgForm({ ...orgForm, name: e.target.value })}
                    required
                    style={modernInputStyle}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 6 }}>Описание</label>
                  <textarea
                    value={orgForm.description}
                    onChange={e => setOrgForm({ ...orgForm, description: e.target.value })}
                    style={{ ...modernInputStyle, height: 70, resize: 'vertical' }}
                  />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 6 }}>Цвет</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={orgForm.color}
                      onChange={e => setOrgForm({ ...orgForm, color: e.target.value })}
                      style={{ width: 44, height: 34, border: 'none', cursor: 'pointer', background: 'transparent' }}
                    />
                    <span style={{ color: '#fff', fontSize: 13, fontFamily: 'monospace' }}>{orgForm.color}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowEditOrg(false)}
                    style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#2563eb',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {formLoading ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>
              </form>
            </Modal>
          )}

          {/* Modal: Add Member */}
          {showAddMember && (
            <Modal title="Добавить сотрудника в организацию" onClose={() => setShowAddMember(false)}>
              {availableUsers.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  Все зарегистрированные пользователи уже входят в эту организацию
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {availableUsers.map(u => (
                    <div
                      key={u.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: '#090d16',
                        borderRadius: 8,
                        border: '1px solid #1e293b'
                      }}
                    >
                      <div>
                        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{u.username || u.email}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Роль: {u.role}</div>
                      </div>
                      <button
                        onClick={() => handleAddMember(u.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: '#2563eb',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Добавить
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Modal>
          )}

          {/* Modal: Assign Server */}
          {showAssignServer && (
            <Modal title="Привязать сервер к организации" onClose={() => setShowAssignServer(false)}>
              {unassignedServers.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  Все доступные серверы уже привязаны к организациям
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {unassignedServers.map(s => (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: '#090d16',
                        borderRadius: 8,
                        border: '1px solid #1e293b'
                      }}
                    >
                      <div>
                        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{s.host || s.id}</div>
                      </div>
                      <button
                        onClick={() => {
                          handleAssignServer(s.id, selected.id)
                          setShowAssignServer(false)
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid rgba(56, 189, 248, 0.4)',
                          background: 'rgba(56, 189, 248, 0.1)',
                          color: '#38bdf8',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Привязать
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Modal>
          )}

          {/* Modal: Assign Website */}
          {showAssignWebsite && (
            <Modal title="Привязать веб-сайт к организации" onClose={() => setShowAssignWebsite(false)}>
              {unassignedWebsites.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  Все добавленные веб-ресурсы уже распределены по организациям
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {unassignedWebsites.map(w => (
                    <div
                      key={w.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: '#090d16',
                        borderRadius: 8,
                        border: '1px solid #1e293b'
                      }}
                    >
                      <div>
                        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{w.name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{w.url}</div>
                      </div>
                      <button
                        onClick={() => {
                          handleAssignWebsite(w.id, selected.id)
                          setShowAssignWebsite(false)
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid rgba(56, 189, 248, 0.4)',
                          background: 'rgba(56, 189, 248, 0.1)',
                          color: '#38bdf8',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Привязать
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Modal>
          )}
        </main>
      </div>
    </ProtectedRoute>
  )
}

const modernInputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #1e293b',
  background: '#090d16',
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box'
}
