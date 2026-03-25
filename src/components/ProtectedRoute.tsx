import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

/**
 * Server-verified route guard.
 * - Checks session validity against the server (not just client state)
 * - For admin routes, re-verifies admin role via DB function
 */
const ProtectedRoute = ({ children, requireAdmin = false }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const [verified, setVerified] = useState<'loading' | 'ok' | 'denied'>('loading');

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      if (loading) return;

      if (!user) {
        if (!cancelled) setVerified('denied');
        return;
      }

      // Re-verify session with server
      const { data: { user: serverUser }, error } = await supabase.auth.getUser();
      if (error || !serverUser) {
        if (!cancelled) setVerified('denied');
        return;
      }

      if (requireAdmin) {
        // Server-side admin check via DB function
        const { data: isAdmin } = await supabase.rpc('has_role', {
          _user_id: serverUser.id,
          _role: 'admin',
        });
        if (!cancelled) setVerified(isAdmin ? 'ok' : 'denied');
      } else {
        if (!cancelled) setVerified('ok');
      }
    };

    verify();
    return () => { cancelled = true; };
  }, [user, loading, requireAdmin]);

  if (loading || verified === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (verified === 'denied') {
    return <Navigate to={user ? '/' : '/login'} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
