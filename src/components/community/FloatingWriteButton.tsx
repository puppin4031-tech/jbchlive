import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const FloatingWriteButton = ({ categorySlug }: { categorySlug?: string }) => {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <Link
      to={categorySlug ? `/community/write?category=${categorySlug}` : '/community/write'}
      aria-label="글쓰기"
      className="fixed right-5 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 w-16 h-16 md:w-14 md:h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
    >
      <Pencil className="w-7 h-7 md:w-6 md:h-6" />
    </Link>
  );
};

export default FloatingWriteButton;
