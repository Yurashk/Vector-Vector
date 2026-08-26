// ============================================================
// ICloudService — контракт облачного сервиса игры.
// Любой бэкенд (Firebase, Yandex SDK, CrazyGames, Nework...)
// реализует этот интерфейс, и игра не замечает подмены.
//
// Все данные хранятся в одной коллекции players/{userId}:
//   players/{userId} → {
//     achievements, selectedShip, selectedSkin,
//     stationLevels, coins, blueprints, lastBpTimestamp,
//     customization: { selectedModelId, selectedPaletteId,
//                      unlockedModels[], unlockedPalettes[] }
//   }
// ============================================================

/** Прогресс игрока, который хранится в облаке (players/{userId}) */
export interface ProgressData {
  achievements: string[];
  selectedShip: string;
  selectedSkin: string;
  /** Уровни отсеков станции (мета-прогрессия). Опционально для обратной совместимости. */
  stationLevels?: {
    engineering: number;
    finance: number;
    design: number;
  };
  /** Монеты игрока на момент сохранения */
  coins?: number;
  /** Баланс чертежей (BP) */
  blueprints?: number;
  /** Timestamp последнего начисления BP (для пассивной генерации) */
  lastBpTimestamp?: number;
  /** Кастомизация: модели кораблей и палитры */
  customization?: {
    selectedModelId: string;
    selectedPaletteId: string;
    unlockedModels: string[];
    unlockedPalettes: string[];
  };
}

/** Данные пользователя для Firestore (полная структура players/{userId}) */
export interface UserData {
  /** Валюты */
  currencies: {
    credits: number;
    blueprints: number;
    /** Timestamp последнего начисления BP (для пассивной генерации) */
    lastBpTimestamp: number;
  };
  /** Уровни и стройки отсеков станции */
  station: {
    [key: string]: number;
  };
  /** Инвентарь: экипированный корабль и разблокированные скины */
  inventory: {
    equippedShip: string;
    unlockedSkins: string[];
  };
  /** Кастомизация: модели кораблей (Hulls) и неоновые палитры */
  customization: {
    selectedModelId: string;
    selectedPaletteId: string;
    unlockedModels: string[];
    unlockedPalettes: string[];
  };
}

/** Запись в лидерборде */
export interface LeaderboardEntry {
  userId: string;
  playerName: string;
  score: number;
  updatedAt?: number;
}

/**
 * Абстракция облачного сервиса.
 * Все методы async — реализации могут быть сетевыми или локальными.
 */
export interface ICloudService {
  /**
   * Инициализация сервиса и авторизация
   * (анонимная авторизация или генерация локального userId).
   * Должна вызываться один раз при старте игры.
   */
  init(): Promise<void>;

  /**
   * Уникальный идентификатор текущего игрока.
   * Синхронный геттер: валиден после init(), до него — пустая строка.
   * Используется, чтобы отличать себя в лидерборде (ники могут совпадать).
   */
  getUserId(): string;

  /** Сохранить прогресс игрока (players/{userId}) */
  saveProgress(data: ProgressData): Promise<void>;

  /** Загрузить прогресс игрока (players/{userId}). Возвращает null, если прогресса ещё нет. */
  loadProgress(): Promise<ProgressData | null>;

  /**
   * Отправить рекорд в лидерборд.
   * Если playerName не передан — генерируется автоматический ник.
   */
  submitScore(score: number, playerName?: string): Promise<void>;

  /** Получить ТОП игроков, отсортированный по убыванию очков */
  getLeaderboard(limitCount: number): Promise<LeaderboardEntry[]>;

  /** Сохранить расширенные данные пользователя (players/{userId}) */
  saveUserData(data: UserData): Promise<void>;

  /** Загрузить данные пользователя (players/{userId}). Возвращает null, если данных ещё нет. */
  loadUserData(): Promise<UserData | null>;

  /** Атомарно разблокировать модель корабля (списание CR через транзакцию в players/{userId}). Возвращает true если успешно. */
  unlockModel(modelId: string, priceCR: number): Promise<boolean>;

  /** Атомарно разблокировать палитру (списание BP через транзакцию в players/{userId}). Возвращает true если успешно. */
  unlockPalette(paletteId: string, priceBP: number): Promise<boolean>;

  /** Сохранить выбранную модель и палитру (players/{userId}) */
  equipCustomization(modelId: string, paletteId: string): Promise<void>;

  /** Обновить баланс BP и таймстамп в облаке (players/{userId}) */
  updateBlueprintsToCloud(blueprints: number, lastBpTimestamp: number): Promise<void>;
}
