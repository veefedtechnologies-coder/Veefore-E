import LoadingSpinner from './LoadingSpinner'

const AuthGuard = ({ children }: AuthGuardProps) => {
  const { user, loading } = useAuth()
  const [location, setLocation] = useLocation()

  // Show loading spinner while checking authentication
  if (loading) {
    return <LoadingSpinner />
  }

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/signin', '/signup', '/forgot-password']

  // If user is not authenticated and trying to access protected route
  if (!user && !publicRoutes.includes(location)) {
    // Redirect to landing page
    setLocation('/')
    return null
  }

  // If user is authenticated and trying to access auth pages, redirect to home
  if (user && (location === '/signin' || location === '/signup')) {
    setLocation('/home')
    return null
  }

  return <>{children}</>
}

export default AuthGuard