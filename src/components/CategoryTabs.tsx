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
          size="sm"
          variant={active === cat ? 'default' : 'outline'}
          className={`shrink-0 text-xs rounded-full ${active === cat ? 'bg-foreground text-background hover:bg-foreground/90' : ''}`}
          onClick={() => onSelect(cat)}
        >
          {cat}
        </Button>
      ))}
    </div>
  );
};

export default CategoryTabs;
