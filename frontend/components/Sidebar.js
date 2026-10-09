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
  ExternalLink
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
    label: 'Главная',
    href: '/',
  },
  {
    id: 'resources',
    icon: <Server size={15} />,
    label: 'Ресурсы',
    items: [
      { label: 'Серверы',               href: '/servers' },
      { label: 'Веб-сайты',             href: '/websites' },
      { label: 'API',                   href: '/api-monitoring', adminOnly: true },
      {
        id: 'containers',
        label: 'Контейнеры',
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
    label: 'События',
    items: [
      { label: 'Алерты',     href: '/alerts' },
      { label: 'Инциденты',  href: '/incidents' },
      { label: 'Логи',       href: '/logs', adminOnly: true },
    ],
  },
  {
    id: 'analytics',
    icon: <LineChart size={15} />,
    label: 'Аналитика',
    items: [
      { label: 'Дашборды', href: '/dashboards' },
      { label: 'Grafana',   href: 'http://192.168.17.50:3001', external: true },
      { label: 'Отчёты',   href: '/reports' },
    ],
  },
  {
    id: 'notifications',
    icon: <Bell size={15} />,
    label: 'Уведомления',
    adminOnly: true,
    items: [
      { label: 'Telegram',        href: '/telegram' },
      { label: 'Email & Webhook', href: '/notifications' },
      { label: 'SMS',             soon: true },
    ],
  },
  {
    id: 'system',
    icon: <Settings size={15} />,
    label: 'Система',
    items: [
      { label: 'Обслуживание', href: '/maintenance' },
      { label: 'Настройки',    href: '/settings', adminOnly: true },
    ],
  },
  {
    id: 'admin',
    icon: <Shield size={15} />,
    label: 'Администрирование',
    adminOnly: true,
    items: [
      { label: 'Организации',  href: '/organizations' },
      { label: 'Пользователи', href: '/admin' },
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
          padding: `5px 10px 5px ${12 + depth * 14}px`,
          color: hover ? '#c4cfe0' : '#6272a4',
          background: hover ? 'rgba(255,255,255,0.04)' : 'none',
          fontSize: 12.5,
          textDecoration: 'none',
          borderRadius: '0 6px 6px 0',
          transition: 'color 0.12s, background 0.12s',
          lineHeight: 1.5,
        }}
      >
        <span style={{ flex: 1 }}>{label}</span>
        <ExternalLink size={11} style={{ opacity: 0.6 }} />
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
        padding: `5px 10px 5px ${12 + depth * 14}px`,
        color: active ? '#a5b4fc' : hover ? '#c4cfe0' : '#6272a4',
        background: active ? 'rgba(99,102,241,0.12)' : hover ? 'rgba(255,255,255,0.04)' : 'none',
        borderLeft: `2px solid ${active ? '#6366f1' : 'transparent'}`,
        fontSize: 12.5,
        textDecoration: 'none',
        borderRadius: '0 6px 6px 0',
        transition: 'color 0.12s, background 0.12s',
        lineHeight: 1.5,
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
      padding: `5px 10px 5px ${12 + depth * 14}px`,
      color: '#2e3558',
      fontSize: 12.5,
      lineHeight: 1.5,
      userSelect: 'none',
    }}>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{
        fontSize: 9,
        color: '#3a4070',
        background: '#0d0d24',
        border: '1px solid #1c1c3e',
        padding: '1px 5px',
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
          padding: `5px 10px 5px ${12 + depth * 14}px`,
          background: hover ? 'rgba(255,255,255,0.04)' : 'none',
          border: 'none',
          borderLeft: '2px solid transparent',
          cursor: 'pointer',
          color: active ? '#a5b4fc' : hover ? '#8892a8' : '#4a5078',
          fontSize: 12.5,
          textAlign: 'left',
          borderRadius: '0 6px 6px 0',
          transition: 'color 0.12s, background 0.12s',
          fontFamily: 'inherit',
          lineHeight: 1.5,
        }}
      >
        <span style={{ flex: 1 }}>{item.label}</span>
        <ChevronRight size={12} style={{
          color: '#3a4070',
          transition: 'transform 0.18s',
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
        padding: '7px 10px',
        color: active ? '#a5b4fc' : hover ? '#c4cfe0' : '#8892a8',
        background: active ? 'rgba(99,102,241,0.12)' : hover ? 'rgba(255,255,255,0.04)' : 'none',
        borderLeft: `2px solid ${active ? '#6366f1' : 'transparent'}`,
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
        borderRadius: '0 7px 7px 0',
        transition: 'color 0.12s, background 0.12s',
        marginBottom: 1,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', opacity: active ? 1 : 0.8, color: active ? '#818cf8' : 'inherit' }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 9,
          fontWeight: 800,
          background: 'linear-gradient(135deg, #6366f1, #38bdf8)',
          color: '#ffffff',
          padding: '1px 5px',
          borderRadius: 4,
          letterSpacing: 0.5,
          boxShadow: '0 0 8px rgba(99,102,241,0.5)',
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
        gap: 9,
        width: '100%',
        padding: '7px 10px',
        background: hover ? 'rgba(255,255,255,0.04)' : 'none',
        border: 'none',
        borderLeft: '2px solid transparent',
        cursor: 'pointer',
        color: active ? '#a5b4fc' : hover ? '#8892a8' : '#6272a4',
        fontSize: 12,
        fontWeight: 700,
        textAlign: 'left',
        borderRadius: '0 7px 7px 0',
        marginBottom: 1,
        fontFamily: 'inherit',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', opacity: active ? 1 : 0.7, color: active ? '#818cf8' : 'inherit' }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      <ChevronDown size={13} style={{
        color: '#4a5078',
        transition: 'transform 0.18s',
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
      <div key={sec.id} style={{ marginBottom: 2 }}>
        <SectionHeader
          icon={sec.icon}
          label={sec.label}
          isOpen={isOpen}
          active={hasActiveChild}
          onClick={() => toggleSection(sec.id)}
        />
        {isOpen && (
          <div style={{ paddingBottom: 4 }}>
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
    <>
      {/* Mobile top navbar button */}
      <div style={{
        display: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 50,
        background: '#07071a',
        borderBottom: '1px solid #1c1c3e',
        zIndex: 999,
        padding: '0 16px',
        alignItems: 'center',
        justifyContent: 'space-between',
      }} className="mobile-header">
        <div style={{ fontWeight: 800, color: '#e2e4f0', fontSize: 15 }}>
          <span style={{ color: '#6366f1' }}>⚡</span> MONITORING
        </div>
        <button
          onClick={() => setSidebarOpen(prev => !prev)}
          style={{
            background: 'none',
            border: 'none',
            color: '#8892a8',
            fontSize: 20,
            cursor: 'pointer',
            padding: 4,
          }}
        >
          ☰
        </button>
      </div>

      <div style={{
        width: 220,
        height: '100vh',
        background: '#07071a',
        borderRight: '1px solid #1c1c3e',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        userSelect: 'none',
        zIndex: 50,
      }}>
        {/* Brand Header */}
        <div style={{
          padding: '16px 14px 12px',
          borderBottom: '1px solid #121228',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1, #38bdf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px rgba(99,102,241,0.4)',
            color: '#fff',
            fontWeight: 900,
            fontSize: 16,
          }}>
            ⚡
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#e2e4f0', letterSpacing: 0.3 }}>
              MONITORING
            </div>
            <div style={{ fontSize: 10, color: '#4a5078', fontWeight: 600 }}>
              PLATFORM PRO
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
              gap: 8,
              padding: '6px 10px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid #1a1a36',
              borderRadius: 6,
              color: '#6272a4',
              fontSize: 11.5,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s',
            }}
          >
            <Search size={13} style={{ color: '#6366f1' }} />
            <span style={{ flex: 1, textAlign: 'left' }}>Быстрый поиск</span>
            <kbd style={{
              fontSize: 9,
              background: '#121228',
              color: '#818cf8',
              padding: '1px 5px',
              borderRadius: 3,
              border: '1px solid #1c1c3e',
              fontWeight: 700,
            }}>Ctrl K</kbd>
          </button>
        </div>

        {/* Nav Links */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 5px 10px 3px',
          scrollbarWidth: 'thin',
          scrollbarColor: '#1c1c3e transparent',
        }}>
          {NAV.map(section => renderSection(section))}
        </div>

        {/* Audio toggle & User / Logout */}
        <div style={{
          padding: '10px 12px 14px',
          borderTop: '1px solid #121228',
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
              padding: '5px 8px',
              background: soundEnabled ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${soundEnabled ? 'rgba(34, 197, 94, 0.25)' : '#1e1e40'}`,
              borderRadius: 6,
              marginBottom: 10,
              cursor: 'pointer',
              fontSize: 11,
              color: soundEnabled ? '#4ade80' : '#8892a8',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {soundEnabled ? 'Звук алертов' : 'Без звука'}
            </span>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              padding: '1px 4px',
              borderRadius: 3,
              background: soundEnabled ? '#22c55e' : '#334155',
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
                  width: 28, height: 28,
                  background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {(user.username || 'U')[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#c4cfe0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.username}
                  </div>
                  <div style={{
                    fontSize: 10.5,
                    color: user.role === 'admin' ? '#f59e0b' : '#818cf8',
                    marginTop: 1,
                  }}>
                    {user.role === 'admin' ? 'Администратор' : user.role === 'user' ? 'Пользователь' : 'Просмотр'}
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
                  padding: '6px 10px',
                  background: 'rgba(244,63,94,0.1)',
                  color: '#f87171',
                  border: '1px solid rgba(244,63,94,0.2)',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
              >
                <LogOut size={13} />
                Выйти
              </button>
            </>
          ) : (
            <Link href="/auth/login" style={{
              display: 'block',
              padding: '7px 12px',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
              textDecoration: 'none',
            }}>
              Войти
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
