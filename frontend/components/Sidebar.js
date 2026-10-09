import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { 
  BarChart3, 
  Tv, 
  LayoutDashboard, 
  Server, 
  AlertTriangle, 
  LineChart, 
  Bell, 
  Settings, 
  Shield, 
  Search, 
  Volume2, 
  VolumeX, 
  LogOut, 
  ChevronDown, 
  ChevronRight,
  ExternalLink,
  Layers
} from 'lucide-react'
import { isSoundEnabled, setSoundEnabled, playAlertSound } from './SoundAlert'

const NAV = [
  {
    id: "executive",
    icon: <BarChart3 size={15} />,
    label: "Ситуационный Центр",
    href: "/executive",
  },
  {
    id: "noc",
    icon: <Tv size={15} />,
    label: "NOC Экран (TV)",
    href: "/noc",
    badge: "LIVE",
  },
  {
    id: 'home',
    icon: <LayoutDashboard size={15} />,
    label: 'Обзор системы',
    href: '/',
  },
  {
    id: 'resources',
    icon: <Server size={15} />,
    label: 'Инфраструктура',
    items: [
      { label: 'Серверы',               href: '/servers' },
      { label: 'Веб-сайты',             href: '/websites' },
      { label: 'API сервисы',           href: '/api-monitoring', adminOnly: true },
      {
        id: 'containers',
        label: 'Контейнеризация',
        adminOnly: true,
        items: [
          { label: 'Docker',            href: '/docker' },
          { label: 'Kubernetes',        href: '/kubernetes' },
        ],
      },
      { label: 'Виртуальные машины',    href: '/vms', adminOnly: true },
      { label: 'Базы данных',           href: '/databases' },
      { label: 'Сетевое оборудование',  href: '/network-equipment' },
      { label: 'SSL-сертификаты',       href: '/ssl' },
    ],
  },
  {
    id: 'events',
    icon: <AlertTriangle size={15} />,
    label: 'Мониторинг событий',
    items: [
      { label: 'Алерты',     href: '/alerts' },
      { label: 'Инциденты',  href: '/incidents' },
      { label: 'Журнал логов', href: '/logs', adminOnly: true },
    ],
  },
  {
    id: 'analytics',
    icon: <LineChart size={15} />,
    label: 'Аналитика и отчёты',
    items: [
      { label: 'Дашборды', href: '/dashboards' },
      { label: 'Grafana',   href: 'http://192.168.17.50:3001', external: true },
      { label: 'Сводные отчёты', href: '/reports' },
    ],
  },
  {
    id: 'notifications',
    icon: <Bell size={15} />,
    label: 'Оповещения',
    adminOnly: true,
    items: [
      { label: 'Telegram бот',    href: '/telegram' },
      { label: 'Email & Webhook', href: '/notifications' },
      { label: 'SMS шлюз',        soon: true },
    ],
  },
  {
    id: 'system',
    icon: <Settings size={15} />,
    label: 'Конфигурация',
    items: [
      { label: 'Регламентные работы', href: '/maintenance' },
      { label: 'Параметры системы',  href: '/settings', adminOnly: true },
    ],
  },
  {
    id: 'admin',
    icon: <Shield size={15} />,
    label: 'Управление доступом',
    adminOnly: true,
    items: [
      { label: 'Организации',   href: '/organizations' },
      { label: 'Учётные записи', href: '/admin' },
    ],
  },
]

function collectHrefs(items) {
  const out = []
  for (const item of items) {
    if (item.href) out.push(item.href)
    if (item.items) out.push(...collectHrefs(item.items))
  }
  return out
}

function anyChildActive(items, pathname) {
  for (const href of collectHrefs(items)) {
    if (href === pathname || (href !== '/' && pathname.startsWith(href + '/'))) return true
  }
  return false
}

function NavLeaf({ label, href, depth, pathname, external }) {
  const [hover, setHover] = useState(false)
  const isExt = external || (href && href.startsWith('http'))
  const active = !isExt && (href === pathname || (href !== '/' && pathname.startsWith(href + '/')))
  
  if (isExt) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: `5px 12px 5px ${14 + depth * 12}px`,
          color: hover ? '#f1f5f9' : '#8896ab',
          background: hover ? 'rgba(255,255,255,0.03)' : 'none',
          fontSize: 12,
          textDecoration: 'none',
          transition: 'color 0.1s',
          lineHeight: 1.4,
        }}
      >
        <span style={{ flex: 1 }}>{label}</span>
        <ExternalLink size={10} style={{ opacity: 0.5 }} />
      </a>
    )
  }

  return (
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: `5px 12px 5px ${14 + depth * 12}px`,
        color: active ? '#60a5fa' : hover ? '#f1f5f9' : '#8896ab',
        background: active ? 'rgba(37,99,235,0.08)' : hover ? 'rgba(255,255,255,0.03)' : 'none',
        borderLeft: `2px solid ${active ? '#2563eb' : 'transparent'}`,
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        textDecoration: 'none',
        transition: 'all 0.1s',
        lineHeight: 1.4,
      }}
    >
      {label}
    </Link>
  )
}

function NavSoon({ label, depth }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: `5px 12px 5px ${14 + depth * 12}px`,
      color: '#475569',
      fontSize: 12,
      lineHeight: 1.4,
      userSelect: 'none',
    }}>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{
        fontSize: 9,
        color: '#64748b',
        background: '#0d131f',
        border: '1px solid #1e293b',
        padding: '1px 4px',
        borderRadius: 3,
        letterSpacing: 0.3,
      }}>Скоро</span>
    </div>
  )
}

function NavSubGroup({ item, depth, pathname, open, toggle }) {
  const active = anyChildActive(item.items, pathname)
  const isOpen = open[item.id] !== undefined ? open[item.id] : active
  const [hover, setHover] = useState(false)

  return (
    <div>
      <button
        onClick={() => toggle(item.id)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: `5px 12px 5px ${14 + depth * 12}px`,
          background: hover ? 'rgba(255,255,255,0.03)' : 'none',
          border: 'none',
          borderLeft: '2px solid transparent',
          cursor: 'pointer',
          color: active ? '#93c5fd' : hover ? '#cbd5e1' : '#64748b',
          fontSize: 12,
          fontWeight: 500,
          textAlign: 'left',
          transition: 'color 0.1s',
          fontFamily: 'inherit',
          lineHeight: 1.4,
        }}
      >
        <span style={{ flex: 1 }}>{item.label}</span>
        <ChevronRight size={11} style={{
          color: '#475569',
          transition: 'transform 0.15s',
          transform: isOpen ? 'rotate(90deg)' : 'none',
        }} />
      </button>

      {isOpen && (
        <div>
          {item.items.map(sub => (
            <NavLeaf
              key={sub.href || sub.label}
              label={sub.label}
              href={sub.href}
              depth={depth + 1}
              pathname={pathname}
              external={sub.external}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TopLevelLink({ icon, label, href, badge, pathname }) {
  const active = href === pathname
  const [hover, setHover] = useState(false)

  return (
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '6px 12px',
        color: active ? '#60a5fa' : hover ? '#f1f5f9' : '#94a3b8',
        background: active ? 'rgba(37,99,235,0.09)' : hover ? 'rgba(255,255,255,0.03)' : 'none',
        borderLeft: `3px solid ${active ? '#2563eb' : 'transparent'}`,
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        textDecoration: 'none',
        transition: 'all 0.1s',
        marginBottom: 1,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', color: active ? '#3b82f6' : '#64748b' }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          background: '#162238',
          border: '1px solid #1e3a5f',
          color: '#38bdf8',
          padding: '1px 5px',
          borderRadius: 3,
          letterSpacing: 0.5,
        }}>
          {badge}
        </span>
      )}
    </Link>
  )
}

function SectionHeader({ icon, label, isOpen, active, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '6px 12px',
        background: hover ? 'rgba(255,255,255,0.02)' : 'none',
        border: 'none',
        borderLeft: '3px solid transparent',
        cursor: 'pointer',
        color: active ? '#93c5fd' : hover ? '#cbd5e1' : '#64748b',
        fontSize: 11,
        fontWeight: 600,
        textAlign: 'left',
        marginBottom: 1,
        fontFamily: 'inherit',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', color: active ? '#3b82f6' : '#475569' }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      <ChevronDown size={12} style={{
        color: '#475569',
        transition: 'transform 0.15s',
        transform: isOpen ? 'none' : 'rotate(-90deg)',
      }} />
    </button>
  )
}

export default function Sidebar() {
  const router = useRouter()
  const pathname = router.pathname

  const [user, setUser] = useState(null)
  const [soundEnabled, setSoundState] = useState(true)
  const [open, setOpen] = useState({})

  useEffect(() => {
    try {
      const u = localStorage.getItem('user')
      if (u) setUser(JSON.parse(u))
    } catch {}
    setSoundState(isSoundEnabled())
  }, [])

  // Auto-expand active section
  useEffect(() => {
    NAV.forEach(sec => {
      if (sec.items && anyChildActive(sec.items, pathname)) {
        setOpen(prev => ({ ...prev, [sec.id]: true }))
      }
    })
  }, [pathname])

  const toggleSection = (id) => {
    setOpen(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    setSoundState(next)
    if (next) playAlertSound('info')
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/auth/login')
  }

  const isAdmin = user?.role === 'admin'

  const renderSection = (sec) => {
    if (sec.adminOnly && !isAdmin) return null

    if (sec.href) {
      return (
        <TopLevelLink
          key={sec.id}
          icon={sec.icon}
          label={sec.label}
          href={sec.href}
          badge={sec.badge}
          pathname={pathname}
        />
      )
    }

    const hasActiveChild = anyChildActive(sec.items, pathname)
    const isOpen = open[sec.id] !== undefined ? open[sec.id] : hasActiveChild

    return (
      <div key={sec.id} style={{ marginBottom: 3 }}>
        <SectionHeader
          icon={sec.icon}
          label={sec.label}
          isOpen={isOpen}
          active={hasActiveChild}
          onClick={() => toggleSection(sec.id)}
        />
        {isOpen && (
          <div style={{ paddingBottom: 2 }}>
            {sec.items.map(it => {
              if (it.adminOnly && !isAdmin) return null
              if (it.items) {
                return (
                  <NavSubGroup
                    key={it.id}
                    item={it}
                    depth={1}
                    pathname={pathname}
                    open={open}
                    toggle={toggleSection}
                  />
                )
              }
              if (it.soon) {
                return <NavSoon key={it.label} label={it.label} depth={1} />
              }
              return (
                <NavLeaf
                  key={it.href || it.label}
                  label={it.label}
                  href={it.href}
                  depth={1}
                  pathname={pathname}
                  external={it.external}
                />
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      width: 220,
      height: '100vh',
      background: '#0a0e17',
      borderRight: '1px solid #1a2436',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      userSelect: 'none',
      zIndex: 50,
    }}>
      {/* Strict Corporate Header */}
      <div style={{
        padding: '14px 14px 12px',
        borderBottom: '1px solid #162032',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 4,
          background: '#121b2d',
          border: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#3b82f6',
        }}>
          <Layers size={16} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.04em' }}>
            MONITORING
          </div>
          <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Operations Console
          </div>
        </div>
      </div>

      {/* Global Quick Search Pill (Ctrl+K) */}
      <div style={{ padding: '8px 10px 4px' }}>
        <button
          onClick={() => {
            const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })
            window.dispatchEvent(event)
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 9px',
            background: '#0d131f',
            border: '1px solid #1e293b',
            borderRadius: 4,
            color: '#64748b',
            fontSize: 11.5,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Search size={12} style={{ color: '#3b82f6' }} />
          <span style={{ flex: 1, textAlign: 'left' }}>Поиск...</span>
          <kbd style={{
            fontSize: 9,
            background: '#141d2d',
            color: '#94a3b8',
            padding: '1px 4px',
            borderRadius: 3,
            border: '1px solid #1e293b',
            fontFamily: 'var(--font-mono)',
          }}>Ctrl K</kbd>
        </button>
      </div>

      {/* Nav Links */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '6px 0 10px',
        scrollbarWidth: 'thin',
        scrollbarColor: '#1e293b transparent',
      }}>
        {NAV.map(section => renderSection(section))}
      </div>

      {/* Footer: Audio toggle & User profile */}
      <div style={{
        padding: '8px 12px 12px',
        borderTop: '1px solid #162032',
        background: '#080c14',
        flexShrink: 0,
      }}>
        {/* Sound toggle button */}
        <button
          onClick={toggleSound}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 8px',
            background: soundEnabled ? 'rgba(16, 185, 129, 0.08)' : '#0d131f',
            border: `1px solid ${soundEnabled ? 'rgba(16, 185, 129, 0.25)' : '#1e293b'}`,
            borderRadius: 4,
            marginBottom: 8,
            cursor: 'pointer',
            fontSize: 11,
            color: soundEnabled ? '#34d399' : '#64748b',
            fontFamily: 'inherit',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
            {soundEnabled ? 'Алерты со звуком' : 'Звук отключен'}
          </span>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 4px',
            borderRadius: 2,
            background: soundEnabled ? '#10b981' : '#334155',
            color: '#fff',
          }}>
            {soundEnabled ? 'ON' : 'OFF'}
          </span>
        </button>

        {user ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
            }}>
              <div style={{
                width: 24, height: 24,
                background: '#1a2538',
                border: '1px solid #2d3b55',
                borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#f1f5f9', flexShrink: 0,
              }}>
                {(user.username || 'U')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.username}
                </div>
                <div style={{
                  fontSize: 10,
                  color: user.role === 'admin' ? '#f59e0b' : '#3b82f6',
                }}>
                  {user.role === 'admin' ? 'Администратор' : 'Оператор'}
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '4px 8px',
                background: '#121722',
                color: '#94a3b8',
                border: '1px solid #1e293b',
                borderRadius: 4,
                fontSize: 11.5,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#7f1d1d' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#1e293b' }}
            >
              <LogOut size={12} />
              Выход
            </button>
          </>
        ) : (
          <Link href="/auth/login" style={{
            display: 'block',
            padding: '5px 10px',
            background: '#2563eb',
            color: '#fff',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            textAlign: 'center',
            textDecoration: 'none',
          }}>
            Войти в систему
          </Link>
        )}
      </div>
    </div>
  )
}
