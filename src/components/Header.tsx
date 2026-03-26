import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Radio, X, Heart, LogIn, LogOut, Shield, User, PlusCircle, Tv } from 'lucide-react';
import logoImage from '@/assets/logo.png';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const Header = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { user, profile, isAdmin, signOut } = useAuth();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setSearchOpen(false);
      setQuery('');
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
       <div className="container flex items-center justify-between h-[4.5rem] md:h-14 px-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src={logoImage} alt="Live Word Mission" className="w-12 h-12 md:w-8 md:h-8 object-contain" />
          <span className="font-bold text-lg text-foreground hidden sm:inline">Live Word Mission</span>
        </Link>

        {/* Desktop search */}
        <form onSubmit={handleSearch} className="hidden md:flex items-center flex-1 max-w-md mx-6">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="말씀, 교회, 설교자 검색..."
              className="pl-9 bg-muted border-none"
            />
          </div>
        </form>

        <div className="flex items-center gap-3 md:gap-1">
          {/* Mobile search toggle */}
          <Button variant="ghost" size="icon" className="md:hidden w-12 h-12" onClick={() => setSearchOpen(!searchOpen)}>
            {searchOpen ? <X className="w-7 h-7" /> : <Search className="w-7 h-7" />}
          </Button>

          <Link to="/live">
            <Button className="bg-live text-live-foreground hover:bg-live/90 text-base md:text-xs font-semibold px-6 py-3 h-12 md:h-8 md:px-3">
              <Radio className="w-5 h-5 md:w-3.5 md:h-3.5 mr-2 md:mr-1" />
              LIVE
            </Button>
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full w-12 h-12 md:w-9 md:h-9">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-10 h-10 md:w-7 md:h-7 rounded-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 md:w-5 md:h-5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-64 md:w-48">
                <div className="px-4 py-3 md:px-2 md:py-1.5">
                  <p className="text-lg md:text-sm font-medium text-foreground">{profile?.display_name || '사용자'}</p>
                  <p className="text-base md:text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="py-4 md:py-2 text-lg md:text-sm" onClick={() => navigate('/favorites')}>
                  <Heart className="w-6 h-6 md:w-4 md:h-4 mr-4 md:mr-2" /> 즐겨찾기
                </DropdownMenuItem>
                <DropdownMenuItem className="py-4 md:py-2 text-lg md:text-sm" onClick={() => navigate('/my-channel')}>
                  <Tv className="w-6 h-6 md:w-4 md:h-4 mr-4 md:mr-2" /> 내 채널
                </DropdownMenuItem>
                <DropdownMenuItem className="py-4 md:py-2 text-lg md:text-sm" onClick={() => navigate('/create-channel')}>
                  <PlusCircle className="w-6 h-6 md:w-4 md:h-4 mr-4 md:mr-2" /> 채널 개설
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem className="py-4 md:py-2 text-lg md:text-sm" onClick={() => navigate('/admin')}>
                    <Shield className="w-6 h-6 md:w-4 md:h-4 mr-4 md:mr-2" /> 관리자
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="py-4 md:py-2 text-lg md:text-sm" onClick={signOut}>
                  <LogOut className="w-6 h-6 md:w-4 md:h-4 mr-4 md:mr-2" /> 로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/login">
              <Button variant="ghost" size="icon" className="w-12 h-12 md:w-9 md:h-9">
                <LogIn className="w-8 h-8 md:w-5 md:h-5" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Mobile search bar */}
      {searchOpen && (
        <form onSubmit={handleSearch} className="md:hidden px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="말씀, 교회, 설교자 검색..."
              className="pl-10 bg-muted border-none h-12 text-base"
              autoFocus
            />
          </div>
        </form>
      )}
    </header>
  );
};

export default Header;
