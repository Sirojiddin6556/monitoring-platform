import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  ScrollText,
  Server,
  Search,
  Terminal,
  Shield,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Info,
  Clock,
  Layers,
  Filter,
} from 'lucide-react'

function normalizeLogEntries(rawEntries) {
  if (!Array.isArray(rawEntries)) return []
  return rawEntries
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (entry == null) return ''
      try {
        return JSON.stringify(entry)
      } catch {
        return String(entry)
      }
    })
    .filter(Boolean)
}

function parseEventLine(line) {
  const src = String(line || '')
  
  // Windows Event Pattern
  const pattern = /Event\[(\d+)\]\s*\|\s*Log Name:\s*([^|]+)\|\s*Source:\s*([^|]+)\|\s*Id:\s*([^|]+)\|\s*Level:\s*([^|]+)\|\s*Date:\s*([^|]+)\|\s*Message:\s*(.*)$/i
  const m = src.match(pattern)
  if (m) {
    return {
      raw: src,
      index: m[1],
      logName: m[2].trim(),
      source: m[3].trim(),
      eventId: m[4].trim(),
      level: m[5].trim(),
      date: m[6].trim(),
      message: m[7].trim(),
      parsed: true,
    }
  }

  // Linux Journalctl / Syslog ISO pattern (2026-10-10T10:40:01+0000 hostname process[pid]: message)
  const isoMatch = src.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s]*)\s+([^\s]+)\s+([^:]+):\s+(.*)$/)
  if (isoMatch) {
    const isError = /error|fail|crit|panic|emergency|fatal/i.test(src)
    const isWarn = /warn|timeout|refused|denied|degraded/i.test(src)
    const isAuth = /ssh|sshd|session opened|accepted|sudo|pam_unix/i.test(src)
    const level = isError ? 'Error' : isWarn ? 'Warning' : isAuth ? 'Auth' : 'Info'
    return {
      raw: src,
      index: null,
      logName: 'journal',
      source: isoMatch[3].trim(),
      eventId: null,
      level,
      date: isoMatch[1].replace('+0000', '').replace('T', ' '),
      message: isoMatch[4],
      parsed: true,
    }
  }

  // Standard BSD syslog pattern (Oct 10 10:40:01 hostname process[pid]: message)
  const bsdMatch = src.match(/^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+([^\s]+)\s+([^:]+):\s+(.*)$/)
  if (bsdMatch) {
    const isError = /error|fail|crit|panic|emergency|fatal/i.test(src)
    const isWarn = /warn|timeout|refused|denied|degraded/i.test(src)
    const isAuth = /ssh|sshd|session opened|accepted|sudo|pam_unix/i.test(src)
    const level = isError ? 'Error' : isWarn ? 'Warning' : isAuth ? 'Auth' : 'Info'
    return {
      raw: src,
      index: null,
      logName: 'syslog',
      source: bsdMatch[3].trim(),
      eventId: null,
      level,
      date: bsdMatch[1],
      message: bsdMatch[4],
      parsed: true,
    }
  }

  // General raw fallback
  const isError = /error|fail|crit|panic|emergency|fatal/i.test(src)
  const isWarn = /warn|timeout|refused|denied|degraded/i.test(src)
  const isAuth = /ssh|sshd|session opened|accepted|sudo|pam_unix/i.test(src)
  const level = isError ? 'Error' : isWarn ? 'Warning' : isAuth ? 'Auth' : 'Info'

  return {
    raw: src,
    index: null,
    logName: null,
    source: null,
    eventId: null,
    level,
    date: null,
    message: src,
    parsed: false,
  }
}

function hasMojibakeText(s) {
  const text = String(s || '')
  if (!text) return false
  return /[ѓ„…†‡€‰‰Љ‹ЊЋЏђ‘’“”•–—™љњћџҐЁЄЇЎ]/.test(text)
}

export default function Logs() {
  const [mounted, setMounted] = useState(false)
  const [servers, setServers] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [logTab, setLogTab] = useState('system')
  const [serverSearch, setServerSearch] = useState('')
  const [logSearch, setLogSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const [expandedRows, setExpandedRows] = useState({})
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    apiFetch('/api/servers')
      .then((d) => {
        const srvs = d.servers || []
        setServers(srvs)
        if (srvs.length > 0 && !selected) {
          selectServer(srvs[0])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function selectServer(s) {
    setSelected(s)
    setDetailLoading(true)
    apiFetch(`/api/servers/${s.id}/detail`)
      .then((d) => setDetail(d.detail || null))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))
  }

  // Auto-refresh logs every 15s
  useEffect(() => {
    if (!selected) return
    const iv = setInterval(() => {
      apiFetch(`/api/servers/${selected.id}/detail`)
        .then((d) => setDetail(d.detail || null))
        .catch(() => {})
    }, 15000)
    return () => clearInterval(iv)
  }, [selected?.id])

  const logs = detail?.recent_logs || {}
  const entries = normalizeLogEntries(logs[logTab] || [])
  const parsedEntries = entries.map(parseEventLine)

  const filteredEntries = parsedEntries.filter((entry) => {
    const text = entry.raw.toLowerCase()
    if (logSearch.trim() && !text.includes(logSearch.toLowerCase())) {
      return false
    }
    if (levelFilter === 'error') {
      return /error|fail|crit|panic|emergency|fatal/i.test(text)
    }
    if (levelFilter === 'warn') {
      return /warn|timeout|refused|denied|degraded/i.test(text)
    }
    if (levelFilter === 'auth') {
      return /ssh|sshd|session opened|accepted|auth|sudo|pam_unix/i.test(text)
    }
    return true
  })

  const hasMojibake = parsedEntries.some((entry) => hasMojibakeText(entry.raw))
  const filteredServers = serverSearch.trim()
    ? servers.filter(
        (s) =>
          (s.name || '').toLowerCase().includes(serverSearch.toLowerCase()) ||
          (s.host || '').toLowerCase().includes(serverSearch.toLowerCase())
      )
    : servers

  const LOG_TABS = [
    {
      key: 'system',
      label: 'System Log',
      color: '#38bdf8',
      desc: 'Системные события (syslog / journalctl / messages)',
      icon: Terminal,
    },
    {
      key: 'auth',
      label: 'Auth / Security',
      color: '#ef4444',
      desc: 'Авторизация и сессии (auth.log / sshd / secure)',
      icon: Shield,
    },
    {
      key: 'error',
      label: 'Kernel / Errors',
      color: '#f59e0b',
      desc: 'Сбои ядра и ошибки сервисов (kern.log / dmesg)',
      icon: AlertTriangle,
    },
  ]

  const handleCopyLogs = () => {
    const text = filteredEntries.map((e) => e.raw).join('\n')
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
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
                <ScrollText size={22} color="#2563eb" />
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  Централизованные логи серверов
                </h1>
              </div>
              <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0 0' }}>
                Потоковый просмотр журналов syslog, journalctl, dmesg, auth.log и Windows Event Logs в реальном времени
              </p>
            </div>

            {selected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => selectServer(selected)}
                  title="Обновить журнал"
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
                  onClick={handleCopyLogs}
                  disabled={filteredEntries.length === 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    borderRadius: 6,
                    border: '1px solid #1e293b',
                    background: copied ? '#10b98120' : '#101726',
                    color: copied ? '#10b981' : '#f8fafc',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Скопировано!' : 'Копировать строки'}
                </button>
              </div>
            )}
          </div>

          {/* Master-Detail Layout */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* Left Column: Server Selector */}
            <div
              style={{
                width: 280,
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: 12, borderBottom: '1px solid #1e293b', background: '#0d1320' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={12} color="#64748b" style={{ position: 'absolute', left: 8, top: 9 }} />
                  <input
                    type="text"
                    placeholder="Поиск сервера..."
                    value={serverSearch}
                    onChange={(e) => setServerSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 8px 5px 26px',
                      background: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: 4,
                      color: '#f8fafc',
                      fontSize: 11,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                    Загрузка серверов...
                  </div>
                ) : filteredServers.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                    Серверы не найдены
                  </div>
                ) : (
                  filteredServers.map((s) => {
                    const isSelected = selected?.id === s.id
                    const isOk = s.status === 'ok'
                    const isDown = s.status === 'down'

                    return (
                      <div
                        key={s.id}
                        onClick={() => selectServer(s)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          borderBottom: '1px solid #1e293b',
                          background: isSelected ? '#151d2f' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            backgroundColor: isOk ? '#10b981' : isDown ? '#ef4444' : '#64748b',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: isSelected ? 600 : 500,
                              color: isSelected ? '#ffffff' : '#cbd5e1',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {s.name}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: '#64748b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {s.host || s.id}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Right Column: Terminal Logs Viewer */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!selected ? (
                <div
                  style={{
                    background: '#101726',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: 60,
                    textAlign: 'center',
                    color: '#64748b',
                  }}
                >
                  <ScrollText size={36} color="#2563eb" style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc', marginBottom: 4 }}>
                    Выберите сервер из списка
                  </div>
                  <div style={{ fontSize: 13 }}>
                    Логи операционной системы передаются агентом мониторинга в реальном времени.
                  </div>
                </div>
              ) : (
                <>
                  {/* Top Bar with Tabs and Filters */}
                  <div
                    style={{
                      background: '#101726',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    {/* Log Tabs */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {LOG_TABS.map((t) => {
                        const active = logTab === t.key
                        const count = (logs[t.key] || []).length
                        const Icon = t.icon
                        return (
                          <button
                            key={t.key}
                            onClick={() => setLogTab(t.key)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 12px',
                              borderRadius: 6,
                              border: `1px solid ${active ? '#2563eb' : '#1e293b'}`,
                              background: active ? '#2563eb' : '#090d16',
                              color: active ? '#ffffff' : '#94a3b8',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <Icon size={12} color={active ? '#ffffff' : t.color} />
                            {t.label}
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 5px',
                                borderRadius: 10,
                                background: active ? '#1d4ed8' : '#101726',
                                color: active ? '#ffffff' : '#64748b',
                              }}
                            >
                              {count}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Filters & Search */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 8px',
                          background: '#090d16',
                          border: '1px solid #1e293b',
                          borderRadius: 6,
                        }}
                      >
                        <Filter size={11} color="#64748b" />
                        <select
                          value={levelFilter}
                          onChange={(e) => setLevelFilter(e.target.value)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: 11,
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="all">Все уровни</option>
                          <option value="error">Только ошибки (Error/Crit)</option>
                          <option value="warn">Предупреждения (Warn)</option>
                          <option value="auth">События безопасности (Auth)</option>
                        </select>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <Search size={12} color="#64748b" style={{ position: 'absolute', left: 8, top: 8 }} />
                        <input
                          type="text"
                          placeholder="Фильтр строк логов..."
                          value={logSearch}
                          onChange={(e) => setLogSearch(e.target.value)}
                          style={{
                            padding: '4px 8px 4px 26px',
                            background: '#090d16',
                            border: '1px solid #1e293b',
                            borderRadius: 6,
                            color: '#f8fafc',
                            fontSize: 11,
                            outline: 'none',
                            width: 180,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Terminal Log Stream Window */}
                  <div
                    style={{
                      background: '#101726',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Log Status Subheader */}
                    <div
                      style={{
                        padding: '8px 14px',
                        background: '#0d1320',
                        borderBottom: '1px solid #1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 11,
                      }}
                    >
                      <span style={{ color: '#64748b' }}>
                        {LOG_TABS.find((t) => t.key === logTab)?.desc}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {hasMojibake && (
                          <span
                            style={{
                              color: '#f59e0b',
                              background: '#f59e0b15',
                              border: '1px solid #f59e0b30',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 10,
                            }}
                          >
                            Обнаружена несовместимая кодировка строк
                          </span>
                        )}
                        <span style={{ color: '#94a3b8', fontFeatureSettings: '"tnum"' }}>
                          Отображается: {filteredEntries.length} из {entries.length} строк
                        </span>
                      </div>
                    </div>

                    {/* Lines Stream */}
                    {detailLoading ? (
                      <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                        Загрузка журнала с агента...
                      </div>
                    ) : entries.length === 0 ? (
                      <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                        Логи отсутствуют. Агент еще не зафиксировал событий или не имеет доступа к журналу.
                      </div>
                    ) : filteredEntries.length === 0 ? (
                      <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                        По запросу "{logSearch}" записей не найдено.
                      </div>
                    ) : (
                      <div
                        style={{
                          maxHeight: 640,
                          overflowY: 'auto',
                          background: '#060a12',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
                        }}
                      >
                        {filteredEntries.map((entry, i) => {
                          const rowKey = `${logTab}-${selected?.id || 'none'}-${i}`
                          const expanded = !!expandedRows[rowKey]
                          const isError = entry.level === 'Error' || /error|fail|crit|panic|emergency|fatal/i.test(entry.raw)
                          const isWarn = entry.level === 'Warning' || /warn|timeout|refused|denied|degraded/i.test(entry.raw)
                          const isAuth = entry.level === 'Auth' || /ssh|sshd|session opened|accepted|sudo/i.test(entry.raw)

                          const color = isError
                            ? '#ef4444'
                            : isWarn
                            ? '#f59e0b'
                            : isAuth
                            ? '#38bdf8'
                            : '#cbd5e1'

                          const fullText = entry.message || entry.raw
                          const previewText =
                            fullText.length > 400 && !expanded ? `${fullText.slice(0, 400)}...` : fullText

                          return (
                            <div
                              key={i}
                              style={{
                                background: '#0b111c',
                                border: '1px solid #1e293b40',
                                borderRadius: 4,
                                padding: '6px 10px',
                                fontSize: 11,
                                lineHeight: 1.5,
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 3,
                                  color: '#64748b',
                                  fontSize: 10,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span style={{ color: '#475569', fontFeatureSettings: '"tnum"', minWidth: 28 }}>
                                  #{i + 1}
                                </span>
                                {entry.logName && (
                                  <span
                                    style={{
                                      padding: '1px 5px',
                                      borderRadius: 3,
                                      background: '#818cf815',
                                      color: '#818cf8',
                                    }}
                                  >
                                    {entry.logName}
                                  </span>
                                )}
                                {entry.level && (
                                  <span
                                    style={{
                                      fontWeight: 700,
                                      color,
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    [{entry.level}]
                                  </span>
                                )}
                                {entry.date && <span style={{ color: '#94a3b8' }}>{entry.date}</span>}
                                {entry.source && <span style={{ color: '#64748b' }}>src: {entry.source}</span>}
                              </div>

                              <div
                                style={{
                                  color,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-all',
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                {previewText}
                              </div>

                              {fullText.length > 400 && (
                                <button
                                  onClick={() =>
                                    setExpandedRows((prev) => ({ ...prev, [rowKey]: !expanded }))
                                  }
                                  style={{
                                    marginTop: 4,
                                    padding: '2px 6px',
                                    borderRadius: 3,
                                    border: '1px solid #1e293b',
                                    background: '#101726',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                    fontSize: 10,
                                  }}
                                >
                                  {expanded ? 'Свернуть' : 'Развернуть полностью'}
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
