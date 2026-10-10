import {useRouter} from 'next/router'
import {useEffect, useState} from 'react'

export default function ProtectedRoute({children, requiredRole = null}) {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const user = localStorage.getItem('user')
    
    if(!token || !user) {
      router.push('/auth/login')
      return
    }
    
    try {
      const userData = JSON.parse(user)
      if (requiredRole && String(userData.role || '').toLowerCase() !== String(requiredRole || '').toLowerCase()) {
        router.push('/')
        return
      }
      setIsAuthorized(true)
    } catch {
      router.push('/auth/login')
    }
  }, [router, requiredRole])

  if(isAuthorized === null) {
    return (
      <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#090d16'}}>
        <div style={{color: '#64748b', fontSize: 13}}>Загрузка...</div>
      </div>
    )
  }

  if(!isAuthorized) {
    return null
  }

  return children
}
