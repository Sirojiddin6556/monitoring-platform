import Link from 'next/link'
import {useRouter} from 'next/router'
import {useState, useEffect} from 'react'

export default function Sidebar() {
  const router = useRouter()
  const [user, setUser] = useState(null)

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if(storedUser) {
      setUser(JSON.parse(storedUser))
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/auth/login')
  }

  return (
    <div className="sidebar" style={{display: 'flex', flexDirection: 'column', height: '100vh'}}>
      <div>
        <h3>Monitoring</h3>
        <ul className="nav-list">
          <li><Link href="/" className={router.pathname === '/' ? 'active' : ''}>Главная</Link></li>
          <li><Link href="/servers" className={router.pathname === '/servers' ? 'active' : ''}>Серверы</Link></li>
          <li><Link href="/websites" className={router.pathname === '/websites' ? 'active' : ''}>Веб-сайты</Link></li>
          <li><Link href="/docker" className={router.pathname === '/docker' ? 'active' : ''}>Docker</Link></li>
          <li><Link href="/kubernetes" className={router.pathname === '/kubernetes' ? 'active' : ''}>Kubernetes</Link></li>
          <li><Link href="/vms" className={router.pathname === '/vms' ? 'active' : ''}>Виртуальные машины</Link></li>
          <li><Link href="/telegram" className={router.pathname === '/telegram' ? 'active' : ''}>Telegram</Link></li>
          <li><Link href="/alerts" className={router.pathname === '/alerts' ? 'active' : ''}>Алерты</Link></li>
          <li><Link href="/logs" className={router.pathname === '/logs' ? 'active' : ''}>Логи</Link></li>
          <li><Link href="/settings" className={router.pathname === '/settings' ? 'active' : ''}>Настройки</Link></li>
          {user?.role === 'admin' && (
            <li><Link href="/admin" className={router.pathname === '/admin' ? 'active' : ''}>Администрирование</Link></li>
          )}
        </ul>
      </div>
      
      <div style={{marginTop: 'auto', paddingBottom: 20, borderTop: '1px solid #1a2940'}}>
        {user ? (
          <div style={{padding: '16px 0'}}>
            <div style={{fontSize: 13, color: '#9aa4b2', marginBottom: 4}}>Пользователь</div>
            <div style={{fontSize: 14, color: '#fff', marginBottom: 12, fontWeight: 600}}>
              {user.username}
            </div>
            <div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 12}}>
              Роль: <span style={{color: user.role === 'admin' ? '#facc15' : '#00d4ff'}}>{user.role === 'admin' ? 'Администратор' : user.role === 'user' ? 'Пользователь' : 'Просмотр'}</span>
            </div>
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#ef444460',
                color: '#ef4444',
                border: '1px solid #ef4444',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#ef4444'}
              onMouseLeave={(e) => e.target.style.background = '#ef444460'}
            >
              Выход
            </button>
          </div>
        ) : (
          <Link href="/auth/login" style={{
            display: 'block',
            padding: '10px 12px',
            background: '#00d4ff',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'center',
            textDecoration: 'none'
          }}>
            Войти
          </Link>
        )}
      </div>
    </div>
  )
}
