// ============================================================
// GameServicesManager — фасад, через который игра общается с облаком.
//
// ─── КАК СМЕНИТЬ БЭКЕНД В БУДУЩЕМ ───────────────────────────
// 1. Пишете новый класс: class YandexSDKAdapter implements ICloudService
//    (init/saveProgress/loadProgress/submitScore/getLeaderboard).
// 2. Меняете ОДНУ строчку ниже в конструкторе:
//        this.adapter = new FirebaseAdapter();
//    ->
//        this.adapter = new YandexSDKAdapter();
// 3. Всё. Логика игры (Game.ts, меню и т.д.) не меняется вообще,
//    потому что она знает только про этот менеджер.
// ============================================================

import type {
  ICloudService,
  LeaderboardEntry,
  ProgressData,
  UserData,
} from "./ICloudService";
import { FirebaseAdapter } from "./FirebaseAdapter";

export class GameServicesManager {
  // ↓↓↓ ТОЧКА ПОДМЕНЫ БЭКЕНДА ↓↓↓
  private adapter: ICloudService = new FirebaseAdapter();
  // Пример на будущее:
  // private adapter: ICloudService = new YandexSDKAdapter();

  /** Инициализация (безопасна — вызывается один раз) */
  async init(): Promise<void> {
    try {
      await this.adapter.init();
    } catch (e) {
      console.warn("[GameServices] init failed:", e);
    }
  }

  /**
   * Уникальный id текущего игрока ("" если облако ещё не готово).
   * Именно по нему ищем свою строку в лидерборде — ники могут совпадать.
   */
  getUserId(): string {
    return this.adapter.getUserId();
  }

  async saveProgress(data: ProgressData): Promise<void> {
    try {
      await this.adapter.saveProgress(data);
    } catch (e) {
      console.warn("[GameServices] saveProgress failed:", e);
    }
  }

  async loadProgress(): Promise<ProgressData | null> {
    try {
      return await this.adapter.loadProgress();
    } catch (e) {
      console.warn("[GameServices] loadProgress failed:", e);
      return null;
    }
  }

  async submitScore(score: number, playerName?: string): Promise<void> {
    try {
      await this.adapter.submitScore(score, playerName);
    } catch (e) {
      console.warn("[GameServices] submitScore failed:", e);
    }
  }

  async getLeaderboard(limitCount: number): Promise<LeaderboardEntry[]> {
    try {
      return await this.adapter.getLeaderboard(limitCount);
    } catch (e) {
      console.warn("[GameServices] getLeaderboard failed:", e);
      return [];
    }
  }

  async saveUserData(data: UserData): Promise<void> {
    try {
      await this.adapter.saveUserData(data);
    } catch (e) {
      console.warn("[GameServices] saveUserData failed:", e);
    }
  }

  async loadUserData(): Promise<UserData | null> {
    try {
      return await this.adapter.loadUserData();
    } catch (e) {
      console.warn("[GameServices] loadUserData failed:", e);
      return null;
    }
  }
}

/** Синглтон: игра импортирует только его */
export const gameServices = new GameServicesManager();

/* ============================================================
   ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ (из любого места игры)
   ============================================================

   import { gameServices } from "../services/GameServicesManager";

   // --- При старте игры ---
   await gameServices.init();

   // --- Игрок выбрал корабль "Falcon", скин "Red", получил ачивку "first_win" ---
   await gameServices.saveProgress({
     achievements: ["first_win"],
     selectedShip: "falcon",
     selectedSkin: "red",
   });

   // --- Отправить результат 1500 очков и вывести ТОП-10 в консоль ---
   await gameServices.submitScore(1500);           // ник подставится сам ("Player_1234")
   const top10 = await gameServices.getLeaderboard(10);
   top10.forEach((entry, i) => {
     console.log(`${i + 1}. ${entry.playerName} — ${entry.score}`);
   });

   // --- Явно задать ник игрока ---
   await gameServices.submitScore(1500, "NeoVector");
   ============================================================ */
