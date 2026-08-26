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
  /** Минимальный уровень конструкторского отсека станции (0/undefined — открыт сразу) */
  requiredDesignLevel?: number;
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
    id: "spectre",
    name: "Spectre",
    price: 0,
    unlocked: true,
    primaryColor: 0x00ffcc, // Яркий изумрудно-мятный неон
    accentColor: 0xffffff,
    glowColor: 0x00ffaa,
    gapSize: 1,
    requiredDesignLevel: 1,
    parts: [
      // --- РАЗДВОЕННЫЙ НОС (ЛЕВЫЙ КЛЫК / ПИЛОН) ---
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-6, -30, -10, -16, -4, -12],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-6, -30, -4, -12, -2, -18],
        accent: true,
      },

      // --- РАЗДВОЕННЫЙ НОС (ПРАВЫЙ КЛЫК / ПИЛОН) ---
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [6, -30, 2, -18, 4, -12],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [6, -30, 4, -12, 10, -16],
      },

      // --- ЦЕНТРАЛЬНОЕ ЯДРО / КАБИНА ---
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [0, -18, -4, -12, 0, -4],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [0, -18, 0, -4, 4, -12],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-4, -12, -7, 2, 0, -4],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [4, -12, 0, -4, 7, 2],
      },

      // --- КРЫЛЬЯ ОБРАТНОЙ СТРЕЛОВИДНОСТИ (ЛЕВОЕ КРЫЛО) ---
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-10, -16, -24, -6, -15, 4],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-24, -6, -15, 4, -20, 14],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-15, 4, -7, 2, -10, 12],
      },

      // --- КРЫЛЬЯ ОБРАТНОЙ СТРЕЛОВИДНОСТИ (ПРАВОЕ КРЫЛО) ---
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [10, -16, 15, 4, 24, -6],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [24, -6, 20, 14, 15, 4],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [15, 4, 10, 12, 7, 2],
      },

      // --- КОРМА И ДВИГАТЕЛИ ---
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-7, 2, -10, 12, 0, 18],
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [7, 2, 0, 18, 10, 12],
        accent: true,
      },
      // Центральный сопловый соты-выхлоп
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [-4, 14, 0, 24, 0, 18],
        accent: true,
      },
      {
        type: "polygon",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [0, 18, 0, 24, 4, 14],
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

/**
 * Скины, доступные при данном уровне конструкторского отсека станции.
 * Базовые корабли (без requiredDesignLevel) открыты всегда.
 */
export function getUnlockedSkins(designLevel: number): SpaceshipSkin[] {
  return SPACESHIP_SKINS.filter(
    (skin) => (skin.requiredDesignLevel ?? 0) <= designLevel,
  );
}

// ============================================================
// Скины-награды конструкторского отсека: геометрия базовых
// кораблей + новая неоновая окраска. Добавляются в конец каталога,
// поэтому карусель листает их после базовых.
// ============================================================
function cloneWithColors(
  base: SpaceshipSkin,
  patch: Pick<
    SpaceshipSkin,
    "id" | "name" | "requiredDesignLevel" | "primaryColor" | "accentColor" | "glowColor"
  >,
): SpaceshipSkin {
  return {
    ...base,
    ...patch,
    price: 0,
    unlocked: true,
    gapSize: base.gapSize,
    parts: base.parts.map((p) => ({ ...p })),
  };
}

SPACESHIP_SKINS.push(
  cloneWithColors(SPACESHIP_SKINS[0], {
    id: "phantom",
    name: "Phantom",
    requiredDesignLevel: 1,
    primaryColor: 0x9d00ff, // фиолетовый неон
    accentColor: 0xe0b3ff,
    glowColor: 0xb44dff,
  }),
  cloneWithColors(SPACESHIP_SKINS[1], {
    id: "viper",
    name: "Viper",
    requiredDesignLevel: 2,
    primaryColor: 0x00ff88, // кислотно-зелёный неон
    accentColor: 0xb3ffd9,
    glowColor: 0x00ff9d,
  }),
  cloneWithColors(SPACESHIP_SKINS[2], {
    id: "titan",
    name: "Titan",
    requiredDesignLevel: 3,
    primaryColor: 0xff2222, // алый неон
    accentColor: 0xffb3b3,
    glowColor: 0xff4444,
  }),
  cloneWithColors(SPACESHIP_SKINS[3], {
    id: "eclipse",
    name: "Eclipse",
    requiredDesignLevel: 4,
    primaryColor: 0x6600cc, // тёмно-фиолетовый неон
    accentColor: 0xcc99ff,
    glowColor: 0x8833ff,
  }),
  cloneWithColors(SPACESHIP_SKINS[0], {
    id: "nova",
    name: "Nova",
    requiredDesignLevel: 5,
    primaryColor: 0xffcc00, // золотой неон
    accentColor: 0xffffff,
    glowColor: 0xffaa00,
  }),
);

// Выбранный скин хранится на уровне модуля, чтобы переживать перезапуск сцены
let selectedSkinId: string = "scout";

export function selectSkin(id: string): void {
  selectedSkinId = id;
}

export function getSelectedSkin(): SpaceshipSkin {
  return getSkinById(selectedSkinId);
}