/** Типы для tiles-hero.js — поле плиток в хиро appbooster.com (WebGL2, без зависимостей). */

/** Кубическая Безье: x1, y1, x2, y2. */
export type CubicBezier = [number, number, number, number];

/** Кривая «вперёд»: подъём, разгорание. */
export const EASE_ENTER: CubicBezier;
/** Кривая «назад»: падение, угасание. */
export const EASE_EXIT: CubicBezier;

/** Фигуры, в которые собираются плитки без курсора. */
export const SHAPES: Record<'heart' | 'chevrons' | 'play', unknown>;

export interface TilesHeroSwell {
  /** Длина волны в шагах сетки. */
  length: number;
  /** Период, секунды. */
  period: number;
  /** Направление на земле, [x, z]. */
  dir: [number, number];
  weight: number;
}

export interface TilesHeroOptions {
  /** Шаг ромбов в CSS px как функция от размера хиро. */
  tilePx?: (width: number, height: number) => number;
  /** Потолок и пол плотности пикселей канваса. */
  maxDpr?: number;
  minDpr?: number;
  /** Подъём и падение плитки под курсором, мс. */
  riseMs?: number;
  fallMs?: number;
  /** Радиус наведения в шагах сетки. */
  hoverRadius?: number;
  /** Курсор без движения столько мс считается ушедшим. */
  cursorIdleMs?: number;
  /** Угол камеры над полем, градусы. */
  elevationDeg?: number;
  wave?: Partial<{
    enabled: boolean;
    mode: 'ocean' | 'spline';
    swell: number;
    swells: TilesHeroSwell[];
  }>;
  shapes?: Partial<{
    enabled: boolean;
    list: Array<'heart' | 'chevrons' | 'play'>;
    idleMs: number;
    holdMs: number;
    gapMs: number;
  }>;
  /** Цвет фона, 0–1. */
  background?: [number, number, number];
  /** Где слушать курсор. По умолчанию window. */
  pointerTarget?: EventTarget | null;
  /** Браузер вернул сброшенный WebGL: поле нужно снять destroy() и смонтировать заново. */
  onContextRestored?: (() => void) | null;
  /** Счётчик кадров в onStats. */
  debug?: boolean;
}

export interface TilesHeroStats {
  fps: number;
  dpr: number;
  /** Сколько плиток рисуется. */
  count: number;
  vertices: number;
  triangles: number;
  tilePx: number;
  reduceMotion: boolean;
}

export interface TilesHeroField {
  readonly canvas: HTMLCanvasElement;
  readonly stats: TilesHeroStats;
  /** Вызывается раз в секунду при debug: true. */
  onStats: ((stats: TilesHeroStats) => void) | null;
  /** Остановить цикл, снять слушатели, освободить WebGL и убрать канвас. */
  destroy(): void;
}

/** Монтирует поле в host (канвас на весь host). Нет WebGL2 — возвращает null, ничего не трогая. */
export function mountTilesHero(host: HTMLElement, options?: TilesHeroOptions): TilesHeroField | null;
