import defaultThumbnail from '@/assets/default-thumbnail.png';

interface GeneratedThumbnailProps {
  title: string;
  preacher?: string;
  category?: string;
}

/** Auto thumbnail: default background + sermon title + preacher underneath. */
const GeneratedThumbnail = ({ title, preacher, category }: GeneratedThumbnailProps) => (
  <div className="relative w-full h-full overflow-hidden [container-type:inline-size]">
    <img src={defaultThumbnail} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
    <div className="absolute inset-0 bg-foreground/55" />
    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-[3cqw] px-[7cqw] text-center text-background">
      {category && (
        <span className="rounded-full bg-background/20 px-[3cqw] py-[0.8cqw] text-[4cqw] font-semibold">{category}</span>
      )}
      <p className="line-clamp-3 break-keep text-[7.5cqw] font-bold leading-tight">{title}</p>
      {preacher && <p className="text-[5cqw] font-medium opacity-90">{preacher}</p>}
    </div>
  </div>
);

export default GeneratedThumbnail;
