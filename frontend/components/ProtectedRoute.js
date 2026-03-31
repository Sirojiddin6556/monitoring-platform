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
    
    const userData = JSON.parse(user)
    if(requiredRole && userData.role !== requiredRole) {
      router.push('/')
      return
    }
    
    setIsAuthorized(true)
  }, [router, requiredRole])

  if(isAuthorized === null) {
    return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#07111e'}}>
      <div style={{color: '#9aa4b2'}}>Загрузка...</div>
    </div>
  }

  if(!isAuthorized) {
    return null
  }

  return children
}
