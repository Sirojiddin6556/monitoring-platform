import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  Sliders,
  Clock,
  Database,
  Save,
  RotateCcw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Check,
  AlertTriangle,
  RefreshCw,
  Server,
  Layers,
} from 'lucide-react'

const SETTING_LABELS = {
  monitoring_enabled: {
    label: 'Глобальный сбор метрик',
    desc: 'Включение фонового опроса агентов и внешних сервисов',
    type: 'toggle',
    group: 'general',
  },
  ping_enabled: {
    label: 'Пинг инфраструктурных серверов',
    desc: 'Периодическая проверка доступности хостов по ICMP',
    type: 'toggle',
    group: 'general',
  },
  probe_enabled: {
    label: 'Проверка веб-сайтов и эндпоинтов',
    desc: 'Синтетические HTTP/HTTPS/TCP пробы для контроля SLA',
    type: 'toggle',
    group: 'general',
  },
  ping_interval: {
    label: 'Интервал пинга серверов (сек)',
    desc: 'Частота отправки ICMP запросов',
    type: 'number',
    min: 5,
    group: 'intervals',
  },
  probe_interval: {
    label: 'Интервал проверки веб-сайтов (сек)',
    desc: 'Частота синтетических проб URL',
    type: 'number',
    min: 5,
    group: 'intervals',
  },
  ping_timeout: {
    label: 'Таймаут пинга серверов (сек)',
    desc: 'Предел ожидания ответа на эхо-запрос',
    type: 'number',
    min: 1,
    group: 'intervals',
  },
  probe_timeout: {
    label: 'Таймаут HTTP проверки (сек)',
    desc: 'Максимальное время ожидания ответа веб-ресурса',
    type: 'number',
    min: 1,
    group: 'intervals',
  },
  max_metrics_store: {
    label: 'Лимит метрик в Redis кэше',
    desc: 'Максимальное количество точек метрик на хост в оперативной памяти',
    type: 'number',
    min: 100,
    group: 'storage',
  },
  max_probes_store: {
    label: 'Лимит проб в памяти',
    desc: 'Буфер истории синтетических проверок',
    type: 'number',
    min: 100,
    group: 'storage',
  },
  max_logs_store: {
    label: 'Буфер строк логов',
    desc: 'Максимальное количество строк лога в кэше агента',
    type: 'number',
    min: 100,
    group: 'storage',
  },
  data_retention_hours: {
    label: 'Срок хранения данных (часов)',
    desc: 'Глубина архива метрик в БД (0 = бессрочно, 168 = 7 дней, 720 = 30 дней)',
    type: 'number',
    min: 0,
    group: 'storage',
  },
}

const GROUPS = {
  general: {
    title: 'Основные параметры мониторинга',
    desc: 'Включение и отключение фоновых модулей сбора телеметрии',
    icon: Sliders,
    color: '#38bdf8',
  },
  intervals: {
    title: 'Интервалы опроса и таймауты',
    desc: 'Настройка частоты сетевого пробинга и временных лимитов',
    icon: Clock,
    color: '#818cf8',
  },
  storage: {
    title: 'Политика хранения и архивации',
    desc: 'Лимиты буферов Redis, PostgreSQL и автоочистка устаревших метрик',
    icon: Database,
    color: '#10b981',
  },
}

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false)
  const [settings, setSettings] = useState({})
  const [originalSettings, setOriginalSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [cleanupResult, setCleanupResult] = useState(null)

  useEffect(() => {
    setMounted(true)
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
      for (const s of res.settings || []) {
        map[s.key] = s.value
      }
      setSettings(map)
      setOriginalSettings({ ...map })
    } catch (err) {
      setError('Ошибка загрузки настроек: ' + (err.message || 'Сбой сети'))
    } finally {
      setLoading(false)
    }
  }

  const hasChanges = () => {
    return Object.keys(settings).some((k) => settings[k] !== originalSettings[k])
  }

  const handleChange = (key, val) => {
    setSettings((prev) => ({ ...prev, [key]: val }))
    setSuccess(null)
  }

  const handleToggle = (key) => {
    const curr = settings[key] === 'true'
    handleChange(key, curr ? 'false' : 'true')
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const changed = Object.entries(settings).filter(([k, v]) => v !== originalSettings[k])
      for (const [key, value] of changed) {
        await apiFetch('/api/settings', {
          method: 'POST',
          body: JSON.stringify({ key, value: String(value) }),
        })
      }
      setOriginalSettings({ ...settings })
      setSuccess('Конфигурация мониторинга успешно сохранена и применена')
    } catch (err) {
      setError('Ошибка сохранения: ' + (err.message || 'Сбой записи'))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Сбросить все параметры мониторинга к заводским значениям?')) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await apiFetch('/api/settings/reset', { method: 'POST' })
      if (res.settings) {
        setSettings(res.settings)
        setOriginalSettings({ ...res.settings })
        setSuccess('Настройки успешно сброшены к значениям по умолчанию')
      }
    } catch (err) {
      setError('Ошибка сброса: ' + (err.message || 'Сбой выполнения'))
    } finally {
      setSaving(false)
    }
  }

  const handleCleanup = async () => {
    const hours = settings.data_retention_hours || '168'
    if (!confirm(`Удалить архивные метрики старше ${hours} часов из базы данных?`)) return
    setCleanupResult(null)
    try {
      const res = await apiFetch('/api/data/cleanup', { method: 'POST' })
      setCleanupResult(res.message || 'Очистка архивных метрик успешно завершена')
    } catch (err) {
      setCleanupResult('Ошибка: ' + (err.message || 'Сбой операции'))
    }
  }

  const renderGroup = (groupKey) => {
    const group = GROUPS[groupKey]
    const Icon = group.icon
    const items = Object.entries(SETTING_LABELS).filter(([, v]) => v.group === groupKey)

    return (
      <div
        key={groupKey}
        style={{
          background: '#101726',
          border: '1px solid #1e293b',
          borderRadius: 8,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Icon size={18} color={group.color} />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
            {group.title}
          </h3>
        </div>
        <p style={{ margin: '0 0 16px 0', fontSize: 12, color: '#64748b' }}>
          {group.desc}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(([key, info]) => {
            const isToggled = settings[key] === 'true'

            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  gap: 16,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#f8fafc' }}>
                    {info.label}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {info.desc} • <code style={{ color: '#94a3b8' }}>{key}</code>
                  </div>
                </div>

                {info.type === 'toggle' ? (
                  <button
                    type="button"
                    onClick={() => isAdmin && handleToggle(key)}
                    disabled={!isAdmin}
                    style={{
                      width: 48,
                      height: 26,
                      borderRadius: 13,
                      border: 'none',
                      background: isToggled ? '#10b981' : '#1e293b',
                      position: 'relative',
                      cursor: isAdmin ? 'pointer' : 'not-allowed',
                      transition: 'background 0.2s',
                      opacity: isAdmin ? 1 : 0.6,
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#ffffff',
                        position: 'absolute',
                        top: 3,
                        left: isToggled ? 25 : 3,
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }}
                    />
                  </button>
                ) : (
                  <input
                    type="number"
                    value={settings[key] || ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                    min={info.min}
                    disabled={!isAdmin}
                    style={{
                      width: 110,
                      padding: '6px 10px',
                      background: '#101726',
                      border: '1px solid #1e293b',
                      borderRadius: 6,
                      color: '#f8fafc',
                      fontSize: 13,
                      fontWeight: 600,
                      textAlign: 'center',
                      fontFeatureSettings: '"tnum"',
                      outline: 'none',
                      opacity: isAdmin ? 1 : 0.6,
                      cursor: isAdmin ? 'text' : 'not-allowed',
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <ProtectedRoute requiredRole="admin">
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
                <ShieldCheck size={22} color="#2563eb" />
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  Системная конфигурация
                </h1>
              </div>
              <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0 0' }}>
                Параметры фоновых служб, интервалов пробинга и регламента архивации данных
              </p>
            </div>

            {isAdmin && hasChanges() && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 14px',
                  background: '#f59e0b15',
                  border: '1px solid #f59e0b40',
                  borderRadius: 6,
                  color: '#f59e0b',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <AlertCircle size={14} />
                Есть несохраненные изменения
              </div>
            )}
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
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={15} />
              {error}
            </div>
          )}

          {success && (
            <div
              style={{
                padding: '10px 14px',
                background: '#10b98115',
                border: '1px solid #10b98130',
                borderRadius: 6,
                color: '#10b981',
                fontSize: 13,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <CheckCircle2 size={15} />
              {success}
            </div>
          )}

          {loading ? (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                color: '#64748b',
                fontSize: 13,
              }}
            >
              Загрузка системных параметров...
            </div>
          ) : (
            <>
              {Object.keys(GROUPS).map((g) => renderGroup(g))}

              {/* Maintenance & Action Card */}
              {isAdmin && (
                <div
                  style={{
                    background: '#101726',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: 20,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <Layers size={18} color="#2563eb" />
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                      Действия и регламентные операции
                    </h3>
                  </div>
                  <p style={{ margin: '0 0 16px 0', fontSize: 12, color: '#64748b' }}>
                    Применение конфигурации, сброс параметров и ручная очистка устаревших метрик
                  </p>

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button
                      onClick={handleSave}
                      disabled={saving || !hasChanges()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '9px 18px',
                        background: hasChanges() ? '#2563eb' : '#1e293b',
                        color: hasChanges() ? '#ffffff' : '#64748b',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: saving || !hasChanges() ? 'not-allowed' : 'pointer',
                        boxShadow: hasChanges() ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                      }}
                    >
                      <Save size={14} />
                      {saving ? 'Сохранение...' : 'Сохранить изменения'}
                    </button>

                    <button
                      onClick={handleReset}
                      disabled={saving}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '9px 18px',
                        background: '#090d16',
                        color: '#f59e0b',
                        border: '1px solid #f59e0b40',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <RotateCcw size={14} />
                      Сбросить по умолчанию
                    </button>

                    <button
                      onClick={handleCleanup}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '9px 18px',
                        background: '#090d16',
                        color: '#ef4444',
                        border: '1px solid #ef444440',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={14} />
                      Очистить архивные метрики
                    </button>
                  </div>

                  {cleanupResult && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: '10px 14px',
                        background: '#090d16',
                        border: '1px solid #1e293b',
                        borderRadius: 6,
                        color: '#cbd5e1',
                        fontSize: 12,
                      }}
                    >
                      {cleanupResult}
                    </div>
                  )}
                </div>
              )}

              {!isAdmin && (
                <div
                  style={{
                    background: '#101726',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: 24,
                    textAlign: 'center',
                    color: '#64748b',
                    fontSize: 13,
                  }}
                >
                  Изменение системных параметров доступно только учетным записям с правами Администратора.
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  )
}
