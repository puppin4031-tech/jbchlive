import { useQuery } from '@tanstack/react-query';
import { ImageOff } from 'lucide-react';
import { IMAGE_BUCKET, getSignedUrl } from '@/lib/communityMedia';

interface Props {
  path: string;
  alt?: string;
  className?: string;
}

/** Community images live in a private bucket, so URLs are signed on demand. */
const CommunityImage = ({ path, alt = '', className = '' }: Props) => {
  const { data: url, isLoading } = useQuery({
    queryKey: ['community-image', path],
    staleTime: 50 * 60_000,
    queryFn: () => getSignedUrl(IMAGE_BUCKET, path, 60 * 60),
  });

  if (isLoading) {
    return <div className={`bg-muted animate-pulse ${className}`} />;
  }
  if (!url) {
    return (
      <div className={`bg-muted flex items-center justify-center ${className}`}>
        <ImageOff className="w-6 h-6 text-muted-foreground" />
      </div>
    );
  }
  return <img src={url} alt={alt} loading="lazy" className={className} />;
};

export default CommunityImage;
