import { useEffect, useState, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Search,
  RefreshCw,
  AlertTriangle,
  Server,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  Filter,
} from 'lucide-react'

function StatusBadge({ status, daysLeft }) {
  const isExpiring = daysLeft != null && daysLeft < 30
  const isExpired = status === 'expired' || status === 'invalid' || (daysLeft != null && daysLeft <= 0)
  const isValid = !isExpired && (status === 'valid' || status === 'active')

  const color = isExpired ? '#ef4444' : isExpiring ? '#f59e0b' : '#10b981'
  const bg = isExpired ? '#ef444415' : isExpiring ? '#f59e0b15' : '#10b98115'
  const border = isExpired ? '#ef444430' : isExpiring ? '#f59e0b30' : '#10b98130'
  const label = isExpired ? 'Истёк / Недействителен' : isExpiring ? 'Истекает скоро' : 'Действителен'
  const Icon = isExpired ? XCircle : isExpiring ? AlertTriangle : CheckCircle2

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 4,
        background: bg,
        border: `1px solid ${border}`,
        color: color,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <Icon size={12} strokeWidth={2.2} />
      {label}
    </span>
  )
}

export default function SSLCertificates() {
  const [mounted, setMounted] = useState(false)
  const [certs, setCerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [serversData, websitesData] = await Promise.all([
        apiFetch('/api/servers').catch(() => ({ servers: [] })),
        apiFetch('/api/websites').catch(() => ({ websites: [] })),
      ])

      const serversList = Array.isArray(serversData) ? serversData : (serversData?.servers || [])
      const websitesList = websitesData?.websites || []

      let allCerts = []

      // 1. From Server agent_data
      for (const s of serversList) {
        const agentCerts = s.agent_data?.ssl_certificates || []
        for (const cert of agentCerts) {
          allCerts.push({
            domain: cert.domain || '—',
            issuer: cert.issuer || '—',
            days_left: cert.days_left != null ? Number(cert.days_left) : null,
            expires_at: cert.expires_at || cert.expires || '—',
            status: cert.status || 'valid',
            sourceType: 'server',
            sourceName: s.name,
          })
        }
      }

      // If no agent ssl certs found in agent_data, probe details for fallback
      if (allCerts.length === 0) {
        const details = await Promise.all(
          serversList.slice(0, 10).map(async (s) => {
            try {
              const res = await apiFetch(`/api/servers/${s.id}/detail`)
              return { serverName: s.name, items: res?.detail?.ssl_certificates || [] }
            } catch {
              return { serverName: s.name, items: [] }
            }
          })
        )
        for (const item of details) {
          for (const cert of item.items) {
            allCerts.push({
              domain: cert.domain || '—',
              issuer: cert.issuer || '—',
              days_left: cert.days_left != null ? Number(cert.days_left) : null,
              expires_at: cert.expires_at || cert.expires || '—',
              status: cert.status || 'valid',
              sourceType: 'server',
              sourceName: item.serverName,
            })
          }
        }
      }

      // 2. From Websites probes
      for (const w of websitesList) {
        if (w.ssl) {
          const u = new URL(w.url.startsWith('http') ? w.url : `https://${w.url}`)
          allCerts.push({
            domain: u.hostname,
            issuer: w.ssl.issuer || '—',
            days_left: w.ssl.days_left != null ? Number(w.ssl.days_left) : null,
            expires_at: w.ssl.expires || '—',
            status: w.ssl.valid ? 'valid' : 'invalid',
            sourceType: 'website',
            sourceName: w.name,
          })
        }
      }

      setCerts(allCerts)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const t = setInterval(loadData, 30000)
    return () => clearInterval(t)
  }, [loadData])

  const total = certs.length
  const validCount = certs.filter((c) => c.status === 'valid' && (c.days_left == null || c.days_left >= 30)).length
  const expiringCount = certs.filter((c) => c.days_left != null && c.days_left < 30 && c.days_left > 0).length
  const expiredCount = certs.filter((c) => c.status === 'invalid' || c.status === 'expired' || (c.days_left != null && c.days_left <= 0)).length

  const filtered = certs.filter((c) => {
    if (statusFilter === 'valid' && (c.status !== 'valid' || (c.days_left != null && c.days_left < 30))) return false
    if (statusFilter === 'expiring' && (c.days_left == null || c.days_left >= 30 || c.days_left <= 0)) return false
    if (statusFilter === 'expired' && c.status !== 'invalid' && c.status !== 'expired' && !(c.days_left != null && c.days_left <= 0)) return false

    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (c.domain || '').toLowerCase().includes(q) ||
      (c.issuer || '').toLowerCase().includes(q) ||
      (c.sourceName || '').toLowerCase().includes(q)
    )
  })

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
                <ShieldCheck size={22} color="#2563eb" />
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  Аудит SSL / TLS сертификатов
                </h1>
              </div>
              <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0 0' }}>
                Контроль сроков действия, удостоверяющих центров и криптографической валидности сертификатов
              </p>
            </div>

            <button
              onClick={loadData}
              title="Обновить данные"
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
            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Всего сертификатов
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {total}
              </div>
            </div>

            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Действительны (&gt;30 дней)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {validCount}
              </div>
            </div>

            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Истекают скоро (&lt;30 дней)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: expiringCount > 0 ? '#f59e0b' : '#f8fafc', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {expiringCount}
              </div>
            </div>

            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Просрочены / Недействительны
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: expiredCount > 0 ? '#ef4444' : '#f8fafc', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                {expiredCount}
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
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
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'all', label: 'Все' },
                { id: 'valid', label: 'Действительные' },
                { id: 'expiring', label: 'Истекают скоро' },
                { id: 'expired', label: 'С ошибками' },
              ].map((f) => {
                const active = statusFilter === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      border: `1px solid ${active ? '#2563eb' : '#1e293b'}`,
                      background: active ? '#2563eb' : '#101726',
                      color: active ? '#ffffff' : '#94a3b8',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>

            <div style={{ position: 'relative' }}>
              <Search size={12} color="#64748b" style={{ position: 'absolute', left: 10, top: 9 }} />
              <input
                type="text"
                placeholder="Поиск по домену, издателю или хосту..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: '6px 12px 6px 30px',
                  background: '#101726',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  color: '#f8fafc',
                  fontSize: 12,
                  outline: 'none',
                  width: 240,
                }}
              />
            </div>
          </div>

          {/* Table Container */}
          <div
            style={{
              background: '#101726',
              border: '1px solid #1e293b',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {loading && certs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                Аудит SSL сертификатов...
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                <Lock size={32} color="#2563eb" style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc', marginBottom: 4 }}>
                  Сертификаты не найдены
                </div>
                <div style={{ fontSize: 13 }}>
                  {search
                    ? 'По вашему поисковому запросу ничего не найдено.'
                    : 'Отслеживаемые сертификаты отсутствуют. Добавьте веб-сайты в мониторинг или настройте домены в конфигурации агента.'}
                </div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0d1320', borderBottom: '1px solid #1e293b' }}>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Доменное имя
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Источник
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Удостоверяющий центр (Издатель)
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Осталось дней
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Дата окончания
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Статус сертификата
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => {
                    const days = c.days_left
                    const daysColor =
                      days == null
                        ? '#64748b'
                        : days < 7
                        ? '#ef4444'
                        : days < 30
                        ? '#f59e0b'
                        : '#10b981'

                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: '1px solid #1e293b',
                          transition: 'background 0.15s',
                        }}
                      >
                        <td style={{ padding: '12px 14px', color: '#f8fafc', fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Lock size={12} color="#2563eb" />
                            {c.domain}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
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
                            }}
                          >
                            {c.sourceType === 'server' ? (
                              <Server size={10} color="#38bdf8" />
                            ) : (
                              <Globe size={10} color="#818cf8" />
                            )}
                            {c.sourceName}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                          {c.issuer}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            fontWeight: 700,
                            color: daysColor,
                            fontFeatureSettings: '"tnum"',
                          }}
                        >
                          {days != null ? `${days} дн.` : '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#94a3b8', fontFeatureSettings: '"tnum"' }}>
                          {c.expires_at}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <StatusBadge status={c.status} daysLeft={c.days_left} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
