import {useState, useEffect} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

const SETTING_LABELS = {
  monitoring_enabled: {label: 'Автоматический мониторинг', type: 'toggle', group: 'general'},
  ping_enabled: {label: 'Пинг серверов', type: 'toggle', group: 'general'},
  probe_enabled: {label: 'Проверка сайтов', type: 'toggle', group: 'general'},
  ping_interval: {label: 'Интервал пинга (сек)', type: 'number', min: 5, group: 'intervals'},
  probe_interval: {label: 'Интервал проверки сайтов (сек)', type: 'number', min: 5, group: 'intervals'},
  ping_timeout: {label: 'Таймаут пинга (сек)', type: 'number', min: 1, group: 'intervals'},
  probe_timeout: {label: 'Таймаут HTTP-проверки (сек)', type: 'number', min: 1, group: 'intervals'},
  max_metrics_store: {label: 'Макс. метрик в памяти', type: 'number', min: 100, group: 'storage'},
  max_probes_store: {label: 'Макс. проб в памяти', type: 'number', min: 100, group: 'storage'},
  max_logs_store: {label: 'Макс. логов в памяти', type: 'number', min: 100, group: 'storage'},
  data_retention_hours: {label: 'Хранить данные (часов, 0 = бессрочно)', type: 'number', min: 0, group: 'storage'},
}

const GROUPS = {
  general: {title: 'Основные', icon: '⚙️'},
  intervals: {title: 'Интервалы опроса', icon: '⏱️'},
  storage: {title: 'Хранение данных', icon: '💾'},
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({})
  const [originalSettings, setOriginalSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [cleanupResult, setCleanupResult] = useState(null)

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    setIsAdmin(user.role === 'admin')
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    setError(null)
    try {

      const res = await apiFetch('/api/settings')
      const map = {}
      for (const s of (res.settings || [])) {
        map[s.key] = s.value
      }
      setSettings(map)
      setOriginalSettings({...map})
    } catch (err) {
      setError('Ошибка загрузки настроек: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (key, value) => {
    setSettings(prev => ({...prev, [key]: value}))
    setSuccess(null)
  }

  const handleToggle = (key) => {
    setSettings(prev => ({...prev, [key]: prev[key] === 'true' ? 'false' : 'true'}))
    setSuccess(null)
  }

  const hasChanges = () => {
    return Object.keys(settings).some(k => settings[k] !== originalSettings[k])
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {

      // Отправить только изменённые
      const changed = {}
      for (const k of Object.keys(settings)) {
        if (settings[k] !== originalSettings[k]) {
          changed[k] = settings[k]
        }
      }
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({settings: changed})
      })
      if (res.message) {
        setSuccess(res.message)
        setOriginalSettings({...settings})
      } else {
        setError(res.detail || 'Ошибка сохранения')
      }
    } catch (err) {
      setError('Ошибка: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Сбросить все настройки к значениям по умолчанию?')) return
    setSaving(true)
    setError(null)
    try {

      const res = await apiFetch('/api/settings/reset', {method: 'POST'})
      if (res.settings) {
        setSettings(res.settings)
        setOriginalSettings({...res.settings})
        setSuccess('Настройки сброшены')
      }
    } catch (err) {
      setError('Ошибка: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCleanup = async () => {
    const hours = settings.data_retention_hours || '168'
    if (!confirm(`Удалить данные старше ${hours} часов?`)) return
    setCleanupResult(null)
    try {

      const res = await apiFetch('/api/data/cleanup', {method: 'POST'})
      setCleanupResult(res.message || 'Очистка выполнена')
    } catch (err) {
      setCleanupResult('Ошибка: ' + err.message)
    }
  }

  const cardStyle = {
    background: '#0a1a2e',
    border: '1px solid #1a2940',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
  }

  const inputStyle = {
    width: 120,
    padding: '8px 10px',
    background: '#07111e',
    border: '1px solid #1a2940',
    color: '#fff',
    borderRadius: 4,
    fontSize: 14,
    textAlign: 'center',
  }

  const renderGroup = (groupKey) => {
    const group = GROUPS[groupKey]
    const items = Object.entries(SETTING_LABELS).filter(([, v]) => v.group === groupKey)
    return (
      <div key={groupKey} style={cardStyle}>
        <h3 style={{color: '#fff', marginTop: 0, marginBottom: 16, fontSize: 16}}>
          {group.icon} {group.title}
        </h3>
        <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
          {items.map(([key, info]) => (
            <div key={key} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                <div style={{color: '#fff', fontSize: 14}}>{info.label}</div>
                <div style={{color: '#9aa4b2', fontSize: 11, marginTop: 2}}>{key}</div>
              </div>
              {info.type === 'toggle' ? (
                <button
                  onClick={() => isAdmin && handleToggle(key)}
                  disabled={!isAdmin}
                  style={{
                    width: 56,
                    height: 28,
                    borderRadius: 14,
                    border: 'none',
                    background: settings[key] === 'true' ? '#4ade80' : '#374151',
                    position: 'relative',
                    cursor: isAdmin ? 'pointer' : 'not-allowed',
                    transition: 'background 0.2s',
                    opacity: isAdmin ? 1 : 0.6,
                  }}
                >
                  <div style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: 3,
                    left: settings[key] === 'true' ? 31 : 3,
                    transition: 'left 0.2s',
                  }} />
                </button>
              ) : (
                <input
                  type="number"
                  value={settings[key] || ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                  min={info.min}
                  disabled={!isAdmin}
                  style={{...inputStyle, opacity: isAdmin ? 1 : 0.6, cursor: isAdmin ? 'text' : 'not-allowed'}}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="app-shell">
        <Sidebar />
        <div className="page">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24}}>
            <h1 style={{fontSize: 22, color: '#fff', margin: 0}}>Настройки мониторинга</h1>
            {isAdmin && hasChanges() && (
              <div style={{
                padding: '6px 12px',
                background: '#facc1520',
                color: '#facc15',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
              }}>
                Есть несохранённые изменения
              </div>
            )}
          </div>

          {error && (
            <div style={{padding: 12, background: '#ef444420', border: '1px solid #ef4444', borderRadius: 6, color: '#ef4444', marginBottom: 16, fontSize: 13}}>
              {error}
            </div>
          )}
          {success && (
            <div style={{padding: 12, background: '#4ade8020', border: '1px solid #4ade80', borderRadius: 6, color: '#4ade80', marginBottom: 16, fontSize: 13}}>
              {success}
            </div>
          )}

          {loading ? (
            <div style={{color: '#9aa4b2', textAlign: 'center', marginTop: 40}}>Загрузка настроек...</div>
          ) : (
            <>
              {Object.keys(GROUPS).map(g => renderGroup(g))}

              {/* Действия */}
              {isAdmin && (
                <div style={cardStyle}>
                  <h3 style={{color: '#fff', marginTop: 0, marginBottom: 16, fontSize: 16}}>
                    🛠️ Действия
                  </h3>
                  <div style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
                    <button
                      onClick={handleSave}
                      disabled={saving || !hasChanges()}
                      style={{
                        padding: '10px 24px',
                        background: hasChanges() ? '#00d4ff' : '#1a2940',
                        color: hasChanges() ? '#000' : '#9aa4b2',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: saving || !hasChanges() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {saving ? 'Сохранение...' : 'Сохранить изменения'}
                    </button>
                    <button
                      onClick={handleReset}
                      disabled={saving}
                      style={{
                        padding: '10px 24px',
                        background: '#facc1520',
                        color: '#facc15',
                        border: '1px solid #facc15',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Сбросить по умолчанию
                    </button>
                    <button
                      onClick={handleCleanup}
                      style={{
                        padding: '10px 24px',
                        background: '#ef444420',
                        color: '#ef4444',
                        border: '1px solid #ef4444',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Очистить старые данные
                    </button>
                  </div>
                  {cleanupResult && (
                    <div style={{marginTop: 12, padding: 10, background: '#07111e', borderRadius: 4, color: '#9aa4b2', fontSize: 13}}>
                      {cleanupResult}
                    </div>
                  )}
                </div>
              )}

              {!isAdmin && (
                <div style={{...cardStyle, textAlign: 'center', color: '#9aa4b2', fontSize: 13}}>
                  Только администратор может изменять настройки
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
