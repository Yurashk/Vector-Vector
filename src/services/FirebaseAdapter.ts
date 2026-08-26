// ============================================================
// FirebaseAdapter — реализация ICloudService поверх Firebase.
//
// ВСЕ данные игрока хранятся в одной коллекции:
//   players/{userId} -> {
//     achievements, selectedShip, selectedSkin, playerName,
//     stationLevels, coins, blueprints, lastBpTimestamp,
//     customization: { selectedModelId, selectedPaletteId,
//                      unlockedModels[], unlockedPalettes[] }
//   }
//   leaderboard/{userId} -> { userId, playerName, score, updatedAt }
//
// localStorage используется ТОЛЬКО как fallback-кэш для оффлайна:
//   vv-user-id, vv-player-name, game_coins, game_blueprints,
//   game_bp_ts, game_station, vv_customization
// ============================================================

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  getDocs,
  runTransaction,
} from "firebase/firestore";
import type {
  ICloudService,
  LeaderboardEntry,
  ProgressData,
  UserData,
} from "./ICloudService";

const firebaseConfig = {
  apiKey: "AIzaSyC1mPiiF75lt2Uo4KRfnCsrN2eqO5oNoIM",
  authDomain: "vector-vector.firebaseapp.com",
  projectId: "vector-vector",
  storageBucket: "vector-vector.firebasestorage.app",
  messagingSenderId: "808404194991",
  appId: "1:808404194991:web:60e83713c8ca673f3ce65a",
};

const LOCAL_USER_KEY = "vv-user-id";
const LOCAL_NAME_KEY = "vv-player-name";

function generateLocalUserId(): string {
  return "local-" + Math.random().toString(36).slice(2, 10);
}

export class FirebaseAdapter implements ICloudService {
  private userId: string = "";
  private playerName: string = "";
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const app = initializeApp(firebaseConfig);

    // Анонимная авторизация. Если она не включена в консоли Firebase
    // или сеть недоступна — падаем на локальный userId из localStorage,
    // чтобы игра продолжала работать без облака.
    let user: User | null = null;
    try {
      const auth = getAuth(app);
      const credential = await signInAnonymously(auth);
      user = credential.user;
    } catch (e) {
      console.warn("[Firebase] Anonymous auth failed, using local id:", e);
    }

    this.userId = user?.uid ?? this.restoreLocalUserId();
    this.playerName = this.restorePlayerName();
  }

  /** uid анонимной авторизации или локальный id (если авторизация не удалась) */
  getUserId(): string {
    return this.userId;
  }

  // ─── saveProgress: пишет в players/{userId} ─────────────────

  async saveProgress(data: ProgressData): Promise<void> {
    await this.ensureReady();
    const db = getFirestore();

    // Формируем объект для записи — только определённые поля,
    // чтобы не затереть существующие данные при merge.
    const update: Record<string, unknown> = {
      playerName: this.playerName,
    };

    if (data.achievements) update.achievements = data.achievements;
    if (data.selectedShip) update.selectedShip = data.selectedShip;
    if (data.selectedSkin) update.selectedSkin = data.selectedSkin;
    if (data.stationLevels) update.stationLevels = data.stationLevels;
    if (typeof data.coins === "number") update.coins = data.coins;
    if (typeof data.blueprints === "number") update.blueprints = data.blueprints;
    if (typeof data.lastBpTimestamp === "number") update.lastBpTimestamp = data.lastBpTimestamp;
    if (data.customization) update.customization = data.customization;

    await setDoc(doc(db, "players", this.userId), update, { merge: true });
  }

  // ─── loadProgress: читает players/{userId} ──────────────────

  async loadProgress(): Promise<ProgressData | null> {
    await this.ensureReady();
    const db = getFirestore();
    const snap = await getDoc(doc(db, "players", this.userId));
    if (!snap.exists()) return null;

    const d = snap.data();

    // Извлекаем ник, если есть
    if (typeof d.playerName === "string") {
      this.playerName = d.playerName;
      this.storePlayerName(this.playerName);
    }

    return {
      achievements: Array.isArray(d.achievements) ? d.achievements : [],
      selectedShip: String(d.selectedShip ?? ""),
      selectedSkin: String(d.selectedSkin ?? ""),
      stationLevels: d.stationLevels,
      coins: typeof d.coins === "number" ? d.coins : undefined,
      blueprints: typeof d.blueprints === "number" ? d.blueprints : undefined,
      lastBpTimestamp: typeof d.lastBpTimestamp === "number" ? d.lastBpTimestamp : undefined,
      customization: d.customization
        ? {
            selectedModelId: String(d.customization.selectedModelId ?? "scout"),
            selectedPaletteId: String(d.customization.selectedPaletteId ?? "cyan"),
            unlockedModels: Array.isArray(d.customization.unlockedModels)
              ? d.customization.unlockedModels
              : ["scout"],
            unlockedPalettes: Array.isArray(d.customization.unlockedPalettes)
              ? d.customization.unlockedPalettes
              : ["cyan"],
          }
        : undefined,
    };
  }

  // ─── submitScore: лидерборд ────────────────────────────────

  async submitScore(score: number, playerName?: string): Promise<void> {
    await this.ensureReady();

    if (playerName) {
      this.playerName = playerName;
      this.storePlayerName(playerName);
    }
    if (!this.playerName) {
      this.playerName =
        localStorage.getItem(LOCAL_NAME_KEY) ??
        "Player_" + Math.floor(1000 + Math.random() * 9000);
      this.storePlayerName(this.playerName);
    }

    const db = getFirestore();
    const ref = doc(db, "leaderboard", this.userId);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const best = snap.exists() ? Number(snap.data().score ?? 0) : -1;
      if (score > best) {
        tx.set(ref, {
          userId: this.userId,
          playerName: this.playerName,
          score,
          updatedAt: serverTimestamp(),
        });
      }
    });
  }

  async getLeaderboard(limitCount: number): Promise<LeaderboardEntry[]> {
    await this.ensureReady();
    const db = getFirestore();
    const q = query(
      collection(db, "leaderboard"),
      orderBy("score", "desc"),
      limit(limitCount),
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        userId: String(data.userId ?? d.id),
        playerName: String(data.playerName ?? "Player"),
        score: Number(data.score ?? 0),
        updatedAt: data.updatedAt?.toMillis?.(),
      };
    });
  }

  // ─── saveUserData: пишет в players/{userId} ────────────────

  async saveUserData(data: UserData): Promise<void> {
    await this.ensureReady();
    const db = getFirestore();

    // Конвертируем UserData в формат players/{userId}
    const update: Record<string, unknown> = {
      playerName: this.playerName,
      coins: data.currencies.credits,
      blueprints: data.currencies.blueprints,
      lastBpTimestamp: data.currencies.lastBpTimestamp,
      stationLevels: data.station,
      customization: data.customization,
    };

    await setDoc(doc(db, "players", this.userId), update, { merge: true });
  }

  // ─── loadUserData: читает players/{userId} ─────────────────

  async loadUserData(): Promise<UserData | null> {
    await this.ensureReady();
    const db = getFirestore();
    const snap = await getDoc(doc(db, "players", this.userId));
    if (!snap.exists()) return null;

    const d = snap.data();

    // Извлекаем ник
    if (typeof d.playerName === "string") {
      this.playerName = d.playerName;
      this.storePlayerName(this.playerName);
    }

    const customization = d.customization;

    return {
      currencies: {
        credits: Number(d.coins ?? 0),
        blueprints: Number(d.blueprints ?? 0),
        lastBpTimestamp: Number(d.lastBpTimestamp ?? 0),
      },
      station: (d.stationLevels as Record<string, number>) ?? {},
      inventory: {
        equippedShip: String(d.selectedShip ?? ""),
        unlockedSkins: Array.isArray(customization?.unlockedModels)
          ? customization.unlockedModels
          : [],
      },
      customization: {
        selectedModelId: String(customization?.selectedModelId ?? "scout"),
        selectedPaletteId: String(customization?.selectedPaletteId ?? "cyan"),
        unlockedModels: Array.isArray(customization?.unlockedModels)
          ? customization.unlockedModels
          : ["scout"],
        unlockedPalettes: Array.isArray(customization?.unlockedPalettes)
          ? customization.unlockedPalettes
          : ["cyan"],
      },
    };
  }

  // ─── unlockModel: атомарная транзакция в players/{userId} ──

  async unlockModel(modelId: string, priceCR: number): Promise<boolean> {
    await this.ensureReady();
    const db = getFirestore();
    const ref = doc(db, "players", this.userId);
    try {
      return await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const d = snap.exists() ? snap.data() : {};
        const cr = Number(d.coins ?? 0);
        const customization = d.customization ?? {};
        const models: string[] = Array.isArray(customization.unlockedModels)
          ? customization.unlockedModels
          : ["scout"];
        if (models.includes(modelId)) return true;
        if (cr < priceCR) return false;
        tx.set(ref, {
          coins: cr - priceCR,
          customization: { unlockedModels: [...models, modelId] },
        }, { merge: true });
        return true;
      });
    } catch {
      return false;
    }
  }

  // ─── unlockPalette: атомарная транзакция в players/{userId} ─

  async unlockPalette(paletteId: string, priceBP: number): Promise<boolean> {
    await this.ensureReady();
    const db = getFirestore();
    const ref = doc(db, "players", this.userId);
    try {
      return await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const d = snap.exists() ? snap.data() : {};
        const bp = Number(d.blueprints ?? 0);
        const customization = d.customization ?? {};
        const palettes: string[] = Array.isArray(customization.unlockedPalettes)
          ? customization.unlockedPalettes
          : ["cyan"];
        if (palettes.includes(paletteId)) return true;
        if (bp < priceBP) return false;
        tx.set(ref, {
          blueprints: bp - priceBP,
          customization: { unlockedPalettes: [...palettes, paletteId] },
        }, { merge: true });
        return true;
      });
    } catch {
      return false;
    }
  }

  // ─── equipCustomization: обновляет players/{userId} ─────────

  async equipCustomization(modelId: string, paletteId: string): Promise<void> {
    await this.ensureReady();
    const db = getFirestore();
    await setDoc(doc(db, "players", this.userId), {
      selectedShip: modelId,
      selectedSkin: modelId,
      customization: {
        selectedModelId: modelId,
        selectedPaletteId: paletteId,
      },
    }, { merge: true });
  }

  // ─── updateBlueprintsToCloud: обновляет BP в players/{userId} ─

  async updateBlueprintsToCloud(blueprints: number, lastBpTimestamp: number): Promise<void> {
    await this.ensureReady();
    const db = getFirestore();
    await setDoc(doc(db, "players", this.userId), {
      blueprints,
      lastBpTimestamp,
    }, { merge: true });
  }

  // ─── Внутренние методы ──────────────────────────────────────

  /** Гарантирует, что init() был вызван перед любой операцией */
  private async ensureReady(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private restoreLocalUserId(): string {
    try {
      let id = localStorage.getItem(LOCAL_USER_KEY);
      if (!id) {
        id = generateLocalUserId();
        localStorage.setItem(LOCAL_USER_KEY, id);
      }
      return id;
    } catch {
      return generateLocalUserId();
    }
  }

  private restorePlayerName(): string {
    try {
      return localStorage.getItem(LOCAL_NAME_KEY) ?? "";
    } catch {
      return "";
    }
  }

  private storePlayerName(name: string): void {
    try {
      localStorage.setItem(LOCAL_NAME_KEY, name);
    } catch {
      /* localStorage недоступен — ник живёт только в памяти */
    }
  }
}
