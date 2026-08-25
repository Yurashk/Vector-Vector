// ============================================================
// FirebaseAdapter — реализация ICloudService поверх Firebase.
//
// Структура данных в Firestore:
//   players/{userId}     -> { achievements, selectedShip, selectedSkin, playerName }
//   leaderboard/{userId} -> { userId, playerName, score, updatedAt }
//
// Документ лидерборда ключуется по userId: один игрок — одна запись
// с его личным рекордом (защита от спама дублями).
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

  async saveProgress(data: ProgressData): Promise<void> {
    await this.ensureReady();
    const db = getFirestore();
    await setDoc(
      doc(db, "players", this.userId),
      { ...data, playerName: this.playerName },
      { merge: true },
    );
  }

  async loadProgress(): Promise<ProgressData | null> {
    await this.ensureReady();
    const db = getFirestore();
    const snap = await getDoc(doc(db, "players", this.userId));
    if (!snap.exists()) return null;

    // В документе игрока также хранится playerName
    const data = snap.data() as Partial<ProgressData> & {
      playerName?: string;
    };
    if (typeof data.playerName === "string") {
      this.playerName = data.playerName;
      this.storePlayerName(this.playerName);
    }
    return {
      achievements: data.achievements ?? [],
      selectedShip: data.selectedShip ?? "",
      selectedSkin: data.selectedSkin ?? "",
      stationLevels: data.stationLevels,
      coins: data.coins,
    };
  }

  async submitScore(score: number, playerName?: string): Promise<void> {
    await this.ensureReady();

    if (playerName) {
      this.playerName = playerName;
      this.storePlayerName(playerName);
    }
    if (!this.playerName) {
      // Автоматический ник: Player_ + 4 случайные цифры
      this.playerName =
        localStorage.getItem(LOCAL_NAME_KEY) ??
        "Player_" + Math.floor(1000 + Math.random() * 9000);
      this.storePlayerName(this.playerName);
    }

    const db = getFirestore();
    const ref = doc(db, "leaderboard", this.userId);

    // Транзакция: обновляем запись только если новый результат лучше,
    // чтобы лидерборд всегда хранил личный рекорд игрока.
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

  // --- Данные пользователя (Firestore: users/{userId}) ---

  async saveUserData(data: UserData): Promise<void> {
    await this.ensureReady();
    const db = getFirestore();
    await setDoc(doc(db, "users", this.userId), data, { merge: true });
  }

  async loadUserData(): Promise<UserData | null> {
    await this.ensureReady();
    const db = getFirestore();
    const snap = await getDoc(doc(db, "users", this.userId));
    if (!snap.exists()) return null;

    const d = snap.data();
    return {
      currencies: {
        credits: Number(d.currencies?.credits ?? 0),
        blueprints: Number(d.currencies?.blueprints ?? 0),
      },
      station: (d.station as Record<string, number>) ?? {},
      inventory: {
        equippedShip: String(d.inventory?.equippedShip ?? ""),
        unlockedSkins: Array.isArray(d.inventory?.unlockedSkins)
          ? d.inventory.unlockedSkins
          : [],
      },
    };
  }

  // --- Внутренние методы ---

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
