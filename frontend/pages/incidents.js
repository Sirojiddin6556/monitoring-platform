import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Play,
  Archive,
  Plus,
  Search,
  RefreshCw,
  MessageSquare,
  Send,
  ShieldAlert,
  X,
  ChevronRight,
  Filter,
  Check,
  Calendar,
  Layers,
  Server
} from 'lucide-react'

const SEVERITY_CONFIG = {
  critical: {
    label: 'Критический',
    color: '#ef4444',
    bg: '#ef444418',
    border: '#ef444440',
    icon: AlertOctagon,
  },
  warning: {
    label: 'Предупреждение',
    color: '#f59e0b',
    bg: '#f59e0b18',
    border: '#f59e0b40',
    icon: AlertTriangle,
  },
  info: {
    label: 'Информация',
    color: '#3b82f6',
    bg: '#3b82f618',
    border: '#3b82f640',
    icon: Info,
  },
}

const STATUS_CONFIG = {
  open: {
    label: 'Открыт',
    color: '#ef4444',
    bg: '#ef444415',
    border: '#ef444430',
    icon: Clock,
  },
  acknowledged: {
    label: 'В работе',
    color: '#3b82f6',
    bg: '#3b82f615',
    border: '#3b82f630',
    icon: Play,
  },
  resolved: {
    label: 'Решён',
    color: '#10b981',
    bg: '#10b98115',
    border: '#10b98130',
    icon: CheckCircle2,
  },
  closed: {
    label: 'Закрыт',
    color: '#64748b',
    bg: '#64748b15',
    border: '#64748b30',
    icon: Archive,
  },
}

function SeverityBadge({ severity }) {
  const conf = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.info
  const Icon = conf.icon
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 4,
        background: conf.bg,
        border: `1px solid ${conf.border}`,
        color: conf.color,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      <Icon size={12} strokeWidth={2.2} />
      {conf.label}
    </span>
  )
}

function StatusBadge({ status }) {
  const conf = STATUS_CONFIG[status] || STATUS_CONFIG.open
  const Icon = conf.icon
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 4,
        background: conf.bg,
        border: `1px solid ${conf.border}`,
        color: conf.color,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <Icon size={12} strokeWidth={2.2} />
      {conf.label}
    </span>
  )
}

function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    severity: 'warning',
    target_type: 'server',
    target_id: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return setError('Заголовок обязателен для заполнения')
    setLoading(true)
    setError(null)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        severity: form.severity,
        target_type: form.target_type || undefined,
        target_id: form.target_id.trim() || undefined,
      }
      await apiFetch('/api/incidents', { method: 'POST', body: JSON.stringify(payload) })
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message || 'Ошибка создания инцидента')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#101726',
          border: '1px solid #1e293b',
          borderRadius: 8,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            background: '#0d1320',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertOctagon size={18} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
              Новый инцидент
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              display: 'flex',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} style={{ padding: 20 }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: '#ef444415',
                border: '1px solid #ef444430',
                borderRadius: 6,
                color: '#ef4444',
                fontSize: 12,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={15} />
              {error}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#94a3b8',
                marginBottom: 6,
              }}
            >
              Заголовок инцидента *
            </label>
            <input
              type="text"
              required
              placeholder="Например: Сбой дисковой подсистемы на srv-db-01"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: 6,
                color: '#f8fafc',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#94a3b8',
                  marginBottom: 6,
                }}
              >
                Критичность
              </label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  color: '#f8fafc',
                  fontSize: 13,
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                <option value="critical">Критический (Critical)</option>
                <option value="warning">Предупреждение (Warning)</option>
                <option value="info">Информационный (Info)</option>
              </select>
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#94a3b8',
                  marginBottom: 6,
                }}
              >
                Тип объекта
              </label>
              <select
                value={form.target_type}
                onChange={(e) => setForm({ ...form, target_type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  color: '#f8fafc',
                  fontSize: 13,
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                <option value="server">Сервер (Server)</option>
                <option value="website">Веб-сайт (Website)</option>
                <option value="vm">ВМ (Virtual Machine)</option>
                <option value="database">База данных</option>
                <option value="network">Сеть</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#94a3b8',
                marginBottom: 6,
              }}
            >
              Идентификатор объекта (необязательно)
            </label>
            <input
              type="text"
              placeholder="srv-prod-01, app-api, etc."
              value={form.target_id}
              onChange={(e) => setForm({ ...form, target_id: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: 6,
                color: '#f8fafc',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#94a3b8',
                marginBottom: 6,
              }}
            >
              Описание и детали сбоя
            </label>
            <textarea
              rows={4}
              placeholder="Опишите наблюдаемые симптомы, затронутые сервисы и шаги локализации..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: 6,
                color: '#f8fafc',
                fontSize: 13,
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #1e293b',
                background: '#090d16',
                color: '#94a3b8',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 18px',
                borderRadius: 6,
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Создание...' : 'Зарегистрировать инцидент'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Incidents() {
  const [mounted, setMounted] = useState(false)
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Comments / Notes
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [resolveNote, setResolveNote] = useState('')
  const [showResolveModal, setShowResolveModal] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const load = async () => {
    try {
      setError(null)
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (severityFilter !== 'all') params.append('severity', severityFilter)
      const qs = params.toString() ? `?${params.toString()}` : ''
      const res = await apiFetch(`/api/incidents${qs}`)
      const items = res.incidents || []
      setIncidents(items)
      if (selected) {
        const found = items.find((i) => i.id === selected.id)
        if (found) setSelected(found)
      }
    } catch (err) {
      setError(err.message || 'Ошибка загрузки инцидентов')
    } finally {
      setLoading(false)
    }
  }

  const loadComments = async (incidentId) => {
    try {
      const res = await apiFetch(`/api/incidents/${incidentId}/comments`)
      setComments(res.comments || [])
    } catch {
      setComments([])
    }
  }

  useEffect(() => {
    load()
  }, [statusFilter, severityFilter])

  useEffect(() => {
    if (selected?.id) {
      loadComments(selected.id)
    } else {
      setComments([])
    }
  }, [selected?.id])

  const doAction = async (id, action, note = null) => {
    setActionLoading(true)
    try {
      const options = { method: 'POST' }
      if (note) {
        options.body = JSON.stringify({ note })
      }
      await apiFetch(`/api/incidents/${id}/${action}`, options)
      await load()
      if (action === 'close') {
        setSelected(null)
      }
      setShowResolveModal(false)
      setResolveNote('')
    } catch (err) {
      alert(err.message || 'Не удалось выполнить действие')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!commentText.trim() || !selected?.id) return
    setCommentLoading(true)
    try {
      await apiFetch(`/api/incidents/${selected.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: commentText.trim() }),
      })
      setCommentText('')
      await loadComments(selected.id)
    } catch (err) {
      alert(err.message || 'Ошибка добавления комментария')
    } finally {
      setCommentLoading(false)
    }
  }

  const counts = incidents.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1
    return acc
  }, {})

  const filteredIncidents = incidents.filter((inc) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (inc.title || '').toLowerCase().includes(q) ||
      (inc.description || '').toLowerCase().includes(q) ||
      (inc.target_id || '').toLowerCase().includes(q) ||
      String(inc.id).includes(q)
    )
  })

  const formatDate = (isoStr) => {
    if (!isoStr || !mounted) return '—'
    try {
      const d = new Date(isoStr)
      return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return isoStr
    }
  }

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '24px 32px', overflow: 'auto', boxSizing: 'border-box' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShieldAlert size={22} color="#2563eb" />
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  Инциденты и сбои
                </h1>
              </div>
              <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0 0' }}>
                Центр управления нештатными ситуациями, эскалациями и восстановительными работами
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={load}
                title="Обновить список"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 6,
                  border: '1px solid #1e293b',
                  background: '#101726',
                  color: '#94a3b8',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} />
                Обновить
              </button>
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                }}
              >
                <Plus size={14} />
                Новый инцидент
              </button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Всего зафиксировано
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {incidents.length}
              </div>
            </div>

            <div
              style={{
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Открытые (Open)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: counts.open ? '#ef4444' : '#f8fafc', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {counts.open || 0}
              </div>
            </div>

            <div
              style={{
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                В работе (In Progress)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: counts.acknowledged ? '#3b82f6' : '#f8fafc', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {counts.acknowledged || 0}
              </div>
            </div>

            <div
              style={{
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Решённые (Resolved)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {counts.resolved || 0}
              </div>
            </div>

            <div
              style={{
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Закрытые (Closed)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#94a3b8', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {counts.closed || 0}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            {/* Status Pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'Все' },
                { id: 'open', label: 'Открытые' },
                { id: 'acknowledged', label: 'В работе' },
                { id: 'resolved', label: 'Решённые' },
                { id: 'closed', label: 'Закрытые' },
              ].map((tab) => {
                const active = statusFilter === tab.id
                const count = tab.id === 'all' ? incidents.length : counts[tab.id] || 0
                return (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      border: `1px solid ${active ? '#2563eb' : '#1e293b'}`,
                      background: active ? '#2563eb' : '#101726',
                      color: active ? '#ffffff' : '#94a3b8',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {tab.label}
                    <span
                      style={{
                        padding: '1px 5px',
                        borderRadius: 10,
                        fontSize: 10,
                        background: active ? '#1d4ed8' : '#090d16',
                        color: active ? '#ffffff' : '#64748b',
                      }}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Severity and Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 10px',
                  background: '#101726',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                }}
              >
                <Filter size={12} color="#64748b" />
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: 12,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">Все приоритеты</option>
                  <option value="critical">Критические</option>
                  <option value="warning">Предупреждения</option>
                  <option value="info">Информационные</option>
                </select>
              </div>

              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Search
                  size={13}
                  color="#64748b"
                  style={{ position: 'absolute', left: 10, pointerEvents: 'none' }}
                />
                <input
                  type="text"
                  placeholder="Поиск по инцидентам..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    padding: '6px 12px 6px 30px',
                    background: '#101726',
                    border: '1px solid #1e293b',
                    borderRadius: 6,
                    color: '#f8fafc',
                    fontSize: 12,
                    outline: 'none',
                    width: 200,
                  }}
                />
              </div>
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: '#ef444415',
                border: '1px solid #ef444430',
                borderRadius: 6,
                color: '#ef4444',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              Ошибка: {error}
            </div>
          )}

          {/* Main Content Layout */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* List Table / Cards */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {loading ? (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    background: '#101726',
                    borderRadius: 8,
                    border: '1px solid #1e293b',
                    color: '#64748b',
                    fontSize: 13,
                  }}
                >
                  Загрузка инцидентов...
                </div>
              ) : filteredIncidents.length === 0 ? (
                <div
                  style={{
                    padding: 48,
                    textAlign: 'center',
                    background: '#101726',
                    borderRadius: 8,
                    border: '1px solid #1e293b',
                    color: '#64748b',
                  }}
                >
                  <CheckCircle2 size={32} color="#10b981" style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc', marginBottom: 4 }}>
                    Инцидентов не обнаружено
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {searchQuery
                      ? 'По вашему поисковому запросу ничего не найдено.'
                      : 'Все системы работают штатно. Активные инциденты отсутствуют.'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredIncidents.map((inc) => {
                    const isSelected = selected?.id === inc.id
                    const sevConf = SEVERITY_CONFIG[inc.severity] || SEVERITY_CONFIG.info
                    return (
                      <div
                        key={inc.id}
                        onClick={() => setSelected(isSelected ? null : inc)}
                        style={{
                          background: isSelected ? '#151d2f' : '#101726',
                          border: `1px solid ${isSelected ? '#2563eb' : '#1e293b'}`,
                          borderLeft: `4px solid ${sevConf.color}`,
                          borderRadius: 6,
                          padding: '12px 16px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 16,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#94a3b8',
                                fontFeatureSettings: '"tnum"',
                              }}
                            >
                              #{inc.id}
                            </span>
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: '#f8fafc',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {inc.title}
                            </span>
                            <SeverityBadge severity={inc.severity} />
                            <StatusBadge status={inc.status} />
                            {inc.target_id && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 6px',
                                  background: '#090d16',
                                  border: '1px solid #1e293b',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  color: '#94a3b8',
                                }}
                              >
                                <Server size={10} />
                                {inc.target_id}
                              </span>
                            )}
                          </div>

                          {inc.description && (
                            <div
                              style={{
                                fontSize: 12,
                                color: '#94a3b8',
                                marginBottom: 6,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {inc.description}
                            </div>
                          )}

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 16,
                              fontSize: 11,
                              color: '#64748b',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={11} />
                              Открыт: {formatDate(inc.opened_at || inc.created_at)}
                            </span>
                            {inc.resolved_at && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10b981' }}>
                                <Check size={11} />
                                Решён: {formatDate(inc.resolved_at)}
                              </span>
                            )}
                            {inc.resolution_note && (
                              <span style={{ color: '#94a3b8' }}>
                                Решение: {inc.resolution_note.slice(0, 40)}
                                {inc.resolution_note.length > 40 ? '...' : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        <ChevronRight
                          size={16}
                          color={isSelected ? '#2563eb' : '#64748b'}
                          style={{
                            transform: isSelected ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s ease',
                            flexShrink: 0,
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Selected Incident Drawer / Details */}
            {selected && (
              <div
                style={{
                  width: 380,
                  background: '#101726',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: 'calc(100vh - 120px)',
                  position: 'sticky',
                  top: 24,
                  overflow: 'hidden',
                }}
              >
                {/* Header */}
                <div
                  style={{
                    padding: '14px 18px',
                    borderBottom: '1px solid #1e293b',
                    background: '#0d1320',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>
                      #{selected.id}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>
                      Детали инцидента
                    </span>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
                  <h3
                    style={{
                      margin: '0 0 10px 0',
                      fontSize: 15,
                      fontWeight: 600,
                      color: '#f8fafc',
                      lineHeight: 1.4,
                    }}
                  >
                    {selected.title}
                  </h3>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <SeverityBadge severity={selected.severity} />
                    <StatusBadge status={selected.status} />
                  </div>

                  {/* Actions Bar */}
                  <div
                    style={{
                      background: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: 6,
                      padding: 10,
                      marginBottom: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Действия реагирования
                    </div>

                    {selected.status === 'open' && (
                      <button
                        onClick={() => doAction(selected.id, 'acknowledge')}
                        disabled={actionLoading}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          padding: '7px 12px',
                          borderRadius: 5,
                          border: 'none',
                          background: '#2563eb',
                          color: '#ffffff',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Play size={12} />
                        Принять в работу
                      </button>
                    )}

                    {['open', 'acknowledged'].includes(selected.status) && (
                      <button
                        onClick={() => setShowResolveModal(true)}
                        disabled={actionLoading}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          padding: '7px 12px',
                          borderRadius: 5,
                          border: 'none',
                          background: '#10b981',
                          color: '#ffffff',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <CheckCircle2 size={12} />
                        Пометить решённым
                      </button>
                    )}

                    {selected.status === 'resolved' && (
                      <button
                        onClick={() => doAction(selected.id, 'close')}
                        disabled={actionLoading}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          padding: '7px 12px',
                          borderRadius: 5,
                          border: '1px solid #1e293b',
                          background: '#101726',
                          color: '#94a3b8',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Archive size={12} />
                        Закрыть инцидент в архив
                      </button>
                    )}
                  </div>

                  {/* Resolve Note Modal Overlay inside Drawer */}
                  {showResolveModal && (
                    <div
                      style={{
                        background: '#0d1320',
                        border: '1px solid #10b98140',
                        borderRadius: 6,
                        padding: 12,
                        marginBottom: 16,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#10b981', marginBottom: 6 }}>
                        Устранение инцидента
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Опишите причину и способ решения (RCA / примечание)..."
                        value={resolveNote}
                        onChange={(e) => setResolveNote(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          background: '#090d16',
                          border: '1px solid #1e293b',
                          borderRadius: 4,
                          color: '#f8fafc',
                          fontSize: 12,
                          outline: 'none',
                          marginBottom: 8,
                          boxSizing: 'border-box',
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setShowResolveModal(false)}
                          style={{
                            padding: '4px 10px',
                            background: '#101726',
                            border: '1px solid #1e293b',
                            borderRadius: 4,
                            color: '#94a3b8',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          Отмена
                        </button>
                        <button
                          onClick={() => doAction(selected.id, 'resolve', resolveNote)}
                          disabled={actionLoading}
                          style={{
                            padding: '4px 12px',
                            background: '#10b981',
                            border: 'none',
                            borderRadius: 4,
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Подтвердить решение
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Incident Specs */}
                  <div
                    style={{
                      background: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: 6,
                      padding: 12,
                      marginBottom: 16,
                      fontSize: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Объект:</span>
                      <span style={{ color: '#f8fafc', fontWeight: 500 }}>
                        {selected.target_id || selected.target_type || 'Общая инфраструктура'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Открыт:</span>
                      <span style={{ color: '#f8fafc' }}>{formatDate(selected.opened_at)}</span>
                    </div>
                    {selected.acknowledged_at && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Принят в работу:</span>
                        <span style={{ color: '#3b82f6' }}>{formatDate(selected.acknowledged_at)}</span>
                      </div>
                    )}
                    {selected.resolved_at && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Решён:</span>
                        <span style={{ color: '#10b981' }}>{formatDate(selected.resolved_at)}</span>
                      </div>
                    )}
                    {selected.closed_at && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Закрыт:</span>
                        <span style={{ color: '#64748b' }}>{formatDate(selected.closed_at)}</span>
                      </div>
                    )}
                  </div>

                  {selected.description && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                        Описание
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#cbd5e1',
                          background: '#090d16',
                          border: '1px solid #1e293b',
                          borderRadius: 6,
                          padding: 10,
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {selected.description}
                      </div>
                    </div>
                  )}

                  {selected.resolution_note && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981', textTransform: 'uppercase', marginBottom: 6 }}>
                        Заметка об устранении (RCA)
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#10b981',
                          background: '#10b98110',
                          border: '1px solid #10b98130',
                          borderRadius: 6,
                          padding: 10,
                          lineHeight: 1.5,
                        }}
                      >
                        {selected.resolution_note}
                      </div>
                    </div>
                  )}

                  {/* Comments / Timeline Section */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 10,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MessageSquare size={13} />
                        Журнал взаимодействия ({comments.length})
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                      {comments.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', padding: '6px 0' }}>
                          Комментариев пока нет.
                        </div>
                      ) : (
                        comments.map((c) => (
                          <div
                            key={c.id}
                            style={{
                              background: '#090d16',
                              border: '1px solid #1e293b',
                              borderRadius: 6,
                              padding: '8px 10px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                              <span>Инженер #{c.user_id}</span>
                              <span>{formatDate(c.created_at)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.4 }}>
                              {c.content}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <form onSubmit={handleAddComment} style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        placeholder="Добавить заметку или отчет..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          background: '#090d16',
                          border: '1px solid #1e293b',
                          borderRadius: 4,
                          color: '#f8fafc',
                          fontSize: 12,
                          outline: 'none',
                        }}
                      />
                      <button
                        type="submit"
                        disabled={commentLoading || !commentText.trim()}
                        style={{
                          padding: '6px 10px',
                          background: '#2563eb',
                          border: 'none',
                          borderRadius: 4,
                          color: '#fff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          opacity: commentLoading || !commentText.trim() ? 0.6 : 1,
                        }}
                      >
                        <Send size={12} />
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />
      )}
    </ProtectedRoute>
  )
}
