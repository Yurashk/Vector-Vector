// ============================================================
// NeonUI — общие константы палитры, утилиты неона и глобальное
// состояние игры (localStorage с fallback-значениями).
// Используется всеми UI-сценами для единого киберпанк-стиля.
// ============================================================

import * as Phaser from "phaser";

// --- ПАЛИТРА ---
export const COLOR_BG = 0x0a0a14;
export const COLOR_CYAN = 0x00f0ff;
export const COLOR_GOLD = 0xffd700;
export const COLOR_PINK = 0xff007f;
export const COLOR_PURPLE = 0x9d00ff;
export const COLOR_DARK_PANEL = 0x121224;
export const COLOR_SILVER = 0xc0c0c0;
export const COLOR_BRONZE = 0xcd7f32;

// --- ГЛОБАЛЬНОЕ СОСТОЯНИЕ (localStorage + дефолты) ---

/** Уровни отсеков космической станции (мета-прогрессия) */
export interface StationLevels {
  engineering: number; // инженерный отсек — регенерация жизни
  finance: number; // финансовый отсек — множитель монет
  design: number; // конструкторский отсек — новые скины корабля
}

/** Интервал восстановления одной жизни (реальное время) */
export const LIFE_RESTORE_INTERVAL_MS = 45 * 60 * 1000;

/** Состояние стройки отсека станции */
export interface StationBuildState {
  isBuilding: boolean;
  /** Timestamp окончания постройки */
  finishTime: number;
}

export type StationBuildMap = Record<keyof StationLevels, StationBuildState>;

export const GameState = {
  getCoins: (): number =>
    parseInt(localStorage.getItem("game_coins") || "1250", 10),

  addCoins: (val: number): number => {
    const current = GameState.getCoins() + val;
    localStorage.setItem("game_coins", current.toString());
    return current;
  },

  // --- Чертежи (blueprints) — исследовательская валюта Design Wing ---
  getBlueprints: (): number =>
    parseInt(localStorage.getItem("game_blueprints") || "0", 10),

  addBlueprints: (val: number): number => {
    const current = Math.max(0, GameState.getBlueprints() + val);
    localStorage.setItem("game_blueprints", current.toString());
    return current;
  },

  getStation: (): StationLevels => {
    const fallback = { engineering: 0, finance: 0, design: 0 };
    try {
      const raw = localStorage.getItem("game_station");
      if (!raw) return fallback;
      return { ...fallback, ...JSON.parse(raw) };
    } catch {
      return fallback;
    }
  },

  setStation: (levels: StationLevels): void => {
    try {
      localStorage.setItem("game_station", JSON.stringify(levels));
    } catch {
      /* localStorage недоступен — станция живёт только в памяти */
    }
  },

  // --- Энергия (жизни) — восстанавливаются по реальному времени ---

  getMaxLives: (): number => {
    const v = parseInt(localStorage.getItem("game_max_lives") || "5", 10);
    return Number.isFinite(v) && v > 0 ? v : 5;
  },

  getLives: (): number => {
    const v = parseInt(localStorage.getItem("game_lives") || "5", 10);
    return Number.isFinite(v) ? Math.max(0, v) : 5;
  },

  setLives: (val: number): void => {
    try {
      localStorage.setItem("game_lives", Math.max(0, val).toString());
    } catch {
      /* память недоступна — жизни только в текущей сессии */
    }
  },

  getLastLifeRestoreTime: (): number =>
    parseInt(localStorage.getItem("game_life_ts") || "0", 10),

  setLastLifeRestoreTime: (ts: number): void => {
    try {
      localStorage.setItem("game_life_ts", ts.toString());
    } catch {
      /* память недоступна */
    }
  },

  /**
   * Приводит жизни в актуальное состояние по разнице Date.now()
   * и метки последнего восстановления. Начисляет все пропущенные
   * жизни сразу (в т.ч. после закрытия игры). Вызывать перед
   * любым чтением количества жизней.
   */
  syncLives: (): number => {
    const max = GameState.getMaxLives();
    const now = Date.now();
    let last = GameState.getLastLifeRestoreTime();

    // Первый запуск: начинаем отсчёт от текущего момента
    if (last <= 0) {
      GameState.setLastLifeRestoreTime(now);
      return Math.min(GameState.getLives(), max);
    }

    let lives = Math.min(GameState.getLives(), max);

    // Полный запас: держим метку свежей, чтобы после траты жизни
    // следующая пришла через полный интервал
    if (lives >= max) {
      if (now - last > LIFE_RESTORE_INTERVAL_MS) {
        GameState.setLastLifeRestoreTime(now);
      }
      return max;
    }

    const gained = Math.floor((now - last) / LIFE_RESTORE_INTERVAL_MS);
    if (gained > 0) {
      lives = Math.min(max, lives + gained);
      GameState.setLives(lives);
      last += gained * LIFE_RESTORE_INTERVAL_MS;
      GameState.setLastLifeRestoreTime(lives >= max ? now : last);
    }
    return lives;
  },

  /** Миллисекунд до следующей жизни; 0 — запас полон */
  msToNextLife: (): number => {
    const max = GameState.getMaxLives();
    if (GameState.syncLives() >= max) return 0;
    const elapsed = Date.now() - GameState.getLastLifeRestoreTime();
    return Math.max(0, LIFE_RESTORE_INTERVAL_MS - elapsed);
  },

  /** Списывает одну жизнь (плата за запуск забега); false — пусто */
  trySpendLife: (): boolean => {
    const lives = GameState.syncLives();
    if (lives <= 0) return false;
    GameState.setLives(lives - 1);
    return true;
  },

  // --- Таймеры постройки на станции ---

  getStationBuilds: (): StationBuildMap => {
    const fallback: StationBuildMap = {
      engineering: { isBuilding: false, finishTime: 0 },
      finance: { isBuilding: false, finishTime: 0 },
      design: { isBuilding: false, finishTime: 0 },
    };
    try {
      const raw = localStorage.getItem("game_station_builds");
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<StationBuildMap>;
      return {
        engineering: parsed.engineering ?? fallback.engineering,
        finance: parsed.finance ?? fallback.finance,
        design: parsed.design ?? fallback.design,
      };
    } catch {
      return fallback;
    }
  },

  setStationBuild: (key: keyof StationLevels, state: StationBuildState): void => {
    try {
      const map = GameState.getStationBuilds();
      map[key] = state;
      localStorage.setItem("game_station_builds", JSON.stringify(map));
    } catch {
      /* память недоступна — стройка только в текущей сессии */
    }
  },

  /**
   * Достраивает модули с истёкшим таймером: повышает уровень отсека
   * и снимает состояние стройки. Возвращает ключи достроенных модулей.
   * Вызывается при входе на станцию и в посекундном тике.
   */
  finalizeFinishedBuilds: (): (keyof StationLevels)[] => {
    const now = Date.now();
    const builds = GameState.getStationBuilds();
    const completed: (keyof StationLevels)[] = [];

    (Object.keys(builds) as (keyof StationLevels)[]).forEach((key) => {
      const b = builds[key];
      if (b.isBuilding && now >= b.finishTime) {
        const levels = GameState.getStation();
        levels[key] += 1;
        GameState.setStation(levels);
        builds[key] = { isBuilding: false, finishTime: 0 };
        completed.push(key);
      }
    });

    if (completed.length > 0) {
      try {
        localStorage.setItem("game_station_builds", JSON.stringify(builds));
      } catch {
        /* память недоступна */
      }
    }
    return completed;
  },

  getUsername: (): string =>
    localStorage.getItem("game_username") || "CYBER_PLAYER",

  setUsername: (name: string): void =>
    localStorage.setItem("game_username", name),

  getSoundEnabled: (): boolean =>
    localStorage.getItem("game_sound") !== "false",

  setSoundEnabled: (val: boolean): void =>
    localStorage.setItem("game_sound", val.toString()),

  getMusicEnabled: (): boolean =>
    localStorage.getItem("game_music") !== "false",

  setMusicEnabled: (val: boolean): void =>
    localStorage.setItem("game_music", val.toString()),
};

// --- НЕОНОВАЯ ПЛАШКА (многослойный stroke: гало + ядро + заливка) ---
export function drawNeonPlate(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  color: number,
  radius = 12,
  fillAlpha = 0.15,
): void {
  g.clear();
  // Заливка
  g.fillStyle(color, fillAlpha);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  // Внешнее свечение
  g.lineStyle(8, color, 0.08);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  g.lineStyle(4, color, 0.2);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  // Яркий контур
  g.lineStyle(1.8, color, 0.9);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
}

// --- КИБЕР-СЕТКА ФОНА ---
export function drawGrid(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
): void {
  g.clear();
  const step = 36;
  for (let x = 0; x <= w; x += step) {
    const isMajor = x % (step * 4) === 0;
    g.lineStyle(1, COLOR_CYAN, isMajor ? 0.08 : 0.03);
    g.lineBetween(x, 0, x, h);
  }
  for (let y = 0; y <= h; y += step) {
    const isMajor = y % (step * 4) === 0;
    g.lineStyle(1, COLOR_CYAN, isMajor ? 0.08 : 0.03);
    g.lineBetween(0, y, w, y);
  }
}

// --- ФОРМАТ ВРЕМЕНИ ---

/** Мс -> "ЧЧ:ММ:СС" (forceHours) или "ММ:СС" для таймеров UI */
export function formatDuration(ms: number, forceHours = false): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, "0");

  if (h > 0 || forceHours) {
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${ss}`;
  }
  return `${m.toString().padStart(2, "0")}:${ss}`;
}

// ============================================================
// Векторный генератор Sci-Fi иконок (замена эмодзи)
// ============================================================
export function drawSciFiIcon(
  g: Phaser.GameObjects.Graphics,
  type: string,
  color: number,
  size: number = 14,
): void {
  g.clear();
  g.lineStyle(2, color, 0.95);

  switch (type) {
    case "engineering": // Силовая Молния / Ядро
      g.beginPath();
      g.moveTo(2, -size);
      g.lineTo(-size * 0.4, 1);
      g.lineTo(1, 1);
      g.lineTo(-2, size);
      g.lineTo(size * 0.4, -1);
      g.lineTo(-1, -1);
      g.closePath();
      g.fillStyle(color, 0.3);
      g.fillPath();
      g.strokePath();
      break;

    case "finance": // Кристалл / Алмаз
      g.beginPath();
      g.moveTo(0, -size);
      g.lineTo(size * 0.8, -size * 0.3);
      g.lineTo(0, size);
      g.lineTo(-size * 0.8, -size * 0.3);
      g.closePath();
      g.strokePath();
      // Внутренние грани кристалла
      g.lineStyle(1, 0xffffff, 0.6);
      g.lineBetween(-size * 0.8, -size * 0.3, size * 0.8, -size * 0.3);
      g.lineBetween(0, -size, 0, size);
      break;

    case "design": // Атом / Орбиты
      g.strokeCircle(0, 0, size * 0.7);
      g.lineStyle(1.2, color, 0.8);
      g.strokeEllipse(0, 0, size * 1.5, size * 0.5);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(0, 0, 3);
      break;

    case "core": // Ядро Реактора — изометрический ромб вместо прямоугольника
      g.fillStyle(color, 0.4);
      g.fillCircle(0, 0, size * 0.5);
      g.strokeCircle(0, 0, size * 0.9);
      // Ромб (diamond) вместо strokeRect для изометрической проекции
      g.lineStyle(1, 0xffffff, 0.8);
      g.beginPath();
      g.moveTo(0, -size * 0.4);
      g.lineTo(size * 0.4, 0);
      g.lineTo(0, size * 0.4);
      g.lineTo(-size * 0.4, 0);
      g.closePath();
      g.strokePath();
      break;
  }
}

// ============================================================
// Векторные иконки валют (единый стиль для HUD и модалок)
// ============================================================

/**
 * Рисует неоновую иконку валюты в.Graphics-контексте.
 * Центрирована в (0, 0) — вызывающий код移動 (setPosition) при необходимости.
 *
 * @param g    — Phaser.GameObjects.Graphics (уже вызван clear())
 * @param type — 'CR' (кристалл/ромб, gold) | 'BP' (мишень/чип, pink)
 * @param size — радиус описанной окружности (дефолт 14)
 */
export function drawCurrencyIcon(
  g: Phaser.GameObjects.Graphics,
  type: "CR" | "BP",
  size: number = 14,
): void {
  g.clear();

  if (type === "CR") {
    // === Кристалл / Ромб (Gold 0xffb700) ===
    const col = 0xffb700;
    const hw = size * 0.75;
    const hh = size;

    // Внешнее гало
    g.lineStyle(6, col, 0.1);
    g.beginPath();
    g.moveTo(0, -hh);
    g.lineTo(hw, 0);
    g.lineTo(0, hh);
    g.lineTo(-hw, 0);
    g.closePath();
    g.strokePath();

    // Тело ромба — два треугольника (верх + низ)
    // Верхний треугольник (ярче)
    g.fillStyle(col, 0.55);
    g.beginPath();
    g.moveTo(0, -hh);
    g.lineTo(hw, 0);
    g.lineTo(-hw, 0);
    g.closePath();
    g.fillPath();

    // Нижний треугольник (приглушённый)
    g.fillStyle(col, 0.3);
    g.beginPath();
    g.moveTo(0, hh);
    g.lineTo(hw, 0);
    g.lineTo(-hw, 0);
    g.closePath();
    g.fillPath();

    // Яркий контур
    g.lineStyle(1.8, col, 0.95);
    g.beginPath();
    g.moveTo(0, -hh);
    g.lineTo(hw, 0);
    g.lineTo(0, hh);
    g.lineTo(-hw, 0);
    g.closePath();
    g.strokePath();

    // Внутренние световые блики — горизонталь + вертикаль
    g.lineStyle(1, 0xffffff, 0.7);
    g.lineBetween(-hw * 0.5, -hh * 0.25, hw * 0.5, -hh * 0.25);
    g.lineBetween(0, -hh * 0.65, 0, hh * 0.4);

    // Точка блика
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(-hw * 0.25, -hh * 0.35, 1.5);
  } else {
    // === BP: Мишень / Чип (Pink 0xff007f) ===
    const col = 0xff007f;

    // Внешнее гало
    g.lineStyle(6, col, 0.08);
    g.strokeCircle(0, 0, size);

    // Внешнее кольцо
    g.lineStyle(2, col, 0.9);
    g.strokeCircle(0, 0, size);

    // Среднее кольцо
    g.lineStyle(1.2, col, 0.55);
    g.strokeCircle(0, 0, size * 0.65);

    // Светящееся ядро
    g.fillStyle(col, 0.45);
    g.fillCircle(0, 0, size * 0.35);

    // Белый пин в центре
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(0, 0, size * 0.12);

    // Перекрестие
    g.lineStyle(1, 0xffffff, 0.45);
    g.lineBetween(0, -size, 0, size);
    g.lineBetween(-size, 0, size, 0);
  }
}
