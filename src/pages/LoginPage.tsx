import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { lovable } from '@/integrations/lovable/index';
import { Radio } from 'lucide-react';

const LoginPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/');
  }, [user, loading, navigate]);

  const handleGoogleLogin = async () => {
    const { error } = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
    });
    if (error) console.error('Login error:', error);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <Radio className="w-16 h-16 md:w-12 md:h-12 text-primary-foreground" />
          <h1 className="text-3xl md:text-2xl font-bold text-foreground">Live Word</h1>
          <p className="text-muted-foreground text-base md:text-sm">교회 말씀 스트리밍 플랫폼</p>
        </div>

        <Button
          onClick={handleGoogleLogin}
          className="w-full h-12 text-base bg-foreground text-background hover:bg-foreground/90"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google로 로그인
        </Button>

        <p className="text-xs text-muted-foreground">
          로그인 시 즐겨찾기 저장 및 개인화된 추천을 받을 수 있습니다.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
