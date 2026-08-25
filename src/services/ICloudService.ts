// ============================================================
// ICloudService — контракт облачного сервиса игры.
// Любой бэкенд (Firebase, Yandex SDK, CrazyGames, Nework...)
// реализует этот интерфейс, и игра не замечает подмены.
// ============================================================

/** Прогресс игрока, который хранится в облаке */
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
}

/** Данные пользователя для Firestore (расширенный профиль) */
export interface UserData {
  /** Валюты */
  currencies: {
    credits: number;
    blueprints: number;
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

  /** Сохранить прогресс игрока */
  saveProgress(data: ProgressData): Promise<void>;

  /** Загрузить прогресс игрока. Возвращает null, если прогресса ещё нет. */
  loadProgress(): Promise<ProgressData | null>;

  /**
   * Отправить рекорд в лидерборд.
   * Если playerName не передан — генерируется автоматический ник.
   */
  submitScore(score: number, playerName?: string): Promise<void>;

  /** Получить ТОП игроков, отсортированный по убыванию очков */
  getLeaderboard(limitCount: number): Promise<LeaderboardEntry[]>;

  /** Сохранить расширенные данные пользователя (валюты, станция, инвентарь) */
  saveUserData(data: UserData): Promise<void>;

  /** Загрузить данные пользователя. Возвращает null, если данных ещё нет. */
  loadUserData(): Promise<UserData | null>;
}
