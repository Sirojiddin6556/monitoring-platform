import {useState} from 'react'
import {useRouter} from 'next/router'
import Link from 'next/link'
import apiFetch from '../../lib/api'

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
      setError(err.message || 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width:'100%', padding:'10px 12px',
    border:'1px solid #1c1c3e', borderRadius:8,
    background:'#0b0b1e', color:'#e2e4f0',
    fontSize:14, outline:'none', fontFamily:'inherit',
    transition:'border-color 0.18s',
  }

  return (
    <div style={{
      display:'flex', justifyContent:'center', alignItems:'center',
      minHeight:'100vh',
      background:'radial-gradient(ellipse 120% 80% at 60% -10%, #1a0a3a 0%, #07071a 55%, #030310 100%)',
    }}>
      <div style={{
        width:'100%', maxWidth:380,
        padding:36,
        background:'linear-gradient(135deg, rgba(13,13,36,0.98) 0%, rgba(11,11,30,0.96) 100%)',
        borderRadius:16,
        border:'1px solid rgba(130,130,220,0.12)',
        boxShadow:'0 24px 64px rgba(0,0,0,0.6), 0 0 80px rgba(99,102,241,0.05)',
      }}>
        {/* Logo */}
        <div style={{textAlign:'center', marginBottom:28}}>
          <div style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:44, height:44,
            background:'linear-gradient(135deg, #6366f1, #4f46e5)',
            borderRadius:12, fontSize:20, marginBottom:12,
            boxShadow:'0 0 20px rgba(99,102,241,0.4)',
          }}>⬡</div>
          <div style={{fontSize:20, fontWeight:700, color:'#e2e4f0', letterSpacing:-0.3}}>Monitoring</div>
          <div style={{fontSize:12, color:'#6272a4', marginTop:4}}>Войдите в аккаунт</div>
        </div>

        {error && (
          <div style={{
            padding:'10px 14px', marginBottom:16,
            background:'rgba(244,63,94,0.1)', color:'#f87171',
            border:'1px solid rgba(244,63,94,0.25)',
            borderRadius:8, fontSize:13,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{display:'flex', flexDirection:'column', gap:14}}>
          <div>
            <label style={{display:'block', marginBottom:5, color:'#8892a8', fontSize:12, fontWeight:600, textTransform:'uppercase', letterSpacing:0.4}}>
              Email
            </label>
            <input
              type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              required placeholder="you@example.com"
              style={inputStyle}
              onFocus={e=>{e.target.style.borderColor='rgba(99,102,241,0.5)'; e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.1)'}}
              onBlur={e=>{e.target.style.borderColor='#1c1c3e'; e.target.style.boxShadow='none'}}
            />
          </div>

          <div>
            <label style={{display:'block', marginBottom:5, color:'#8892a8', fontSize:12, fontWeight:600, textTransform:'uppercase', letterSpacing:0.4}}>
              Пароль
            </label>
            <input
              type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              required placeholder="••••••••"
              style={inputStyle}
              onFocus={e=>{e.target.style.borderColor='rgba(99,102,241,0.5)'; e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.1)'}}
              onBlur={e=>{e.target.style.borderColor='#1c1c3e'; e.target.style.boxShadow='none'}}
            />
          </div>

          <button
            type="submit" disabled={loading}
            style={{
              marginTop:4,
              padding:'11px 16px',
              background: loading ? '#2a2a50' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color:'#fff', border:'none', borderRadius:8,
              fontSize:14, fontWeight:600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.65 : 1,
              fontFamily:'inherit',
              boxShadow: loading ? 'none' : '0 0 16px rgba(99,102,241,0.3)',
              transition:'all 0.18s',
            }}
          >
            {loading ? 'Загрузка...' : 'Войти'}
          </button>
        </form>

        <div style={{marginTop:20, textAlign:'center', color:'#6272a4', fontSize:13}}>
          Нет аккаунта?{' '}
          <Link href="/auth/register" style={{color:'#818cf8', textDecoration:'none', fontWeight:600}}>
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </div>
  )
}
