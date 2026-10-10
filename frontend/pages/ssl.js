import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
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
  Plus,
  Trash2,
  ExternalLink,
  Activity,
  X,
  Key,
  Calendar
} from 'lucide-react'

function StatusBadge({ status, daysLeft }) {
  const isExpiring = daysLeft != null && daysLeft <= 30 && daysLeft > 0
  const isExpired = status === 'expired' || status === 'invalid' || (daysLeft != null && daysLeft <= 0)
  const isValid = !isExpired && (status === 'valid' || status === 'active' || (daysLeft != null && daysLeft > 30))

  const color = isExpired ? '#f87171' : (isExpiring ? '#fbbf24' : '#34d399')
  const bg = isExpired ? 'rgba(239, 68, 68, 0.12)' : (isExpiring ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)')
  const border = isExpired ? 'rgba(239, 68, 68, 0.35)' : (isExpiring ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.35)')
  const label = isExpired ? 'Истёк' : (isExpiring ? 'Истекает скоро' : 'Действителен')
  const Icon = isExpired ? XCircle : (isExpiring ? AlertTriangle : CheckCircle2)

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
        textTransform: 'uppercase',
        letterSpacing: '0.02em'
      }}
    >
      <Icon size={12} strokeWidth={2.2} />
      <span>{label}</span>
    </span>
  )
}

function StatBox({ label, value, color, icon: IconComp, subtext }) {
  return (
    <div
      style={{
        background: '#101726',
        border: '1px solid #1e293b',
        borderRadius: 6,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {IconComp && <IconComp size={15} style={{ color: '#64748b' }} />}
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#f8fafc', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {subtext && <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 3 }}>{subtext}</div>}
    </div>
  )
}

export default function SSLCertificates() {
  const [mounted, setMounted] = useState(false)
  const [certs, setCerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  
  // Filters & search
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all, valid, expiring, expired
  
  // Custom Live Checker
  const [checkHost, setCheckHost] = useState('')
  const [checkPort, setCheckPort] = useState(443)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState(null)

  // Load custom saved SSL targets from localStorage
  const [savedTargets, setSavedTargets] = useState([])

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ssl_monitored_targets')
      if (saved) {
        try { setSavedTargets(JSON.parse(saved)) } catch {}
      } else {
        // Defaults
        const def = [
          { host: '192.168.18.222', port: 443, name: 'VMware ESXi Host' }
        ]
        setSavedTargets(def)
      }
    }
  }, [])

  const loadData = useCallback(async (isBg = false) => {
    if (!isBg) setRefreshing(true)
    try {
      setError(null)
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
            domain: cert.domain || s.name,
            issuer: cert.issuer || '—',
            notAfter: cert.valid_to || cert.not_after,
            daysLeft: cert.days_left,
            status: cert.days_left != null && cert.days_left <= 0 ? 'expired' : (cert.days_left != null && cert.days_left < 30 ? 'warning' : 'valid'),
            source: 'server',
            serverName: s.name,
            serverId: s.id,
          })
        }
      }

      // 2. From Websites
      for (const w of websitesList) {
        if (w.ssl || w.ssl_valid_to) {
          const sslObj = w.ssl || {}
          allCerts.push({
            domain: w.url?.replace(/https?:\/\//, '').split('/')[0] || w.name,
            issuer: sslObj.issuer || w.ssl_issuer || '—',
            notAfter: sslObj.valid_to || w.ssl_valid_to,
            daysLeft: sslObj.days_left != null ? sslObj.days_left : w.ssl_days_left,
            status: (sslObj.days_left != null && sslObj.days_left <= 0) ? 'expired' : ((sslObj.days_left != null && sslObj.days_left < 30) ? 'warning' : 'valid'),
            source: 'website',
            websiteName: w.name,
            websiteId: w.id,
            url: w.url,
          })
        }
      }

      // 3. From Saved Custom targets
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('ssl_monitored_targets')
        const targets = saved ? JSON.parse(saved) : [{ host: '192.168.18.222', port: 443, name: 'VMware ESXi Host' }]
        
        // Check saved targets
        const targetChecks = await Promise.all(
          targets.map(async (t) => {
            try {
              const res = await apiFetch('/api/ssl/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host: t.host, port: t.port || 443 })
              })
              if (res && res.status !== 'error') {
                return {
                  domain: `${t.host}:${t.port || 443}`,
                  issuer: res.issuer || '—',
                  notAfter: res.not_after,
                  daysLeft: res.days_left,
                  status: res.status,
                  source: 'custom',
                  serverName: t.name || t.host,
                  tlsVersion: res.tls_version,
                  cipher: res.cipher,
                  serial: res.serial
                }
              }
            } catch {}
            return null
          })
        )

        for (const tc of targetChecks) {
          if (tc) allCerts.push(tc)
        }
      }

      setCerts(allCerts)
    } catch (err) {
      setError(err.message || 'Ошибка загрузки SSL данных')
    } finally {
      setLoading(false)
      if (!isBg) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const t = setInterval(() => loadData(true), 30000)
    return () => clearInterval(t)
  }, [loadData])

  async function handleCheckCustom(e) {
    e.preventDefault()
    if (!checkHost.trim()) return
    setChecking(true)
    setCheckResult(null)
    try {
      const res = await apiFetch('/api/ssl/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: checkHost.trim(), port: Number(checkPort) || 443 })
      })
      setCheckResult(res)
    } catch (err) {
      setCheckResult({ status: 'error', error: err.message || 'Ошибка подключения' })
    } finally {
      setChecking(false)
    }
  }

  function handleSaveCurrentTarget() {
    if (!checkResult || checkResult.status === 'error') return
    const newTarget = {
      host: checkResult.host,
      port: checkResult.port,
      name: checkResult.subject || checkResult.host
    }
    const updated = [...savedTargets.filter(t => t.host !== newTarget.host), newTarget]
    setSavedTargets(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem('ssl_monitored_targets', JSON.stringify(updated))
    }
    loadData(true)
  }

  function handleDeleteTarget(host) {
    const updated = savedTargets.filter(t => t.host !== host)
    setSavedTargets(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem('ssl_monitored_targets', JSON.stringify(updated))
    }
    loadData(true)
  }

  // Summary counts
  const total = certs.length
  const validCount = certs.filter(c => c.status === 'valid' && (c.daysLeft == null || c.daysLeft > 30)).length
  const expiringCount = certs.filter(c => c.daysLeft != null && c.daysLeft <= 30 && c.daysLeft > 0).length
  const expiredCount = certs.filter(c => c.status === 'expired' || (c.daysLeft != null && c.daysLeft <= 0)).length

  // Filtered certs
  const filtered = useMemo(() => {
    return certs.filter(c => {
      const isExpiring = c.daysLeft != null && c.daysLeft <= 30 && c.daysLeft > 0
      const isExpired = c.status === 'expired' || (c.daysLeft != null && c.daysLeft <= 0)
      const isValid = !isExpired && !isExpiring

      if (statusFilter === 'valid' && !isValid) return false
      if (statusFilter === 'expiring' && !isExpiring) return false
      if (statusFilter === 'expired' && !isExpired) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const matchDomain = (c.domain || '').toLowerCase().includes(q)
        const matchIssuer = (c.issuer || '').toLowerCase().includes(q)
        const matchServer = (c.serverName || c.websiteName || '').toLowerCase().includes(q)
        if (!matchDomain && !matchIssuer && !matchServer) return false
      }
      return true
    })
  }, [certs, statusFilter, search])

  if (!mounted) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 13 }}>
            <Activity className="animate-spin" size={18} />
            Загрузка SSL сертификатов...
          </div>
        </div>
      </div>
    )
  }

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: '20px 28px', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(37, 99, 235, 0.15)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <ShieldCheck size={20} style={{ color: '#60a5fa' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                    SSL / TLS Сертификаты и Безопасность
                  </h1>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: expiredCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    border: `1px solid ${expiredCount > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                    color: expiredCount > 0 ? '#f87171' : '#34d399',
                    fontSize: 11,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <Lock size={11} />
                    {validCount} активных
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                  Мониторинг сроков действия TLS/SSL сертификатов, центров сертификации и шифров
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => loadData(false)}
                disabled={refreshing}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#101726',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 500,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8' }}
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                <span>{refreshing ? 'Опрос...' : 'Обновить'}</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            <StatBox label="Всего сертификатов" value={total} color="#f8fafc" icon={Lock} subtext="под наблюдением" />
            <StatBox label="Действительны" value={validCount} color="#34d399" icon={CheckCircle2} subtext="срок в норме" />
            <StatBox label="Истекают (< 30 дн)" value={expiringCount} color={expiringCount > 0 ? '#fbbf24' : '#64748b'} icon={AlertTriangle} subtext="требуют продления" />
            <StatBox label="Истёкших" value={expiredCount} color={expiredCount > 0 ? '#f87171' : '#64748b'} icon={XCircle} subtext="недействительны" />
          </div>

          {/* Online SSL Checker Widget */}
          <div style={{
            background: '#101726',
            border: '1px solid #1e293b',
            borderRadius: 6,
            padding: '12px 16px',
            marginBottom: 12
          }}>
            <form onSubmit={handleCheckCustom} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f8fafc', fontSize: 12, fontWeight: 600 }}>
                <Key size={15} style={{ color: '#60a5fa' }} />
                <span>Экспресс-проверка узла:</span>
              </div>

              <input
                value={checkHost}
                onChange={e => setCheckHost(e.target.value)}
                placeholder="Хост или IP (например: 192.168.18.222 или ssv.uz)"
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#090d16',
                  color: '#f8fafc',
                  fontSize: 12,
                  width: 280,
                  outline: 'none'
                }}
                required
              />

              <input
                type="number"
                value={checkPort}
                onChange={e => setCheckPort(e.target.value)}
                placeholder="Порт"
                style={{
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#090d16',
                  color: '#f8fafc',
                  fontSize: 12,
                  width: 70,
                  outline: 'none'
                }}
              />

              <button
                type="submit"
                disabled={checking}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 4,
                  border: 'none',
                  background: '#2563eb',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  opacity: checking ? 0.7 : 1
                }}
              >
                {checking ? <Activity size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                <span>{checking ? 'Проверка...' : 'Проверить SSL'}</span>
              </button>
            </form>

            {/* Check Result Banner */}
            {checkResult && (
              <div style={{
                marginTop: 10,
                padding: '10px 14px',
                borderRadius: 5,
                background: checkResult.status === 'valid' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${checkResult.status === 'valid' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
                fontSize: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <StatusBadge status={checkResult.status} daysLeft={checkResult.days_left} />
                  <span style={{ color: '#f8fafc', fontWeight: 600, fontFamily: 'monospace' }}>
                    {checkResult.host}:{checkResult.port}
                  </span>
                  {checkResult.subject && (
                    <span style={{ color: '#94a3b8' }}>
                      CN: <strong style={{ color: '#cbd5e1' }}>{checkResult.subject}</strong>
                    </span>
                  )}
                  {checkResult.issuer && (
                    <span style={{ color: '#94a3b8' }}>
                      Выдан: <strong style={{ color: '#cbd5e1' }}>{checkResult.issuer}</strong>
                    </span>
                  )}
                  {checkResult.days_left != null && (
                    <span style={{ color: checkResult.days_left > 30 ? '#34d399' : '#fbbf24', fontWeight: 600 }}>
                      Осталось: {checkResult.days_left} дн.
                    </span>
                  )}
                  {checkResult.tls_version && (
                    <span style={{ color: '#60a5fa', fontFamily: 'monospace', fontSize: 11 }}>
                      {checkResult.tls_version} ({checkResult.cipher || 'TLS'})
                    </span>
                  )}
                  {checkResult.error && (
                    <span style={{ color: '#f87171' }}>{checkResult.error}</span>
                  )}
                </div>

                {checkResult.status === 'valid' && (
                  <button
                    onClick={handleSaveCurrentTarget}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: '1px solid rgba(37, 99, 235, 0.4)',
                      background: 'rgba(37, 99, 235, 0.15)',
                      color: '#60a5fa',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600
                    }}
                  >
                    <Plus size={12} />
                    <span>Добавить в мониторинг</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Filter Bar */}
          <div style={{
            display: 'flex',
            gap: 8,
            marginBottom: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            background: '#101726',
            border: '1px solid #1e293b',
            borderRadius: 6,
            padding: '8px 12px'
          }}>
            {/* Status Tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { id: 'all', l: 'Все' },
                { id: 'valid', l: 'Действительны' },
                { id: 'expiring', l: 'Истекают' },
                { id: 'expired', l: 'Истёкшие' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 4,
                    border: `1px solid ${statusFilter === f.id ? '#2563eb' : '#1e293b'}`,
                    cursor: 'pointer',
                    fontSize: 11.5,
                    fontWeight: 600,
                    background: statusFilter === f.id ? '#2563eb' : '#090d16',
                    color: statusFilter === f.id ? '#ffffff' : '#94a3b8',
                    transition: 'all 0.15s'
                  }}
                >
                  {f.l}
                </button>
              ))}
            </div>

            <div style={{ flex: 1 }} />

            {/* Live Search */}
            <div style={{ position: 'relative', width: 240 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: 8, color: '#64748b' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по домену, центру..."
                style={{
                  padding: '5px 10px 5px 28px',
                  borderRadius: 4,
                  border: '1px solid #1e293b',
                  background: '#090d16',
                  color: '#f8fafc',
                  fontSize: 11.5,
                  width: '100%',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 8, top: 7, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Loading & Errors */}
          {loading && (
            <div style={{ color: '#64748b', fontSize: 13, padding: 30, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Activity size={16} className="animate-spin" />
              <span>Загрузка данных сертификатов...</span>
            </div>
          )}
          {error && (
            <div style={{ color: '#f87171', fontSize: 12.5, padding: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 4, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Empty State */}
          {!loading && filtered.length === 0 && (
            <div style={{ background: '#101726', border: '1px solid #1e293b', borderRadius: 6, padding: '48px 20px', textAlign: 'center', margin: 'auto 0' }}>
              <Lock size={44} style={{ color: '#64748b', margin: '0 auto 14px', opacity: 0.6 }} />
              <div style={{ color: '#f8fafc', fontSize: 15, fontWeight: 700 }}>Сертификаты не найдены</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 4, maxWidth: 420, margin: '6px auto 0' }}>
                Воспользуйтесь экспресс-проверкой узла выше или добавьте HTTPS веб-сайты в разделе «Веб-сайты».
              </div>
            </div>
          )}

          {/* Certificates Table */}
          {!loading && filtered.length > 0 && (
            <div style={{
              background: '#101726',
              border: '1px solid #1e293b',
              borderRadius: 6,
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden'
            }}>
              <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#090d16', borderBottom: '1px solid #1e293b', position: 'sticky', top: 0, zIndex: 10 }}>
                      <th style={thStyle}>Домен / Хост</th>
                      <th style={thStyle}>Статус</th>
                      <th style={thStyle}>Осталось дней</th>
                      <th style={thStyle}>Центр сертификации (Issuer)</th>
                      <th style={thStyle}>Дата истечения</th>
                      <th style={thStyle}>Источник / Протокол</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => {
                      const days = c.daysLeft
                      const daysColor = days != null ? (days <= 0 ? '#f87171' : (days <= 30 ? '#fbbf24' : '#34d399')) : '#64748b'

                      return (
                        <tr
                          key={`${c.domain}-${i}`}
                          style={{
                            borderBottom: '1px solid #1e293b',
                            transition: 'background 0.12s'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(37, 99, 235, 0.04)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          {/* Domain */}
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 600, color: '#f8fafc', fontFamily: 'monospace', fontSize: 12.5 }}>
                                {c.domain}
                              </span>
                              {c.serverName && (
                                <span style={{ fontSize: 10.5, color: '#64748b' }}>
                                  {c.serverName}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Status */}
                          <td style={tdStyle}>
                            <StatusBadge status={c.status} daysLeft={c.daysLeft} />
                          </td>

                          {/* Days Left */}
                          <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>
                            {days != null ? (
                              <span style={{ color: daysColor, fontWeight: 700, fontSize: 13 }}>
                                {days > 0 ? `${days} дн.` : 'Истёк'}
                              </span>
                            ) : (
                              <span style={{ color: '#64748b' }}>—</span>
                            )}
                          </td>

                          {/* Issuer */}
                          <td style={{ ...tdStyle, color: '#cbd5e1' }}>
                            <span style={{
                              background: '#090d16',
                              border: '1px solid #1e293b',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 11
                            }}>
                              {c.issuer || '—'}
                            </span>
                          </td>

                          {/* Expiration date */}
                          <td style={{ ...tdStyle, color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
                            {c.notAfter ? new Date(c.notAfter).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                          </td>

                          {/* Source */}
                          <td style={tdStyle}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: c.source === 'custom' ? 'rgba(37, 99, 235, 0.15)' : '#090d16',
                              border: '1px solid #1e293b',
                              color: c.source === 'custom' ? '#60a5fa' : '#94a3b8',
                              fontSize: 10.5
                            }}>
                              {c.tlsVersion ? `${c.tlsVersion}` : (c.source === 'custom' ? 'Узел сети' : (c.source === 'server' ? 'Агент' : 'Веб-сайт'))}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            {c.source === 'custom' && (
                              <button
                                onClick={() => handleDeleteTarget(c.domain.split(':')[0])}
                                title="Удалить из списка"
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  background: 'transparent',
                                  color: '#f87171',
                                  cursor: 'pointer',
                                  fontSize: 11
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </td>

                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </ProtectedRoute>
  )
}

const thStyle = {
  textAlign: 'left',
  padding: '10px 12px',
  color: '#64748b',
  borderBottom: '1px solid #1e293b',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em'
}

const tdStyle = {
  padding: '10px 12px',
  color: '#f8fafc',
  verticalAlign: 'middle'
}
