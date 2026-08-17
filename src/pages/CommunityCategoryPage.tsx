import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Header from '@/components/Header';
import PostCard from '@/components/community/PostCard';
import PostListItem from '@/components/community/PostListItem';
import FloatingWriteButton from '@/components/community/FloatingWriteButton';
import { Button } from '@/components/ui/button';
import { useCommunityCategories, useCommunityPosts } from '@/hooks/useCommunity';

const PAGE_SIZE = 20;

const CommunityCategoryPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState(1);
  const { data: categories = [] } = useCommunityCategories();
  const category = categories.find((c) => c.slug === slug);

  const { data: posts = [], isLoading } = useCommunityPosts({
    categorySlug: slug,
    limit: PAGE_SIZE * page,
  });

  const isGrid = slug === 'media' || slug === 'files';

  return (
    <div className="min-h-screen bg-background pb-28">
      <Header />
      <main className="container px-4 py-4 space-y-4">
        <Link to="/community" className="inline-flex items-center gap-2 text-lg md:text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5 md:w-4 md:h-4" /> 커뮤니티
        </Link>
        <h1 className="text-2xl md:text-xl font-bold text-foreground">
          {category?.icon} {category?.name || '게시판'}
        </h1>

        {isLoading ? (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto my-10" />
        ) : posts.length === 0 ? (
          <p className="text-center text-lg md:text-sm text-muted-foreground py-10">게시글이 없습니다.</p>
        ) : isGrid ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {posts.map((p) => (
              <PostListItem key={p.id} post={p} />
            ))}
          </div>
        )}

        {posts.length >= PAGE_SIZE * page && (
          <div className="flex justify-center pt-2">
            <Button variant="outline" className="h-12 md:h-9 text-lg md:text-sm" onClick={() => setPage((p) => p + 1)}>
              더 보기
            </Button>
          </div>
        )}
      </main>
      <FloatingWriteButton categorySlug={slug} />
    </div>
  );
};

export default CommunityCategoryPage;
