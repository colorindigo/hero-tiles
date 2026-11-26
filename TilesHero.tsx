'use client';
/*
 * Обвязка для сайта на Next.js: ставится в `.hero__scene` вместо <video>.
 * Видео остаётся запасным вариантом: если WebGL2 нет, поле не монтируется и играет ролик.
 *
 *   <div className="hero__scene"><TilesHero fallbackSrc="/assets/main/home/hero/1.mp4" /></div>
 */
import { useEffect, useRef, useState } from 'react';
import { mountTilesHero } from './tiles-hero.js';

export default function TilesHero({ fallbackSrc }: { fallbackSrc?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // курсор слушаем на всём хиро: текст и кнопка лежат поверх канваса
    const field = mountTilesHero(el, { pointerTarget: el.closest('header.hero') ?? window });
    if (!field) setFallback(true);
    return () => field?.destroy();
  }, []);

  return (
    <div ref={host} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} aria-hidden="true">
      {fallback && fallbackSrc ? (
        <video src={fallbackSrc} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : null}
    </div>
  );
}
