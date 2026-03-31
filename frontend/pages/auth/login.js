import {useState} from 'react'
import {useRouter} from 'next/router'
import Link from 'next/link'

export default function Login(){
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const router = useRouter()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const {default: apiFetch} = await import('../../lib/api')
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email, password})
      })
      
      if(res.access_token){
        localStorage.setItem('token', res.access_token)
        localStorage.setItem('user', JSON.stringify(res.user))
        router.push('/')
      } else {
        setError(res.detail || 'Ошибка входа')
      }
    } catch(err){
      setError('Ошибка сети: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#07111e'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        padding: 32,
        background: '#0a1a2e',
        borderRadius: 8,
        border: '1px solid #1a2940'
      }}>
        <h1 style={{fontSize: 24, marginBottom: 24, color: '#fff', textAlign: 'center'}}>
          Вход
        </h1>
        
        {error && (
          <div style={{
            padding: 12,
            marginBottom: 16,
            background: '#ef4444',
            color: '#fff',
            borderRadius: 4,
            fontSize: 14
          }}>
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: 16}}>
          <div>
            <label style={{display: 'block', marginBottom: 6, color: '#fff', fontSize: 13}}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #1a2940',
                borderRadius: 4,
                background: '#07111e',
                color: '#fff',
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>
          
          <div>
            <label style={{display: 'block', marginBottom: 6, color: '#fff', fontSize: 13}}>
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #1a2940',
                borderRadius: 4,
                background: '#07111e',
                color: '#fff',
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 16px',
              background: loading ? '#64748b' : '#00d4ff',
              color: '#000',
              border: 'none',
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Загрузка...' : 'Войти'}
          </button>
        </form>
        
        <div style={{marginTop: 20, textAlign: 'center', color: '#9aa4b2', fontSize: 14}}>
          Нет аккаунта?{' '}
          <Link href="/auth/register" style={{color: '#00d4ff', textDecoration: 'none'}}>
            Зарегистрируйтесь
          </Link>
        </div>
      </div>
    </div>
  )
}
