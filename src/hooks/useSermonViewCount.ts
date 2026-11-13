import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const VIEW_WINDOW_MS = 30 * 60 * 1000;

/** Counts one view per browser per sermon within a 30-minute window. */
export function useSermonViewCount(sermonId: string | undefined, initial: number | undefined) {
  const [count, setCount] = useState<number | undefined>(initial);

  useEffect(() => setCount(initial), [initial]);

  useEffect(() => {
    if (!sermonId) return;
    const key = `viewed_sermon_${sermonId}`;
    let last = 0;
    try { last = Number(localStorage.getItem(key) || 0); } catch { /* storage blocked */ }
    if (Date.now() - last < VIEW_WINDOW_MS) return;
    try { localStorage.setItem(key, String(Date.now())); } catch { /* storage blocked */ }

    const run = async () => {
      try {
        const { data, error } = await supabase.rpc('increment_sermon_view', { _sermon_id: sermonId });
        if (error) throw error;
        if (typeof data === 'number') setCount(data);
      } catch (err) {
        console.warn('view count failed', err);
      }
    };
    void run();
  }, [sermonId]);

  return count;
}
