// ============================================================
// Garage — данные моделей кораблей (Hulls) и неоновых палитр.
// Hulls используют геометрию из spaceship-skins.ts.
// Palettes — наборы {primary, accent, glow} цветов.
// ============================================================

import { getSkinById } from "./spaceship-skins";
import type { GeoPart } from "./spaceship-skins";

// --- МОДЕЛИ КОРАБЛЕЙ (Hulls) ---

export interface HullDef {
  id: string;
  name: string;
  description: string;
  priceCR: number;
  requiredDesignLevel: number;
  parts: GeoPart[];
}

const HULLS_RAW: Array<Omit<HullDef, "parts">> = [
  {
    id: "scout",
    name: "Scout",
    description: "Fast recon ship with sharp nose and swept wings",
    priceCR: 0,
    requiredDesignLevel: 0,
  },
  {
    id: "spectre",
    name: "Spectre",
    description: "Phantom-class interceptor with fang-like nose and honeycomb exhaust",
    priceCR: 800,
    requiredDesignLevel: 1,
  },
  {
    id: "interceptor",
    name: "Interceptor",
    description: "Agile fighter with delta wings and engine pods",
    priceCR: 500,
    requiredDesignLevel: 1,
  },
  {
    id: "dreadnought",
    name: "Dreadnought",
    description: "Heavy assault cruiser with broadside modules",
    priceCR: 1500,
    requiredDesignLevel: 2,
  },
];

export function getHulls(): HullDef[] {
  return HULLS_RAW.map((h) => ({
    ...h,
    parts: getSkinById(h.id).parts,
  }));
}

// --- НЕОНОВЫЕ ПАЛИТРЫ (Цвета) ---

export interface PaletteDef {
  id: string;
  name: string;
  priceBP: number;
  requiredDesignLevel: number;
  primary: number;
  accent: number;
  glow: number;
}

export const PALETTES: PaletteDef[] = [
  {
    id: "cyan",
    name: "Default Cyan",
    priceBP: 0,
    requiredDesignLevel: 0,
    primary: 0x00d8ff,
    accent: 0xffffff,
    glow: 0x00f3ff,
  },
  {
    id: "neon-pink",
    name: "Hotline",
    priceBP: 80,
    requiredDesignLevel: 0,
    primary: 0xff2d95,
    accent: 0xffffff,
    glow: 0xff0077,
  },
  {
    id: "acid",
    name: "Toxic Acid",
    priceBP: 120,
    requiredDesignLevel: 1,
    primary: 0x00ff88,
    accent: 0xb3ffd9,
    glow: 0x00ff00,
  },
  {
    id: "solar",
    name: "Solar Gold",
    priceBP: 200,
    requiredDesignLevel: 2,
    primary: 0xffaa00,
    accent: 0xffffff,
    glow: 0xff5500,
  },
  {
    id: "void",
    name: "Void Violet",
    priceBP: 350,
    requiredDesignLevel: 3,
    primary: 0x9d00ff,
    accent: 0xe0b3ff,
    glow: 0xe000ff,
  },
];

// --- Состояние кастомизации (хранится в localStorage + Firestore) ---

export interface CustomizationData {
  selectedModelId: string;
  selectedPaletteId: string;
  unlockedModels: string[];
  unlockedPalettes: string[];
}

const STORAGE_KEY = "vv_customization";

const DEFAULT_CUSTOM: CustomizationData = {
  selectedModelId: "scout",
  selectedPaletteId: "cyan",
  unlockedModels: ["scout"],
  unlockedPalettes: ["cyan"],
};

export function loadCustomization(): CustomizationData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CUSTOM };
    const parsed = JSON.parse(raw) as Partial<CustomizationData>;
    return {
      selectedModelId: parsed.selectedModelId ?? DEFAULT_CUSTOM.selectedModelId,
      selectedPaletteId: parsed.selectedPaletteId ?? DEFAULT_CUSTOM.selectedPaletteId,
      unlockedModels: parsed.unlockedModels ?? DEFAULT_CUSTOM.unlockedModels,
      unlockedPalettes: parsed.unlockedPalettes ?? DEFAULT_CUSTOM.unlockedPalettes,
    };
  } catch {
    return { ...DEFAULT_CUSTOM };
  }
}

export function saveCustomization(data: CustomizationData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* память недоступна */
  }
}

export function isModelUnlocked(modelId: string): boolean {
  return loadCustomization().unlockedModels.includes(modelId);
}

export function isPaletteUnlocked(paletteId: string): boolean {
  return loadCustomization().unlockedPalettes.includes(paletteId);
}

export function unlockModelLocal(modelId: string): void {
  const data = loadCustomization();
  if (!data.unlockedModels.includes(modelId)) {
    data.unlockedModels.push(modelId);
    saveCustomization(data);
  }
}

export function unlockPaletteLocal(paletteId: string): void {
  const data = loadCustomization();
  if (!data.unlockedPalettes.includes(paletteId)) {
    data.unlockedPalettes.push(paletteId);
    saveCustomization(data);
  }
}

export function equipModelLocal(modelId: string): void {
  const data = loadCustomization();
  data.selectedModelId = modelId;
  saveCustomization(data);
}

export function equipPaletteLocal(paletteId: string): void {
  const data = loadCustomization();
  data.selectedPaletteId = paletteId;
  saveCustomization(data);
}
