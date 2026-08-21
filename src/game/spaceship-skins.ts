export type GeoType =
  | "triangle"
  | "right-triangle"
  | "trapezoid"
  | "rhombus"
  | "rectangle"
  | "ellipse"
  | "polygon"; // Для создания низкополигональных сетчатых структур

export interface GeoPart {
  type: GeoType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  accent?: boolean;
  points?: number[]; // Локальные координаты [x1, y1, x2, y2, ...] для типа 'polygon'
}

export interface SpaceshipSkin {
  id: string;
  name: string;
  price: number;
  unlocked: boolean;
  primaryColor: number;
  accentColor: number;
  glowColor: number;
  gapSize: number;
  parts: GeoPart[];
}

export const SPACESHIP_SKINS: SpaceshipSkin[] = [
  {
    id: "scout",
    name: "Scout",
    price: 0,
    unlocked: true,
    primaryColor: 0x00d8ff,
    accentColor: 0xffffff,
    glowColor: 0x00f3ff,
    gapSize: 1, // Минимальный зазор для плотной полигональной сетки
    parts: [
      // --- ВНЕШНИЙ КОНТУР И ОСНОВНОЙ КАРКАС ---
      // Носовой обтекатель (Центральный острый треугольник)
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [0, -28, -2, -18, 0, -18],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [0, -28, 0, -18, 2, -18],
      },

      // Левая внешняя грань крыла
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [0, -28, -22, 12, -13, 3],
      },
      // Правая внешняя грань крыла
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [0, -28, 13, 3, 22, 12],
      },

      // --- ВНУТРЕННЯЯ ПОЛИГОНАЛЬНАЯ СЕТКА (ЛЕВАЯ ЧАСТЬ) ---
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-2, -18, -13, 3, -1, -5],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-13, 3, -22, 12, -16, 10],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-22, 12, -13, 14, -16, 10],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-16, 10, -13, 14, -6, 8],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-13, 3, -16, 10, -6, 8],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-13, 3, -6, 8, -1, -5],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-1, -5, -6, 8, -1, 14],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-6, 8, -13, 14, -1, 14],
      },

      // --- ВНУТРЕННЯЯ ПОЛИГОНАЛЬНАЯ СЕТКА (ПРАВАЯ ЧАСТЬ) ---
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [2, -18, 1, -5, 13, 3],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [13, 3, 16, 10, 22, 12],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [22, 12, 16, 10, 13, 14],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [16, 10, 6, 8, 13, 14],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [13, 3, 6, 8, 16, 10],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [13, 3, 1, -5, 6, 8],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [1, -5, 1, 14, 6, 8],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [6, 8, 1, 14, 13, 14],
      },

      // --- ХВОСТОВОЙ СОПЛОВОЙ ТРЕУГОЛЬНИК (НИЖНИЙ ВЫХЛОП) ---
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-3, 14, 0, 20, 0, 14],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [0, 14, 0, 20, 3, 14],
        accent: true,
      },
    ],
  },
  {
    id: "interceptor",
    name: "Interceptor",
    price: 0,
    unlocked: true,
    primaryColor: 0xff2d95,
    accentColor: 0xffffff,
    glowColor: 0xff2d95,
    gapSize: 2,
    parts: [
      // Носовой дротик (левая/правая грани)
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [0, -30, -3, -12, 0, -6],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [0, -30, 3, -12, 0, -6],
        accent: true,
      },

      // Фюзеляж
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-3, -12, -6, 12, 0, 16],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [3, -12, 6, 12, 0, 16],
        accent: true,
      },

      // Стреловидные крылья
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-4, -4, -22, 14, -6, 12],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [4, -4, 22, 14, 6, 12],
        accent: true,
      },

      // Боковые гондолы двигателей
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-6, 12, -12, 20, 0, 16],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [6, 12, 12, 20, 0, 16],
        accent: true,
      },
    ],
  },
  {
    id: "dreadnought",
    name: "Dreadnought",
    price: 0,
    unlocked: true,
    primaryColor: 0xffaa00,
    accentColor: 0xffffff,
    glowColor: 0xff5500,
    gapSize: 2,
    parts: [
      // Массивный нос
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [0, -26, -10, -12, 10, -12],
      },

      // Средняя палуба
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-10, -12, -20, 4, 0, 4],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [10, -12, 20, 4, 0, 4],
        accent: true,
      },

      // Кормовая секция
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-20, 4, -12, 18, 0, 18],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [20, 4, 12, 18, 0, 18],
        accent: true,
      },

      // Бортовые модули
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-20, 4, -26, 12, -12, 18],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [20, 4, 26, 12, 12, 18],
        accent: true,
      },

      // Сопла двигателей
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-6, 18, -3, 24, 0, 18],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [3, 24, 6, 18, 0, 18],
        accent: true,
      },
    ],
  },
];

export function getSkinById(id: string): SpaceshipSkin {
  return SPACESHIP_SKINS.find((skin) => skin.id === id) ?? SPACESHIP_SKINS[0];
}

// Выбранный скин хранится на уровне модуля, чтобы переживать перезапуск сцены
let selectedSkinId: string = "scout";

export function selectSkin(id: string): void {
  selectedSkinId = id;
}

export function getSelectedSkin(): SpaceshipSkin {
  return getSkinById(selectedSkinId);
}