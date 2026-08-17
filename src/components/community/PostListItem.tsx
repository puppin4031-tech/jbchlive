import { Link } from 'react-router-dom';
import { MessageCircle, Eye } from 'lucide-react';
import type { CommunityPost } from '@/hooks/useCommunity';

const PostListItem = ({ post }: { post: CommunityPost }) => (
  <Link
    to={`/community/${post.id}`}
    className="flex flex-col gap-1 py-4 md:py-3 border-b border-border last:border-0 hover:bg-muted/50 px-2 rounded-md transition-colors"
  >
    <div className="flex items-start gap-2">
      {post.tag && (
        <span className="shrink-0 text-base md:text-xs font-semibold text-primary">[{post.tag}]</span>
      )}
      <span className="text-lg md:text-sm font-medium text-foreground line-clamp-2">{post.title}</span>
    </div>
    <div className="flex items-center gap-4 text-base md:text-xs text-muted-foreground">
      <span>{post.authorName}</span>
      <span className="flex items-center gap-1">
        <Eye className="w-4 h-4 md:w-3.5 md:h-3.5" /> {post.view_count}
      </span>
      <span className="flex items-center gap-1">
        <MessageCircle className="w-4 h-4 md:w-3.5 md:h-3.5" /> {post.comment_count}
      </span>
    </div>
  </Link>
);

export default PostListItem;
