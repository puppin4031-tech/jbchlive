import Seo from '@/components/Seo';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Megaphone, ChevronRight, Flame, Loader2 } from 'lucide-react';
import Header from '@/components/Header';
import CategoryTabs from '@/components/CategoryTabs';
import PostCard from '@/components/community/PostCard';
import PostListItem from '@/components/community/PostListItem';
import FloatingWriteButton from '@/components/community/FloatingWriteButton';
import { Input } from '@/components/ui/input';
import { useCommunityCategories, useCommunityPosts } from '@/hooks/useCommunity';

const ALL = '전체';

const CommunityPage = () => {
  const [active, setActive] = useState(ALL);
  const [search, setSearch] = useState('');
  const { data: categories = [] } = useCommunityCategories();

  const tabs = useMemo(() => [ALL, ...categories.map((c) => c.name)], [categories]);
  const activeSlug = categories.find((c) => c.name === active)?.slug;
  const filtering = active !== ALL || !!search.trim();

  const { data: filtered = [], isLoading: filteredLoading } = useCommunityPosts({
    categorySlug: activeSlug,
    search,
    limit: 30,
    enabled: filtering,
  });

  const { data: notices = [] } = useCommunityPosts({ categorySlug: 'notice', limit: 3, enabled: !filtering });
  const { data: media = [] } = useCommunityPosts({ categorySlug: 'media', limit: 4, enabled: !filtering });
  const { data: files = [] } = useCommunityPosts({ categorySlug: 'files', limit: 2, enabled: !filtering });
  const { data: board = [] } = useCommunityPosts({ categorySlug: 'board', limit: 5, enabled: !filtering });
  const { data: hot = [] } = useCommunityPosts({
    categorySlug: 'talk',
    limit: 3,
    orderBy: 'view_count',
    enabled: !filtering,
  });

  const mediaFeed = [...media, ...files].slice(0, 6);

  const MoreLink = ({ slug, label }: { slug: string; label: string }) => (
    <Link
      to={`/community/category/${slug}`}
      className="flex items-center justify-end gap-1 text-base md:text-sm text-primary hover:underline pt-2"
    >
      {label} <ChevronRight className="w-4 h-4" />
    </Link>
  );

  return (
    <div className="min-h-screen bg-background pb-28">
      <Seo
        title="커뮤니티"
        description="공지사항, 미디어 나눔, 자유게시판 등 Live Word Mission 커뮤니티 공간입니다."
        path="/community"
      />
      <Header />

      <main className="container px-4 py-4 space-y-6">
        <h1 className="text-2xl md:text-xl font-bold text-foreground">커뮤니티</h1>

        <div className="sticky top-[4.5rem] md:top-14 z-30 bg-background/95 backdrop-blur py-2 -mx-4 px-4 space-y-3">
          <CategoryTabs categories={tabs} active={active} onSelect={setActive} />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 md:w-4 md:h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="커뮤니티 글 검색..."
              className="pl-10 h-12 md:h-9 text-lg md:text-sm bg-muted border-none"
            />
          </div>
        </div>

        {filtering ? (
          <section>
            {filteredLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto my-10" />
            ) : filtered.length === 0 ? (
              <p className="text-center text-lg md:text-sm text-muted-foreground py-10">
                게시글이 없습니다.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((p) => (
                  <PostListItem key={p.id} post={p} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* 공지 */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 text-lg md:text-sm font-semibold text-foreground mb-2">
                <Megaphone className="w-5 h-5 text-primary" /> 공지사항
              </h2>
              {notices.length === 0 ? (
                <p className="text-base md:text-sm text-muted-foreground">등록된 공지가 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {notices.map((n) => (
                    <li key={n.id}>
                      <Link
                        to={`/community/${n.id}`}
                        className="block text-lg md:text-sm text-foreground hover:text-primary line-clamp-1"
                      >
                        📢 {n.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <MoreLink slug="notice" label="공지사항 더보기" />
            </section>

            {/* 미디어나눔 / 자료실 */}
            <section>
              <h2 className="text-xl md:text-base font-semibold text-foreground mb-3">미디어나눔 · 자료실</h2>
              {mediaFeed.length === 0 ? (
                <p className="text-base md:text-sm text-muted-foreground">아직 공유된 자료가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mediaFeed.map((p) => (
                    <PostCard key={p.id} post={p} />
                  ))}
                </div>
              )}
              <MoreLink slug="media" label="미디어나눔 더보기" />
            </section>

            {/* 게시판 */}
            <section>
              <h2 className="text-xl md:text-base font-semibold text-foreground mb-1">게시판</h2>
              {board.length === 0 ? (
                <p className="text-base md:text-sm text-muted-foreground">첫 글을 남겨보세요.</p>
              ) : (
                <div className="divide-y divide-border">
                  {board.map((p) => (
                    <PostListItem key={p.id} post={p} />
                  ))}
                </div>
              )}
              <MoreLink slug="board" label="게시판 더보기" />
            </section>

            {/* 자유수다 인기글 */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 text-lg md:text-sm font-semibold text-foreground mb-2">
                <Flame className="w-5 h-5 text-live" /> 자유수다 인기글
              </h2>
              {hot.length === 0 ? (
                <p className="text-base md:text-sm text-muted-foreground">아직 인기글이 없습니다.</p>
              ) : (
                <ol className="space-y-2">
                  {hot.map((p, i) => (
                    <li key={p.id}>
                      <Link
                        to={`/community/${p.id}`}
                        className="block text-lg md:text-sm text-foreground hover:text-primary line-clamp-1"
                      >
                        🔥 {i + 1}위: {p.title}
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
              <MoreLink slug="talk" label="자유수다 더보기" />
            </section>
          </>
        )}
      </main>

      <FloatingWriteButton categorySlug={activeSlug} />
    </div>
  );
};

export default CommunityPage;
