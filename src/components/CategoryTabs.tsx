import { Button } from '@/components/ui/button';

interface CategoryTabsProps {
  categories: string[];
  active: string;
  onSelect: (cat: string) => void;
}

const CategoryTabs = ({ categories, active, onSelect }: CategoryTabsProps) => {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {categories.map(cat => (
        <Button
          key={cat}
          variant={active === cat ? 'default' : 'outline'}
          className={`shrink-0 text-sm md:text-xs rounded-full h-9 md:h-8 px-4 md:px-3 ${active === cat ? 'bg-foreground text-background hover:bg-foreground/90' : ''}`}
          onClick={() => onSelect(cat)}
        >
          {cat}
        </Button>
      ))}
    </div>
  );
};

export default CategoryTabs;
