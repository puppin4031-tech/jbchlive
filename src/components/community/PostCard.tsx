import { Link } from 'react-router-dom';
import { MessageCircle, Eye, Paperclip } from 'lucide-react';
import CommunityImage from './CommunityImage';
import type { CommunityPost } from '@/hooks/useCommunity';

const PostCard = ({ post }: { post: CommunityPost }) => {
  const cover = post.image_urls?.[0];

  return (
    <Link
      to={`/community/${post.id}`}
      className="block rounded-xl overflow-hidden border border-border bg-card hover:border-primary/50 transition-colors"
    >
      {cover ? (
        <CommunityImage path={cover} alt={post.title} className="w-full aspect-video object-cover" />
      ) : (
        <div className="w-full aspect-video bg-muted flex items-center justify-center">
          <Paperclip className="w-8 h-8 text-muted-foreground" />
        </div>
      )}
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm md:text-xs text-muted-foreground">
          <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
            {post.categoryName}
          </span>
          {post.tag && <span>#{post.tag}</span>}
        </div>
        <h3 className="text-lg md:text-base font-semibold text-foreground line-clamp-2">{post.title}</h3>
        <div className="flex items-center gap-4 text-base md:text-xs text-muted-foreground">
          <span>{post.authorName}</span>
          <span className="flex items-center gap-1">
            <MessageCircle className="w-4 h-4" /> {post.comment_count}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="w-4 h-4" /> {post.view_count}
          </span>
        </div>
      </div>
    </Link>
  );
};

export default PostCard;
