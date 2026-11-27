/*
 * Appbooster — интерактивное поле плиток для хиро.
 * Перенос сцены Spline «App_old» на чистый WebGL2: одна геометрия плитки,
 * инстансинг, материал слой в слой со Spline (см. spline-source.md).
 *
 *   import { mountTilesHero } from './tiles-hero.js';
 *   const field = mountTilesHero(document.querySelector('.hero__scene'));
 *   // field.destroy();
 *
 * Без зависимостей. Нет WebGL2 → возвращает null, и хиро остаётся как было.
 */

/* ---------- Кривые владельца (правило 45) ---------- */
export const EASE_ENTER = [0.72, 0, 0, 1]; // вперёд: подъём, разгорание, гребень волны
export const EASE_EXIT = [1, 0, 0.28, 1];  // назад: падение, угасание, возврат волны

/* ---------- Значения, снятые со Spline (единицы Spline) ---------- */
const SPLINE = {
  tile: { size: 1034, radius: 280, depth: 128, bevel: 15 },
  pitch: 1137.5,
  elevationDeg: 47.6,    // камера превью Spline — Camera_out
  azimuthDeg: 45,
  cameraDistance: 3830,  // от Camera_out до поля: от этой точки слои считают взгляд
  icon: {
    baseY: -216.11,      // мировой низ иконки: группа клонов стоит на −216.11
    liftY: 322,
    rest: {
      originY: 206, near: -410.8587, far: 224.2288,
      steps: [0.5039, 0.6305, 0.7558, 0.8691, 1],
      colors: [[0, 0, 0], [0.3301, 0.11, 0.11], [1, 0.4272, 0.4272], [1, 0.6893, 0.6893], [1, 0.8608, 0.8608]],
    },
    hover: {
      originY: -104, near: 54.8256, far: 336.2262,
      steps: [0.2477, 0.5085, 0.8097, 0.9789, 1],
      colors: [[0, 0, 0], [0.4256, 0, 0], [1, 0.3786, 0.3786], [1, 0.6893, 0.6893], [1, 0.8447, 0.8447]],
    },
  },
  socket: {
    baseY: -245.34,      // мировой низ гнезда
    liftY: 17,
    // В покое верх гнезда горит красным, но спрятан внутри иконки: его открывает волна, когда иконка проседает.
    rest: {
      originY: -252, near: -410.8587, far: 224.2288,
      steps: [0.6893, 0.7831, 0.8943, 1, 1],
      colors: [[0, 0, 0], [0.3301, 0.11, 0.11], [1, 0.4272, 0.4272], [1, 0.6893, 0.6893], [1, 0.6893, 0.6893]],
    },
    // В наведении гнездо уходит в чёрный — под поднятой иконкой видна тёмная лунка.
    hover: {
      originY: -492, near: 54.8256, far: 336.2262,
      steps: [0.1972, 0.5211, 0.715, 0.9999, 1],
      colors: [[0, 0, 0], [0.2824, 0.0941, 0.0941], [0.3301, 0.11, 0.11], [0, 0, 0], [0, 0, 0]],
    },
  },
  // Матовая основа (color + toon 8 %), уровни 0..255 сняты со скрина владельца 26.11.2026
  // (плитка 232 px по ширине). Блик фаски: верх + bevelGain · (к камере)^bevelPow + bevelSide · вправо.
  matte: { top: 11.5, wallLeft: 10, wallFront: 19.5, sideDropLeft: 4.5, sideDropRight: 14,
    bevelGain: 41.5, bevelPow: 2.84, bevelSide: 6 },
  // factor работает как множитель: так кромки сходятся с замером рендера Spline (#14–#21 на чёрном)
  fresnel: { color: 0.4903, bias: -0.03, scale: 0.76, intensity: 5.74, factor: 0.12 },
};

const DEFAULTS = {
  // Шаг ромбов по горизонтали, CSS px. Функция от ширины хоста.
  // Шаг ромбов, CSS px. Ноутбук и шире — ширина / 11 (1440 → 130, потолок 130), планшет 768 — 72.
  // Телефон (480 и уже) — ширина / 2.75, не больше 144: 390 → 142, 360 → 131; крайние ромбы уходят за край экрана.
  // Между 480 и 768 — плавный переход, скачков при изменении ширины нет.
  // Владелец, 27.11.2026: «для мобилки прям сильно крупнее плитки должны быть» (35 → 71 px на 390),
  // затем «увеличить размер плиток где-то в 2 [раза], чтоб ушли за экран по ширине» (71 → 142).
  tilePx: (w) => {
    const desk = Math.min(130, Math.max(w / 11, Math.min(w / 5.5, 72)));
    const phone = Math.min(w / 2.75, 144);
    const t = Math.min(1, Math.max(0, (w - 480) / (768 - 480)));
    return phone + (desk - phone) * t;
  },
  maxDpr: 2,
  minDpr: 1,
  riseMs: 500,
  fallMs: 1000,
  hoverRadius: 0.55,     // в шагах сетки, от центра плитки
  // Курсор, который стоит без движения столько, считается ушедшим: плитка под ним опускается, начинаются образы.
  // Владелец, 26.11.2026: «после времени курсор не становится неактивным под плиткой, всё так висит».
  cursorIdleMs: 5000,
  // Угол камеры над полем. В сцене Camera_out — 47.6°; владелец выбрал вид со своего скрина (26.11.2026).
  elevationDeg: 45,
  wave: {
    enabled: true,
    // 'ocean'  — зыбь: всё поле плавно качается вверх-вниз, как на волне океана; плитка с гнездом
    //            качаются вместе, цвет не меняется. Под курсором подъём наведения важнее волны.
    // 'spline' — как в сцене Spline: иконка проседает на 364 и открывает красное гнездо.
    mode: 'ocean',
    // ocean: высота качания в единицах Spline (±). Цвет считается от положения покоя,
    // поэтому плитка остаётся чёрной при любом размахе; подъём наведения — 322.
    swell: 220,
    // ocean: слагаемые зыби — длина волны в шагах сетки, период в секундах, направление на земле, вес.
    // По умолчанию одна волна вдоль мировой X, как брусок волны в Spline: гребень идёт рядом плиток,
    // параллельным оси Z, размах у всех плиток один. Решение владельца, 26.11.2026.
    // Длина 16 шагов: перепад между соседними рядами ≤ 86 единиц (у толщины плитки 128), поэтому щели
    // под поднятым рядом почти не раскрываются — самая большая чёрная дыра 31 px против 26 в покое и 36 при длине 8.
    swells: [
      { length: 16, period: 3.4, dir: [-1, 0], weight: 1 },
    ],
    // spline: просадка иконки и прохождение фронта
    amplitude: -364,
    upMs: 2000,          // к гребню, кривая «вперёд»
    downMs: 2000,        // возврат, кривая «назад»
    speed: 1,            // шагов сетки в секунду
    spacing: 14,         // шагов сетки между волнами
    direction: [-1, 0],  // по мировой X: на экране — из левого верхнего угла в правый нижний
  },
  // Образы без наведения: плитки собираются в фигуру, проявляются волной от центра и растворяются вразнобой.
  // Плитка образа приподнята и обведена белым контуром по краю верха, сама остаётся чёрной: владелец сначала
  // попросил серый вместо белого, затем — «не серый, а белый контур у иконок» (26.11.2026).
  shapes: {
    enabled: true,
    list: ['heart', 'chevrons', 'play'],   // ▶ — сторы и видеореклама, тема сайта; смайл владелец снял
    size: 6,              // ширина фигуры в шагах ромбов (не больше 95 % ширины и 90 % высоты хиро)
    lift: 200,            // подъём плиток образа, единиц Spline (наведение — 322)
    outlinePx: 2.4,       // ширина контура от края плитки внутрь, CSS px — одинаковая на любом размере плитки
    outlineColor: 0x80,   // белый, приглушённый вдвое по просьбе владельца (26.11.2026: «бордер приглушить раза в 2»)
    idleMs: 1200,         // курсор ушёл — через столько начинается образ
    inMs: 500, spreadInMs: 700,      // подъём плитки и разброс по времени: волной от центра фигуры
    holdMs: 1800,
    outMs: 1000, spreadOutMs: 900,   // падение плитки и разброс: вразнобой
    gapMs: 1400,          // пауза между образами
  },
  background: [0, 0, 0],
  pointerTarget: null,   // элемент, на котором слушать курсор; по умолчанию window
  debug: false,
};

/* ---------- Кубическая Безье → таблица ---------- */
function makeEase([x1, y1, x2, y2], n = 1024) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s) => ((ax * s + bx) * s + cx) * s;
  const Y = (s) => ((ay * s + by) * s + cy) * s;
  const lut = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const x = i / n; let lo = 0, hi = 1;
    for (let k = 0; k < 28; k++) { const m = (lo + hi) / 2; if (X(m) < x) lo = m; else hi = m; }
    lut[i] = Y((lo + hi) / 2);
  }
  return (p) => {
    if (p <= 0) return 0; if (p >= 1) return 1;
    const f = p * n, i = f | 0; return lut[i] + (lut[i + 1] - lut[i]) * (f - i);
  };
}

/* ---------- Образы ---------- */
// Фигуры нарисованы в клетках решётки ромбов: ix — полшага ромба вправо, iy — ряд вниз, ix + iy чётно.
// Линии идут там, где плитки смыкаются углами: по диагонали, по вертикали (через ряд) и по горизонтали (через полшага),
// поэтому штрих в одну плитку выходит сплошным. Залитые фигуры читались сеткой контуров, а не знаком.
const art = (rows) => {
  const set = new Set(rows.map(([x, y]) => x + ',' + y));
  const w = Math.max(...rows.map(([x]) => Math.abs(x))) + 1;   // ширина в шагах ромбов
  const ys = rows.map(([, y]) => y);
  return Object.assign((u, v, ix, iy) => set.has(ix + ',' + iy),
    { minTiles: w, maxX: w - 1, minY: Math.min(...ys), maxY: Math.max(...ys) });
};
const mirror = (half) => half.concat(half.filter(([x]) => x !== 0).map(([x, y]) => [-x, y]));
export const SHAPES = {
  // сердце контуром: острие внизу, две половинки, выемка по центру
  heart: art(mirror([[0, 4], [1, 3], [2, 2], [3, 1], [4, 0], [5, -1], [5, -3], [4, -4], [3, -5], [1, -5], [0, -4]])),
  // двойной шеврон вверх: две галочки ^ в одну плитку толщиной, без утолщений на концах и в вершине
  chevrons: art(mirror([[0, -4], [1, -3], [2, -2], [3, -1], [4, 0], [0, 0], [1, 1], [2, 2], [3, 3], [4, 4]])),
  // ▶ — плей: Google Play, сторы, видеореклама
  play: art([[-2, -6], [-2, -4], [-2, -2], [-2, 0], [-2, 2], [-2, 4], [-2, 6],
    [-1, -5], [0, -4], [1, -3], [2, -2], [3, -1], [4, 0], [3, 1], [2, 2], [1, 3], [0, 4], [-1, 5]]),
};
// Малые версии для узких экранов (телефон, плитка ~70 px): ширина 3–4 шага ромба вместо 5–6
SHAPES.heart.small = art(mirror([[0, 4], [1, 3], [2, 2], [3, 1], [3, -1], [2, -2], [1, -3], [0, -2]]));
SHAPES.chevrons.small = art(mirror([[0, -4], [1, -3], [2, -2], [3, -1], [0, 0], [1, 1], [2, 2], [3, 3]]));
SHAPES.play.small = art([[-2, -4], [-2, -2], [-2, 0], [-2, 2], [-2, 4],
  [-1, -3], [0, -2], [1, -1], [2, 0], [1, 1], [0, 2], [-1, 3]]);
// Самые малые — для телефона с плиткой ~140 px, где в ширину помещается меньше трёх ромбов: 5 полшагов в ширину,
// крайние ромбы могут уйти за край экрана не больше чем на четверть. У плея малая версия уже такой ширины.
SHAPES.heart.tiny = art(mirror([[0, 2], [1, 1], [2, 0], [1, -1], [0, 0]]));
SHAPES.chevrons.tiny = art(mirror([[0, -2], [1, -1], [2, 0], [0, 2], [1, 3], [2, 4]]));
SHAPES.play.tiny = SHAPES.play.small;

/* ---------- Геометрия плитки: скруглённый квадрат, стенка + фаска + крышка ---------- */
function buildTile({ size, radius, depth, bevel }, cornerSeg = 10, bevelSeg = 5) {
  const h = size / 2, c = h - radius;
  const ox = [], oz = [], nx = [], nz = [];
  const centers = [[c, c], [-c, c], [-c, -c], [c, -c]];
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i <= cornerSeg; i++) {
      const a = (k * 90 + (90 * i) / cornerSeg) * Math.PI / 180;
      const ca = Math.cos(a), sa = Math.sin(a);
      ox.push(centers[k][0] + radius * ca); oz.push(centers[k][1] + radius * sa);
      nx.push(ca); nz.push(sa);
    }
  }
  const N = ox.length;
  // Профиль: [inset, y, угол нормали от горизонта]
  const prof = [[0, 0, 0], [0, depth - bevel, 0]];
  for (let k = 1; k <= bevelSeg; k++) {
    const p = (Math.PI / 2) * (k / bevelSeg);
    prof.push([bevel * (1 - Math.cos(p)), depth - bevel + bevel * Math.sin(p), p]);
  }
  const pos = [], nrm = [], idx = [];
  for (const [inset, y, th] of prof) {
    const ch = Math.cos(th), sh = Math.sin(th);
    for (let i = 0; i < N; i++) {
      pos.push(ox[i] - nx[i] * inset, y, oz[i] - nz[i] * inset);
      nrm.push(nx[i] * ch, sh, nz[i] * ch);
    }
  }
  for (let r = 0; r < prof.length - 1; r++) {
    for (let i = 0; i < N; i++) {
      const a = r * N + i, b = r * N + ((i + 1) % N), cc = (r + 1) * N + i, d = (r + 1) * N + ((i + 1) % N);
      idx.push(a, cc, b, b, cc, d);
    }
  }
  // Крышка: центр + последнее кольцо (у него нормаль уже вверх)
  const center = pos.length / 3;
  pos.push(0, depth, 0); nrm.push(0, 1, 0);
  const top = (prof.length - 1) * N;
  for (let i = 0; i < N; i++) idx.push(center, top + ((i + 1) % N), top + i);
  return {
    positions: new Float32Array(pos), normals: new Float32Array(nrm),
    indices: new Uint16Array(idx), vertexCount: pos.length / 3,
  };
}

/* ---------- Шейдеры ---------- */
const VERT = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec2 aOffset;
layout(location=3) in vec3 aDyn;      // x — подъём наведения 0..1, y — волна, z — образ 0..1
uniform mat4 uViewProj;
uniform vec4 uY;                      // base, lift, wave, насколько наведение гасит волну (0..1)
uniform float uWaveTint;              // 1 — волна меняет цвет (spline), 0 — только двигает (ocean)
uniform vec4 uShape;                  // подъём образа, ширина контура от края, яркость контура, 1 — иконки / 0 — гнёзда
// centroid: на скосе, который стоит почти ребром к камере, треугольники вырождаются, и без него сглаживание
// берёт значения за краем треугольника — на вершине силуэта вылезал одиночный красный пиксель.
centroid out float vColorY;           // высота, по которой красит слой depth
centroid out vec3 vWorld;
centroid out vec3 vNrm;
out float vLift;
out float vShape;                     // сила образа на плитке 0..1 (уже за вычетом наведения)
centroid out vec2 vLocal;             // точка в плоскости плитки: по ней считается контур
centroid out float vH;                         // высота точки внутри плитки, 0 — низ, 1 — верх
void main() {
  vH = aPos.y / 128.0;
  float hov = aDyn.x;
  float shp = aDyn.z * (1.0 - hov) * uShape.w;          // наведение важнее образа
  float waveY = (1.0 - hov * uY.w) * aDyn.y * uY.z;
  float y = uY.x + hov * uY.y + shp * uShape.x + waveY;
  vec3 w = vec3(aPos.x + aOffset.x, aPos.y + y, aPos.z + aOffset.y);
  vWorld = w;
  // подъём образа не красит плитку: свечение по высоте — только у наведения
  vColorY = w.y - waveY * (1.0 - uWaveTint) - shp * uShape.x;
  vNrm = aNrm;
  vLift = hov;
  vShape = shp;
  vLocal = aPos.xz;
  gl_Position = uViewProj * vec4(w, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
centroid in vec3 vWorld;
centroid in vec3 vNrm;
in float vLift;
in float vShape;
centroid in vec2 vLocal;
centroid in float vH;
centroid in float vColorY;
uniform vec3 uCamPos;                 // камера Spline: слои считают взгляд от её точки
uniform vec3 uCamH;                   // горизонталь к камере
uniform vec3 uCamR;                   // горизонталь вправо по экрану
uniform vec4 uMatte;                  // верх, стенка слева, стенка к камере и справа, спад стенки у правого угла
uniform vec4 uBevel;                  // блик фаски: сила, степень спада от ближнего угла, перекос вправо; спад у левого угла
uniform vec3 uC0[5];                  // depth: цвета покоя
uniform vec3 uC1[5];                  // depth: цвета наведения
uniform float uS0[5];
uniform float uS1[5];
uniform vec4 uNF;                     // near0, far0, near1, far1
uniform vec2 uOrigin;                 // originY покоя, наведения
uniform vec4 uFres;                  // цвет, bias, scale, intensity
uniform vec4 uShape;                  // подъём образа, ширина контура от края, яркость контура, —
uniform vec2 uTile;                   // половина стороны плитки без скругления, радиус скругления
out vec4 outColor;

vec3 screenB(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }

void main() {
  vec3 N = normalize(vNrm);
  float L = clamp(vLift, 0.0, 1.0);
  vec3 c = vec3(0.0);                                   // color: чёрный

  // Матовая основа: color + toon 8 % Spline. Уровни сняты со скрина владельца 26.11.2026 (плитка 232 px):
  // верх #0b; стенка слева #0a, к камере и справа #13; на фаске узкий блик — #35 на ближнем к камере
  // углу, к боковым углам гаснет до цвета верха; зазор #00.
  float up = clamp(N.y, 0.0, 1.0);
  vec2 nh = N.xz;
  float nl = length(nh);
  vec2 hd = nl > 1e-4 ? nh / nl : vec2(0.0);
  float s = max(dot(hd, uCamH.xz), 0.0);               // к камере по горизонтали: 1 — ближний угол
  float r = dot(hd, uCamR.xz);                           // вправо по экрану: −1 … 1
  // к боковым углам стенка темнеет: там её добирает fresnel, а на скрине она #0a–#0c
  float side = clamp((abs(r) - 0.7) / 0.23, 0.0, 1.0) * (r > 0.0 ? uMatte.w : uBevel.w);
  float wall = mix(uMatte.y, uMatte.z, smoothstep(-0.5, 0.0, r)) - side;
  float bev = uMatte.x + uBevel.x * pow(s, uBevel.y) + uBevel.z * r * s;
  float wallW = 1.0 - smoothstep(0.0, 0.25, up);
  float topW = smoothstep(0.8, 0.99, up);
  float bevW = max(1.0 - wallW - topW, 0.0);
  c = vec3(wallW * wall + bevW * bev + topW * uMatte.x);

  // depth, screen: линейный градиент по мировой Y; все числа тянутся от покоя к наведению вместе с подъёмом
  float oy = mix(uOrigin.x, uOrigin.y, L);
  float nr = mix(uNF.x, uNF.z, L);
  float fr = mix(uNF.y, uNF.w, L);
  float t = clamp((vColorY - oy - nr) / (fr - nr), 0.0, 1.0);
  vec3 g = mix(uC0[0], uC1[0], L);
  float prev = mix(uS0[0], uS1[0], L);
  for (int i = 1; i < 5; i++) {
    float s = mix(uS0[i], uS1[i], L);
    vec3 col = mix(uC0[i], uC1[i], L);
    g = mix(g, col, clamp((t - prev) / max(s - prev, 1e-5), 0.0, 1.0));
    prev = s;
  }
  c = screenB(c, g);

  // fresnel, screen: светлый край там, где поверхность уходит от взгляда
  vec3 V = normalize(uCamPos - vWorld);
  float f = clamp(uFres.y + uFres.z * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uFres.w), 0.0, 1.0);
  c = screenB(c, vec3(uFres.x * f));

  // образ: белый контур по краю верха плитки — на скосе и полосой на крышке
  if (vShape > 0.0) {
    vec2 q = abs(vLocal) - vec2(uTile.x);
    float d = -(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uTile.y);   // от края внутрь, единиц
    float aa = fwidth(d);
    float band = 1.0 - smoothstep(uShape.y - aa, uShape.y + aa, d);
    float onTop = smoothstep(0.15, 0.5, N.y);
    c = mix(c, vec3(uShape.z), clamp(vShape * band * onTop, 0.0, 1.0));
  }

  outColor = vec4(c, 1.0);
}`;

/* ---------- Матрицы ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
function mul4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

/* ---------- Монтирование ---------- */
export function mountTilesHero(host, userOpts = {}) {
  const o = { ...DEFAULTS, ...userOpts, wave: { ...DEFAULTS.wave, ...(userOpts.wave || {}) },
    shapes: { ...DEFAULTS.shapes, ...(userOpts.shapes || {}) } };
  const canvas = document.createElement('canvas');
  canvas.className = 'tiles-hero__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  const gl = canvas.getContext('webgl2', {
    antialias: true, alpha: false, depth: true, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
  });
  if (!gl) return null;
  host.appendChild(canvas);

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const easeIn = makeEase(EASE_ENTER);
  const easeOut = makeEase(EASE_EXIT);

  /* программа */
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const U = {};
  for (const n of ['uViewProj', 'uY', 'uWaveTint', 'uCamPos', 'uCamH', 'uCamR', 'uMatte', 'uBevel', 'uC0', 'uC1', 'uS0', 'uS1',
    'uNF', 'uOrigin', 'uFres', 'uShape', 'uTile']) U[n] = gl.getUniformLocation(prog, n);

  /* геометрия */
  const geo = buildTile(SPLINE.tile);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const mkBuf = (data, loc, size, target = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) => {
    const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, usage);
    if (loc != null) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); }
    return b;
  };
  mkBuf(geo.positions, 0, 3);
  mkBuf(geo.normals, 1, 3);
  mkBuf(geo.indices, null, 0, gl.ELEMENT_ARRAY_BUFFER);
  const offBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, offBuf);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(2, 1);
  const dynBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(3, 1);
  gl.bindVertexArray(null);

  /* материал: постоянная часть */
  gl.useProgram(prog);
  const F = SPLINE.fresnel;
  gl.uniform4f(U.uFres, F.color * F.factor, F.bias, F.scale, F.intensity);
  const setDepth = (a, b) => {
    gl.uniform3fv(U.uC0, a.colors.flat()); gl.uniform3fv(U.uC1, b.colors.flat());
    gl.uniform1fv(U.uS0, a.steps); gl.uniform1fv(U.uS1, b.steps);
    gl.uniform4f(U.uNF, a.near, a.far, b.near, b.far);
    gl.uniform2f(U.uOrigin, a.originY, b.originY);
  };

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(o.background[0], o.background[1], o.background[2], 1);

  /* камера */
  const el = o.elevationDeg * Math.PI / 180, az = SPLINE.azimuthDeg * Math.PI / 180;
  const toCam = norm([-Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)]);
  const target = [0, -150, 0];
  const eye = [target[0] + toCam[0] * 30000, target[1] + toCam[1] * 30000, target[2] + toCam[2] * 30000];
  const zA = toCam, xA = norm(cross([0, 1, 0], zA)), yA = cross(zA, xA);
  const view = new Float32Array([
    xA[0], yA[0], zA[0], 0, xA[1], yA[1], zA[1], 0, xA[2], yA[2], zA[2], 0,
    -dot(xA, eye), -dot(yA, eye), -dot(zA, eye), 1,
  ]);
  // Камера превью Spline стоит в 3830 от поля; от этой точки слои считают взгляд (fresnel).
  const cd = SPLINE.cameraDistance;
  const camSpline = [target[0] + toCam[0] * cd, target[1] + toCam[1] * cd, target[2] + toCam[2] * cd];
  gl.uniform3f(U.uCamPos, ...camSpline);
  const hz = norm([toCam[0], 0, toCam[2]]);
  gl.uniform3f(U.uCamH, hz[0], 0, hz[2]);
  gl.uniform3f(U.uCamR, xA[0], 0, xA[2]);
  gl.uniform2f(U.uTile, SPLINE.tile.size / 2 - SPLINE.tile.radius, SPLINE.tile.radius);
  const M = SPLINE.matte;
  gl.uniform4f(U.uMatte, M.top / 255, M.wallLeft / 255, M.wallFront / 255, M.sideDropRight / 255);
  gl.uniform4f(U.uBevel, M.bevelGain / 255, M.bevelPow, M.bevelSide / 255, M.sideDropLeft / 255);

  let worldPerPx = 1;
  let W = 1, H = 1, dpr = Math.min(o.maxDpr, window.devicePixelRatio || 1), halfW = 1, halfH = 1, viewProj = null;
  let count = 0, offsets = null, dyn = null;
  let liftV, liftFrom, phase, tStart;   // состояние наведения на плитку
  let shapeV, shapeFrom, shapeDelay, shapeMember;   // образ: сила на плитке, с чего падает, задержка, входит ли
  const shape = { phase: 0, t: 0, k: -1, lastActive: 0, first: true };   // 0 пауза, 1 проявление, 2 держим, 3 растворение

  const P = SPLINE.pitch;
  const toScreen = (p) => { const d = sub(p, eye); return [dot(d, xA) / halfW, dot(d, yA) / halfH]; };
  const toGround = (ndcX, ndcY, y) => {
    const p = [eye[0] + xA[0] * ndcX * halfW + yA[0] * ndcY * halfH,
      eye[1] + xA[1] * ndcX * halfW + yA[1] * ndcY * halfH,
      eye[2] + xA[2] * ndcX * halfW + yA[2] * ndcY * halfH];
    const s = (p[1] - y) / zA[1];
    return [p[0] - zA[0] * s, p[2] - zA[2] * s];
  };

  // Плотность пикселей меняет только размер канваса: поле и состояние плиток не трогаем
  function resizeCanvas() {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function layout() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    resizeCanvas();
    worldPerPx = (P * Math.SQRT2) / o.tilePx(W, H);
    halfW = (W / 2) * worldPerPx; halfH = (H / 2) * worldPerPx;
    const proj = new Float32Array([
      1 / halfW, 0, 0, 0, 0, 1 / halfH, 0, 0, 0, 0, -2 / 60000, 0, 0, 0, -1, 1,
    ]);
    // ortho: near 0 / far 60000 вдоль −Z камеры
    proj[14] = -(60000 + 0) / 60000;
    viewProj = mul4(proj, view);

    // какие ячейки видны: углы экрана на плоскостях низа и верхнего подъёма
    const pts = [];
    for (const [nx_, ny_] of [[-1.2, -1.4], [1.2, -1.4], [1.2, 1.2], [-1.2, 1.2]]) {
      pts.push(toGround(nx_, ny_, -620), toGround(nx_, ny_, 240));
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const list = [];
    for (let i = Math.floor(minX / P) - 1; i <= Math.ceil(maxX / P) + 1; i++) {
      for (let j = Math.floor(minZ / P) - 1; j <= Math.ceil(maxZ / P) + 1; j++) {
        const x = i * P, z = j * P;
        const a = toScreen([x, -600, z]), b = toScreen([x, 240, z]);
        const mx = (P / halfW) * 1.0, my = (P / halfH) * 1.0;
        const inX = Math.max(a[0], b[0]) > -1 - mx && Math.min(a[0], b[0]) < 1 + mx;
        const inY = Math.max(a[1], b[1]) > -1 - my && Math.min(a[1], b[1]) < 1 + my;
        if (inX && inY) list.push(x, z);
      }
    }
    // Состояние наведения переносим по месту в сетке: смена высоты хиро (на телефоне — уход
    // адресной строки) не должна сбрасывать поднятые плитки рывком
    const prev = new Map();
    const key = (x, z) => Math.round(x / P) + ',' + Math.round(z / P);
    for (let i = 0; i < count; i++) {
      if (phase[i] !== 0) prev.set(key(offsets[i * 2], offsets[i * 2 + 1]), [liftV[i], liftFrom[i], phase[i], tStart[i]]);
    }
    count = list.length / 2;
    offsets = new Float32Array(list);
    dyn = new Float32Array(count * 3);
    shapeV = new Float32Array(count); shapeFrom = new Float32Array(count);
    shapeDelay = new Float32Array(count); shapeMember = new Uint8Array(count);
    if (shape.phase !== 0) { shape.phase = 0; shape.t = performance.now(); }   // раскладка сменилась — образ заново
    liftV = new Float32Array(count); liftFrom = new Float32Array(count);
    phase = new Uint8Array(count); tStart = new Float64Array(count);
    if (prev.size) {
      for (let i = 0; i < count; i++) {
        const s = prev.get(key(offsets[i * 2], offsets[i * 2 + 1]));
        if (s) { liftV[i] = s[0]; liftFrom[i] = s[1]; phase[i] = s[2]; tStart[i] = s[3]; }
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, offBuf); gl.bufferData(gl.ARRAY_BUFFER, offsets, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferData(gl.ARRAY_BUFFER, dyn, gl.DYNAMIC_DRAW);
  }

  /* курсор */
  let pointer = null;   // [x, z] на плоскости верха плиток или null
  let pointerT = 0;     // когда курсор двигался в последний раз (часы цикла)
  const pointerEl = o.pointerTarget || window;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (px < 0 || py < 0 || px > r.width || py > r.height) { pointer = null; return; }
    pointer = toGround((px / r.width) * 2 - 1, 1 - (py / r.height) * 2, SPLINE.icon.baseY + SPLINE.tile.depth);
    pointerT = frozen ?? performance.now();
  };
  // Палец поднят — источника больше нет: плитка доходит до верха и падает
  const onUp = (e) => { if (e.pointerType !== 'mouse') pointer = null; };
  const onOut = (e) => { if (!e.relatedTarget) pointer = null; };
  const onBlur = () => { pointer = null; };
  pointerEl.addEventListener('pointermove', onMove, { passive: true });
  pointerEl.addEventListener('pointerdown', onMove, { passive: true });
  pointerEl.addEventListener('pointerup', onUp, { passive: true });
  pointerEl.addEventListener('pointercancel', onUp, { passive: true });
  document.addEventListener('pointerout', onOut);
  window.addEventListener('blur', onBlur);

  /* цикл */
  const t0 = performance.now();
  shape.lastActive = shape.t = t0;
  let frozen = null;   // отладка: остановленные часы для снимков
  let raf = 0, running = false, last = t0, frames = 0, acc = 0, fps = 0, slow = 0;
  const R2 = (o.hoverRadius * P) ** 2;
  const wv = o.wave, waveOn = wv.enabled && !reduceMotion, ocean = wv.mode !== 'spline';
  const socketsOn = waveOn && !ocean;
  // зыбь: волновой вектор (рад/ед.) и угловая частота (рад/мс) каждого слагаемого
  const swellK = (wv.swells || []).map((s) => {
    const l = Math.hypot(s.dir[0], s.dir[1]), k = (2 * Math.PI) / (s.length * P);
    return { kx: (s.dir[0] / l) * k, kz: (s.dir[1] / l) * k, w: (2 * Math.PI) / (s.period * 1000), a: s.weight };
  });
  const swellNorm = swellK.reduce((s, c) => s + c.a, 0) || 1;
  const wDir = (() => { const l = Math.hypot(wv.direction[0], wv.direction[1]); return [wv.direction[0] / l, wv.direction[1] / l]; })();
  const wSpacing = wv.spacing * P, wSpeed = wv.speed * P / 1000;   // единиц в мс

  // луч курсора: на сколько уезжает точка на земле, если плитка выше покоя на 1 единицу
  const rayK = [zA[0] / zA[1], zA[2] / zA[1]];

  // волна в точке (x, z) в момент now: −1…1 (ocean) или 0…1 (spline)
  function waveAt(x, z, now) {
    let w = 0;
    if (waveOn && ocean) {
      // сумма бегущих синусоид: непрерывное колебание поля, а не переход, поэтому без кривых пары
      const tt = now - t0;
      for (let k = 0; k < swellK.length; k++) {
        const c = swellK[k];
        w += c.a * Math.sin(c.kx * x + c.kz * z - c.w * tt + k * 1.7);
      }
      w /= swellNorm;
    } else if (waveOn) {
      const d = x * wDir[0] + z * wDir[1];
      const span = wSpacing;
      const front = (now - t0) * wSpeed;
      let tau = ((front - d) % span + span) % span / wSpeed;   // мс с прихода гребня
      if (tau < wv.upMs) w = easeIn(tau / wv.upMs);
      else if (tau < wv.upMs + wv.downMs) w = 1 - easeOut((tau - wv.upMs) / wv.downMs);
    }
    return w;
  }

  /* образы: плитки собираются в фигуру, когда курсора на поле нет (правило 38 — источник эффекта: отсутствие курсора) */
  // «Уменьшение движения»: волны нет, плитки образа не поднимаются — образ только проявляется контуром и гаснет
  const sh = o.shapes, shapesOn = sh.enabled && sh.list.length > 0;
  let seed = 0x2f6b1;   // свой генератор: одинаковые прогоны дают одинаковые кадры
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const topRest = SPLINE.icon.baseY + SPLINE.tile.depth;
  function startShape(now) {
    const tile = o.tilePx(W, H);
    const size = Math.min(sh.size * tile, 0.95 * W - tile, 0.95 * H - tile / 2), R = size / 2;
    // шаг решётки на экране: полшага ромба по горизонтали и ряд по вертикали
    const s0 = toScreen([0, topRest, 0]), s1 = toScreen([P, topRest, 0]);
    const la = Math.abs((s1[0] - s0[0]) / 2) * W, lb = Math.abs((s1[1] - s0[1]) / 2) * H;
    // следующая фигура, которая помещается (нарисованным в клетках нужен свой минимум)
    let f = null, crop = false;
    const fits = (g) => g && !(g.minTiles && size < g.minTiles * tile);
    // самая малая версия на телефоне: по центру экрана, крайние ромбы уходят за край не больше чем на четверть
    const fitsCrop = (g) => g && g.maxX * la + la / 2 <= W / 2
      && (g.maxY - g.minY + 2) * lb + tile / 2 <= 0.95 * H;
    for (let n = 0; n < sh.list.length && !f; n++) {
      shape.k = (shape.k + 1) % sh.list.length;
      const g = SHAPES[sh.list[shape.k]];
      f = fits(g) ? g : fits(g && g.small) ? g.small : null;   // не влезает — малая версия
      if (!f && fitsCrop(g && g.tiny)) { f = g.tiny; crop = true; }
    }
    if (!f) { shape.t = now; return; }   // ни одна фигура не помещается: пропускаем круг
    // место — случайное, с запасом в плитку от краёв (поднятые плитки рисуются выше своего места);
    // центр притягивается к центру ближайшей плитки, чтобы фигура складывалась симметрично
    const mx = R + tile / 2, my = R + tile / 2;
    let cx = mx + rnd() * Math.max(0, W - 2 * mx), cy = my + rnd() * Math.max(0, H - 2 * my);
    if (crop) {
      // по горизонтали — центр экрана; по вертикали — случайно, от краёв фигуры до краёв экрана
      const top = (-f.minY + 1) * lb + tile / 2, bot = (f.maxY + 1) * lb;
      cx = W / 2; cy = top + rnd() * Math.max(0, H - top - bot);
    }
    const scr = new Float32Array(count * 2);
    let best = Infinity;
    for (let i = 0; i < count; i++) {
      const p = toScreen([offsets[i * 2], topRest, offsets[i * 2 + 1]]);
      scr[i * 2] = ((p[0] + 1) / 2) * W; scr[i * 2 + 1] = ((1 - p[1]) / 2) * H;
      const d = (scr[i * 2] - cx) ** 2 + (scr[i * 2 + 1] - cy) ** 2;
      if (d < best) best = d, shape.snap = i;
    }
    cx = scr[shape.snap * 2]; cy = scr[shape.snap * 2 + 1];
    let maxD = 1e-6;
    for (let i = 0; i < count; i++) {
      const u = (scr[i * 2] - cx) / R, v = -(scr[i * 2 + 1] - cy) / R;
      const ix = Math.round((scr[i * 2] - cx) / la), iy = Math.round((scr[i * 2 + 1] - cy) / lb);
      shapeMember[i] = f(u, v, ix, iy, la, lb) ? 1 : 0;
      shapeDelay[i] = Math.hypot(u, v);
      if (shapeMember[i]) maxD = Math.max(maxD, shapeDelay[i]);
    }
    // проявление волной от центра фигуры
    for (let i = 0; i < count; i++) shapeDelay[i] = shapeMember[i] ? (shapeDelay[i] / maxD) * sh.spreadInMs : 0;
    Object.assign(shape, { phase: 1, t: now, cx, cy, size });
  }
  function startOut(now, quick) {
    // растворение вразнобой; если пришёл курсор — быстрее, наведение важнее образа
    for (let i = 0; i < count; i++) { shapeFrom[i] = shapeV[i]; shapeDelay[i] = shapeMember[i] ? rnd() * sh.spreadOutMs * (quick ? 0.3 : 1) : 0; }
    shape.phase = 3; shape.t = now;
  }
  // курсор на поле и двигался недавно
  const pointerActive = (now) => pointer !== null && now - pointerT < o.cursorIdleMs;

  function updateShape(now) {
    if (!shapesOn) return;
    const idle = !pointerActive(now);
    if (!idle) shape.lastActive = now;
    switch (shape.phase) {
      case 0:
        if (idle && now - shape.lastActive >= sh.idleMs && (shape.first || now - shape.t >= sh.gapMs)) { shape.first = false; startShape(now); }
        break;
      case 1:
        if (!idle) startOut(now, true);
        else if (now - shape.t >= sh.spreadInMs + sh.inMs) { shape.phase = 2; shape.t = now; }
        break;
      case 2:
        if (!idle || now - shape.t >= sh.holdMs) startOut(now, !idle);
        break;
      case 3:
        if (now - shape.t >= sh.spreadOutMs + sh.outMs) { shape.phase = 0; shape.t = now; shapeMember.fill(0); }
        break;
    }
    for (let i = 0; i < count; i++) {
      if (!shapeMember[i] || shape.phase === 0) { shapeV[i] = 0; continue; }
      const p = clamp01((now - shape.t - shapeDelay[i]) / (shape.phase === 3 ? sh.outMs : sh.inMs));
      shapeV[i] = shape.phase === 1 ? easeIn(p) : shape.phase === 2 ? 1 : shapeFrom[i] * (1 - easeOut(p));
    }
  }

  function update(now) {
    updateShape(now);
    const ptr = pointerActive(now) ? pointer : null;
    for (let i = 0; i < count; i++) {
      const x = offsets[i * 2], z = offsets[i * 2 + 1];
      const w = waveAt(x, z, now);

      // Курсор ловит плитку там, где она была нарисована на волне, когда курсор двигался в последний раз.
      // Пока курсор стоит, место попадания не уезжает вместе с волной, и горящая плитка не гаснет под ним
      // (жалоба владельца 26.11.2026: «через 2–3 секунды простоя плитка гаснет»).
      const wp = waveOn ? waveAt(x, z, pointerT) : 0;
      const dy = !waveOn ? 0 : ocean ? wp * wv.swell : (1 - liftV[i]) * wp * wv.amplitude;
      const near = ptr ? ((x - ptr[0] - rayK[0] * dy) ** 2 + (z - ptr[1] - rayK[1] * dy) ** 2 < R2) : false;
      let v = liftV[i];
      switch (phase[i]) {
        case 0: // покой
          if (near) { phase[i] = 1; liftFrom[i] = v; tStart[i] = now; }
          break;
        case 1: { // подъём — доходит до верха, даже если курсор уже ушёл
          const p = (now - tStart[i]) / o.riseMs;
          v = liftFrom[i] + (1 - liftFrom[i]) * easeIn(p);
          if (p >= 1) { v = 1; phase[i] = 2; }
          break;
        }
        case 2: // наверху, пока курсор на плитке
          if (!near) { phase[i] = 3; liftFrom[i] = v; tStart[i] = now; }
          break;
        case 3: { // падение и угасание
          if (near) { phase[i] = 1; liftFrom[i] = v; tStart[i] = now; break; }
          const p = (now - tStart[i]) / o.fallMs;
          v = liftFrom[i] * (1 - easeOut(p));
          if (p >= 1) { v = 0; phase[i] = 0; }
          break;
        }
      }
      liftV[i] = v;
      dyn[i * 3] = v;
      dyn[i * 3 + 1] = w;
      dyn[i * 3 + 2] = shapeV[i];
    }
  }

  let soloIdx = -1;    // отладка: рисовать одну плитку на чёрном
  function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(U.uViewProj, false, viewProj);
    gl.uniform1f(U.uWaveTint, ocean ? 0 : 1);
    gl.bindVertexArray(vao);
    let n = count;
    if (soloIdx >= 0) {
      n = 1;
      gl.bindBuffer(gl.ARRAY_BUFFER, offBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, offsets.subarray(soloIdx * 2, soloIdx * 2 + 2));
      gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, dyn.subarray(soloIdx * 3, soloIdx * 3 + 3));
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, dyn);
    }
    // Гнёзда нужны только волне `spline`: она открывает их красный верх. В остальных режимах гнездо
    // под поднятой иконкой повторяет её силуэт на старом месте, и подъём читается как вытягивание
    // плитки в высоту. Без гнезда под иконкой — тёмная лунка, и плитка поднимается целиком.
    if (socketsOn) {
      const S = SPLINE.socket;
      setDepth(S.rest, S.hover);
      gl.uniform4f(U.uY, S.baseY, S.liftY, 0, 0);
      gl.uniform4f(U.uShape, 0, 0, 0, 0);
      // стенки гнезда совпадают со стенками иконки — отодвигаем по глубине, без мерцания
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 8);
      gl.drawElementsInstanced(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_SHORT, 0, n);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    // иконки
    const I = SPLINE.icon;
    setDepth(I.rest, I.hover);
    // ocean: подъём наведения идёт поверх волны — плитка поднимается на liftY от того места, где она сейчас
    // (решение владельца 26.11.2026). spline: наведение гасит просадку, иначе иконка уходит в гнездо.
    gl.uniform4f(U.uY, I.baseY, I.liftY, waveOn ? (ocean ? wv.swell : wv.amplitude) : 0, ocean ? 0 : 1);
    gl.uniform4f(U.uShape, reduceMotion ? 0 : sh.lift, sh.outlinePx * worldPerPx, sh.outlineColor / 255, 1);
    gl.drawElementsInstanced(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_SHORT, 0, n);
    gl.bindVertexArray(null);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = now - last; last = now;
    frames++; acc += dt;
    if (acc >= 1000) {
      fps = (frames * 1000) / acc; frames = 0; acc = 0;
      // просел кадр — уменьшаем плотность пикселей ступенями
      if (fps < 50 && dpr > o.minDpr) { slow++; if (slow >= 2) { dpr = Math.max(o.minDpr, dpr - 0.25); resizeCanvas(); slow = 0; } } else slow = 0;
      if (o.debug && api.onStats) api.onStats({ ...api.stats, fps });
    }
    update(frozen ?? now);
    draw();
    if (api.onFrame) api.onFrame(gl, frozen ?? now);   // отладка: чтение пикселей в том же кадре
  }

  const start = () => { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  let visible = true;
  const sync = () => (visible && !document.hidden ? start() : stop());
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); });
  io.observe(host);
  document.addEventListener('visibilitychange', sync);
  const ro = new ResizeObserver(() => { layout(); if (!running) { update(performance.now()); draw(); } });
  ro.observe(host);

  layout();
  update(performance.now());
  draw();
  sync();

  const api = {
    canvas,
    get stats() { return { fps, dpr, count, vertices: geo.vertexCount * count * (socketsOn ? 2 : 1), triangles: (geo.indices.length / 3) * count * (socketsOn ? 2 : 1), tilePx: Math.round(o.tilePx(W, H)), reduceMotion }; },
    onStats: null,
    onFrame: null,
    /** Отладка: образ — фаза (0 пауза, 1 проявление, 2 держим, 3 растворение), фигура, сколько плиток, где. */
    get shapeState() {
      let n = 0; for (let i = 0; i < count; i++) n += shapeMember[i];
      return { phase: shape.phase, name: shape.k >= 0 ? sh.list[shape.k] : null, tiles: n, cx: shape.cx, cy: shape.cy, size: shape.size };
    },
    /** Отладка: состояние видимых плиток — индекс сетки, подъём наведения, волна (−1…1). */
    get tiles() {
      const out = [];
      for (let i = 0; i < count; i++) {
        out.push({ i: Math.round(offsets[i * 2] / P), j: Math.round(offsets[i * 2 + 1] / P), lift: dyn[i * 3], wave: dyn[i * 3 + 1], shape: dyn[i * 3 + 2] });
      }
      return out;
    },
    /** Отладка: экранная точка центра верха плитки, ближайшей к (px, py) в CSS px. */
    probe(px, py) {
      const r = canvas.getBoundingClientRect();
      const g = toGround((px / r.width) * 2 - 1, 1 - (py / r.height) * 2, SPLINE.icon.baseY + SPLINE.tile.depth);
      const i = Math.round(g[0] / P), j = Math.round(g[1] / P);
      const proj = (y) => { const s = toScreen([i * P, y, j * P]); return [(s[0] + 1) / 2 * r.width, (1 - s[1]) / 2 * r.height]; };
      const top0 = SPLINE.icon.baseY + SPLINE.tile.depth;
      return { rest: proj(top0), lifted: proj(top0 + SPLINE.icon.liftY), riseMs: o.riseMs, fallMs: o.fallMs };
    },
    /** Отладка: рисовать только плитку под точкой (CSS px); null — всё поле. */
    solo(px, py) {
      if (px == null) {
        soloIdx = -1;
        gl.bindBuffer(gl.ARRAY_BUFFER, offBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, offsets);
        return -1;
      }
      const r = canvas.getBoundingClientRect();
      const g = toGround((px / r.width) * 2 - 1, 1 - (py / r.height) * 2, SPLINE.icon.baseY + SPLINE.tile.depth);
      let best = 0, bd = Infinity;
      for (let i = 0; i < count; i++) {
        const d = (offsets[i * 2] - g[0]) ** 2 + (offsets[i * 2 + 1] - g[1]) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      soloIdx = best;
      return best;
    },
    /** Отладка: остановить часы анимации на ms от старта (null — пустить снова). */
    freeze(ms) {
      frozen = ms == null ? null : t0 + ms;
      // рисуем сразу, не дожидаясь кадра: в фоновой панели кадры приходят редко
      const t = frozen ?? performance.now(); update(t); draw(); if (api.onFrame) api.onFrame(gl, t);
    },
    destroy() {
      stop(); io.disconnect(); ro.disconnect();
      pointerEl.removeEventListener('pointermove', onMove);
      pointerEl.removeEventListener('pointerdown', onMove);
      pointerEl.removeEventListener('pointerup', onUp);
      pointerEl.removeEventListener('pointercancel', onUp);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('blur', onBlur);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
  return api;
}
