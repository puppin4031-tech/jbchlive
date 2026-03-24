import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Radio, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const Header = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

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
      <div className="container flex items-center justify-between h-14 px-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <Radio className="w-6 h-6 text-primary-foreground" />
          <span className="font-bold text-lg text-foreground">Live Word</span>
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

        <div className="flex items-center gap-2">
          {/* Mobile search toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </Button>
          <Link to="/live">
            <Button size="sm" className="bg-live text-live-foreground hover:bg-live/90 text-xs font-semibold px-3">
              <Radio className="w-3.5 h-3.5 mr-1" />
              LIVE
            </Button>
          </Link>
        </div>
      </div>

      {/* Mobile search bar */}
      {searchOpen && (
        <form onSubmit={handleSearch} className="md:hidden px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="말씀, 교회, 설교자 검색..."
              className="pl-9 bg-muted border-none"
              autoFocus
            />
          </div>
        </form>
      )}
    </header>
  );
};

export default Header;
