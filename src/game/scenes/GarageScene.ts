import * as Phaser from "phaser";
import { gameServices } from "../../services/GameServicesManager";
import {
  COLOR_BG,
  COLOR_CYAN,
  COLOR_GOLD,
  COLOR_DARK_PANEL,
  COLOR_PINK,
  COLOR_PURPLE,
  GameState,
  drawGrid,
  drawNeonPlate,
  drawSciFiIcon,
} from "../ui/NeonUI";
import { CoinPlate } from "../ui/CoinPlate";
import {
  type HullDef,
  type PaletteDef,
  getHulls,
  PALETTES,
  type CustomizationData,
  loadCustomization,
  saveCustomization,
  equipModelLocal,
  equipPaletteLocal,
} from "../garage-data";
import { getSkinById, selectSkin } from "../spaceship-skins";
import { NeonShipRenderer } from "../NeonShipRenderer";
import type { UserData } from "../../services/ICloudService";

const FONT = 'Consolas, "Courier New", monospace';

function toHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

interface ModalCtx {
  type: "hull" | "palette";
  item: HullDef | PaletteDef;
}

export class GarageScene extends Phaser.Scene {
  private crPlate!: CoinPlate;
  private bpPlate!: CoinPlate;
  private shipGfx!: Phaser.GameObjects.Graphics;
  private gridGraphics!: Phaser.GameObjects.Graphics;

  private userData: CustomizationData = loadCustomization();
  private credits = 0;
  private blueprints = 0;
  private designLevel = 0;
  private isPurchasing = false;

  private hulls: HullDef[] = getHulls();
  private palettes: PaletteDef[] = PALETTES;

  private cardW = 65;
  private cardH = 75;
  private cardGap = 6;

  private skinRow: Phaser.GameObjects.Container[] = [];
  private paletteRow: Phaser.GameObjects.Container[] = [];
  private modalContainer: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: "Garage" });
  }

  create(): void {
    GameState.syncBlueprints();
    void gameServices.updateBlueprintsToCloud(
      GameState.getBlueprints(),
      GameState.getLastBpTimestamp(),
    );
    this.credits = GameState.getCoins();
    this.blueprints = GameState.getBlueprints();
    this.designLevel = GameState.getStation().design;

    const { width: w, height: h } = this.scale;
    this.computeLayout(w);

    this.cameras.main.setBackgroundColor(COLOR_BG);
    this.gridGraphics = this.add.graphics();
    drawGrid(this.gridGraphics, w, h);

    /* 1. Валюты */
    this.crPlate = new CoinPlate(this, 70, 22, this.credits, "CR");
    this.bpPlate = new CoinPlate(this, w - 70, 22, this.blueprints, "BP");

    /* 2. Design Level */
    this.drawDesignLevelCard(w, 54);

    /* 3. Превью */
    this.shipGfx = this.add.graphics();
    this.shipGfx.setPosition(w / 2, h * 0.24);
    this.tweens.add({
      targets: this.shipGfx,
      y: "-=5",
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    /* 4. SKINS */
    this.add
      .text(16, h * 0.42, "SKINS", {
        fontFamily: FONT,
        fontSize: "11px",
        color: toHex(COLOR_CYAN),
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.buildSkinRow(w, h * 0.50);

    /* 5. PALETTES */
    this.add
      .text(16, h * 0.62, "PALETTES", {
        fontFamily: FONT,
        fontSize: "11px",
        color: toHex(COLOR_PINK),
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.buildPaletteRow(w, h * 0.70);

    /* 6. BACK */
    this.createBackButton(w / 2, h - 30);

    this.updatePreview();
    this.loadFirebaseData();
  }

  private computeLayout(w: number): void {
    const maxW = w - 24;
    const count = this.palettes.length;
    this.cardGap = 6;
    this.cardW = Math.min(70, Math.floor((maxW - (count - 1) * this.cardGap) / count));
    this.cardH = Math.round(this.cardW * 1.15);
  }

  /* ─── Design Level Card ─────────────────────────────────── */

  private drawDesignLevelCard(w: number, y: number): void {
    const bpRate = GameState.BP_RATES[this.designLevel] ?? 0;
    const cardW = 220;
    const cardH = 28;

    const plateG = this.add.graphics();
    plateG.setPosition(w / 2, y);
    drawNeonPlate(plateG, cardW, cardH, COLOR_PURPLE, 12, 0.7);

    const iconG = this.add.graphics();
    iconG.setPosition(w / 2 - 80, y);
    drawSciFiIcon(iconG, "design", COLOR_PURPLE, 7);

    this.add
      .text(w / 2 - 66, y, `DESIGN LV.${this.designLevel}`, {
        fontFamily: FONT,
        fontSize: "11px",
        color: toHex(COLOR_PURPLE),
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    if (bpRate > 0) {
      this.add
        .text(w / 2 + 38, y, `+${bpRate} BP/H`, {
          fontFamily: FONT,
          fontSize: "10px",
          color: toHex(COLOR_PINK),
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
    }
  }

  /* ─── Rows ──────────────────────────────────────────────── */

  private buildSkinRow(w: number, y: number): void {
    this.skinRow.forEach((c) => c.destroy(true));
    this.skinRow = [];

    const totalW = this.hulls.length * this.cardW + (this.hulls.length - 1) * this.cardGap;
    let x = (w - totalW) / 2 + this.cardW / 2;

    this.hulls.forEach((hull) => {
      const isOwned = this.userData.unlockedModels.includes(hull.id);
      const isSelected = this.userData.selectedModelId === hull.id;
      const meetsLevel = hull.requiredDesignLevel <= this.designLevel;
      const card = this.makeCard(x, y, hull, "hull", isOwned, isSelected, meetsLevel);
      this.skinRow.push(card);
      x += this.cardW + this.cardGap;
    });
  }

  private buildPaletteRow(w: number, y: number): void {
    this.paletteRow.forEach((c) => c.destroy(true));
    this.paletteRow = [];

    const totalW = this.palettes.length * this.cardW + (this.palettes.length - 1) * this.cardGap;
    let x = (w - totalW) / 2 + this.cardW / 2;

    this.palettes.forEach((pal) => {
      const isOwned = this.userData.unlockedPalettes.includes(pal.id);
      const isSelected = this.userData.selectedPaletteId === pal.id;
      const meetsLevel = pal.requiredDesignLevel <= this.designLevel;
      const card = this.makeCard(x, y, pal, "palette", isOwned, isSelected, meetsLevel);
      this.paletteRow.push(card);
      x += this.cardW + this.cardGap;
    });
  }

  /* ─── Card Factory ──────────────────────────────────────── */

  private makeCard(
    x: number,
    y: number,
    item: HullDef | PaletteDef,
    type: "hull" | "palette",
    isOwned: boolean,
    isSelected: boolean,
    meetsLevel: boolean,
  ): Phaser.GameObjects.Container {
    const children: Phaser.GameObjects.GameObject[] = [];

    // BG
    const bg = this.add.graphics();
    const border = isSelected ? COLOR_CYAN : meetsLevel ? 0x444466 : 0x333344;
    const bAlpha = isSelected ? 1 : meetsLevel ? 0.6 : 0.3;
    bg.fillStyle(isSelected ? 0x1a1a3e : COLOR_DARK_PANEL, 0.9);
    bg.fillRoundedRect(-this.cardW / 2, -this.cardH / 2, this.cardW, this.cardH, 6);
    bg.lineStyle(1.5, border, bAlpha);
    bg.strokeRoundedRect(-this.cardW / 2, -this.cardH / 2, this.cardW, this.cardH, 6);
    children.push(bg);

    // Icon
    if (!meetsLevel) {
      children.push(
        this.add
          .text(0, -10, `Lv.${item.requiredDesignLevel}`, {
            fontFamily: FONT,
            fontSize: "10px",
            color: "#ff4444",
            fontStyle: "bold",
          })
          .setOrigin(0.5),
      );
    } else if (type === "hull") {
      const hull = item as HullDef;
      const pal = this.getActivePalette();
      const skin = {
        ...getSkinById(hull.id),
        primaryColor: pal.primary,
        accentColor: pal.accent,
        glowColor: pal.glow,
        gapSize: 1,
        parts: hull.parts,
      };
      const miniG = this.add.graphics();
      NeonShipRenderer.updateSkin(miniG, skin, Math.round(this.cardW * 0.45));
      miniG.setPosition(0, -8);
      children.push(miniG);
    } else {
      const pal = item as PaletteDef;
      const sw = this.add.graphics();
      sw.fillStyle(pal.primary, 0.4);
      sw.fillCircle(0, -8, this.cardW * 0.22);
      sw.lineStyle(1.5, pal.glow, 1);
      sw.strokeCircle(0, -8, this.cardW * 0.22);
      sw.fillStyle(pal.glow, 1);
      sw.fillCircle(0, -8, 3);
      children.push(sw);
    }

    // Status
    if (isSelected) {
      children.push(
        this.add
          .text(0, 18, "\u2713", {
            fontFamily: FONT,
            fontSize: "13px",
            color: "#00ff88",
            fontStyle: "bold",
          })
          .setOrigin(0.5),
      );
    } else if (!isOwned && meetsLevel) {
      const label =
        type === "hull"
          ? `${(item as HullDef).priceCR} CR`
          : `${(item as PaletteDef).priceBP} BP`;
      children.push(
        this.add
          .text(0, 18, label, {
            fontFamily: FONT,
            fontSize: "9px",
            color: "#ffffff",
            fontStyle: "bold",
          })
          .setOrigin(0.5),
      );
    }

    // Name
    children.push(
      this.add
        .text(0, this.cardH / 2 - 8, item.name, {
          fontFamily: FONT,
          fontSize: "8px",
          color: meetsLevel ? "#888899" : "#444455",
          fontStyle: "bold",
        })
        .setOrigin(0.5),
    );

    const container = this.add.container(x, y, children);
    container.setSize(this.cardW, this.cardH);
    container.setInteractive({ useHandCursor: true });

    container.on("pointerdown", () => {
      this.onCardClick(type, item, isOwned, isSelected, meetsLevel);
    });

    return container;
  }

  /* ─── Click ─────────────────────────────────────────────── */

  private onCardClick(
    type: "hull" | "palette",
    item: HullDef | PaletteDef,
    isOwned: boolean,
    isSelected: boolean,
    meetsLevel: boolean,
  ): void {
    if (isSelected) return;
    if (isOwned) {
      this.applyItem(type, item);
      return;
    }
    if (!meetsLevel) return;
    this.showPurchaseModal(type, item);
  }

  private applyItem(type: "hull" | "palette", item: HullDef | PaletteDef): void {
    if (type === "hull") {
      this.userData.selectedModelId = item.id;
      equipModelLocal(item.id);
      selectSkin(item.id);
    } else {
      this.userData.selectedPaletteId = item.id;
      equipPaletteLocal(item.id);
    }
    saveCustomization(this.userData);

    void gameServices.equipCustomization(
      this.userData.selectedModelId,
      this.userData.selectedPaletteId,
    );

    this.refreshCards();
  }

  /* ─── Modal ─────────────────────────────────────────────── */

  private showPurchaseModal(type: "hull" | "palette", item: HullDef | PaletteDef): void {
    if (this.modalContainer) return;

    const { width: w, height: h } = this.scale;
    const ctx: ModalCtx = { type, item };

    this.modalContainer = this.add.container(0, 0).setDepth(100);

    // Overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, w, h);
    overlay.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    this.modalContainer.add(overlay);

    // Card plate
    const cardW = 280;
    const cardH = 210;
    const cy = (h - cardH) / 2;

    const plate = this.add.graphics();
    plate.setPosition(w / 2, cy + cardH / 2);
    // Тёмная заливка + неоновая рамка (вручную, т.к. drawNeonPlate не поддерживает разные цвета fill/border)
    plate.fillStyle(0x0a0a1e, 0.95);
    plate.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
    plate.lineStyle(8, COLOR_CYAN, 0.08);
    plate.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
    plate.lineStyle(4, COLOR_CYAN, 0.2);
    plate.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
    plate.lineStyle(1.8, COLOR_CYAN, 0.9);
    plate.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
    this.modalContainer.add(plate);

    // Preview icon
    if (type === "hull") {
      const hull = item as HullDef;
      const pal = this.getActivePalette();
      const skin = {
        ...getSkinById(hull.id),
        primaryColor: pal.primary,
        accentColor: pal.accent,
        glowColor: pal.glow,
        gapSize: 1,
        parts: hull.parts,
      };
      const icon = this.add.graphics();
      NeonShipRenderer.updateSkin(icon, skin, 55);
      icon.setPosition(w / 2, cy + 40);
      this.modalContainer.add(icon);
    } else {
      const pal = item as PaletteDef;
      const icon = this.add.graphics();
      icon.fillStyle(pal.primary, 0.5);
      icon.fillCircle(0, 0, 20);
      icon.lineStyle(2, pal.glow, 1);
      icon.strokeCircle(0, 0, 20);
      icon.fillStyle(pal.glow, 1);
      icon.fillCircle(0, 0, 6);
      icon.setPosition(w / 2, cy + 40);
      this.modalContainer.add(icon);
    }

    // Name
    this.modalContainer.add(
      this.add
        .text(w / 2, cy + 72, item.name, {
          fontFamily: FONT,
          fontSize: "14px",
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5),
    );

    // Price
    const isHull = type === "hull";
    const priceNum = isHull ? (item as HullDef).priceCR : (item as PaletteDef).priceBP;
    const curLabel = isHull ? "CR" : "BP";
    const canAfford = isHull ? this.credits >= priceNum : this.blueprints >= priceNum;

    this.modalContainer.add(
      this.add
        .text(w / 2, cy + 98, `${priceNum} ${curLabel}`, {
          fontFamily: FONT,
          fontSize: "13px",
          color: canAfford ? (isHull ? toHex(COLOR_GOLD) : toHex(COLOR_PINK)) : "#ff4444",
          fontStyle: "bold",
        })
        .setOrigin(0.5),
    );

    // Level hint
    this.modalContainer.add(
      this.add
        .text(w / 2, cy + 118, `Design Lv.${item.requiredDesignLevel} required`, {
          fontFamily: FONT,
          fontSize: "9px",
          color: "#666688",
          fontStyle: "bold",
        })
        .setOrigin(0.5),
    );

    // BUY
    this.modalContainer.add(
      this.modalBtn(w / 2, cy + 148, "BUY", canAfford ? COLOR_GOLD : 0x555566,
        canAfford ? 0x332200 : 0x222233, canAfford ? () => this.executePurchase(ctx) : undefined),
    );

    // CLOSE
    this.modalContainer.add(
      this.modalBtn(w / 2, cy + 178, "CLOSE", COLOR_CYAN, 0x002233,
        () => this.closeModal()),
    );
  }

  private modalBtn(
    x: number,
    y: number,
    label: string,
    color: number,
    bg: number,
    cb?: () => void,
  ): Phaser.GameObjects.Container {
    const bw = 160;
    const bh = 24;

    const g = this.add.graphics();
    g.fillStyle(bg, 0.9);
    g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 6);
    g.lineStyle(1.5, color, 0.9);
    g.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 6);

    const txt = this.add
      .text(0, 0, label, {
        fontFamily: FONT,
        fontSize: "11px",
        color: toHex(color),
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const btn = this.add.container(x, y, [g, txt]);
    btn.setSize(bw, bh);

    if (cb) {
      btn.setInteractive({ useHandCursor: true });
      btn.on("pointerdown", () => {
        this.tweens.add({ targets: btn, scale: 0.95, duration: 60 });
        cb();
      });
      btn.on("pointerup", () => {
        this.tweens.add({ targets: btn, scale: 1, duration: 80 });
      });
    } else {
      txt.setAlpha(0.4);
    }

    return btn;
  }

  private closeModal(): void {
    if (!this.modalContainer) return;
    this.modalContainer.destroy(true);
    this.modalContainer = null;
  }

  /* ─── Purchase ──────────────────────────────────────────── */

  private async executePurchase(ctx: ModalCtx): Promise<void> {
    if (this.isPurchasing) return;
    this.isPurchasing = true;

    try {
      if (ctx.type === "hull") {
        const hull = ctx.item as HullDef;
        if (this.credits < hull.priceCR) return;

        this.credits -= hull.priceCR;
        GameState.addCoins(-hull.priceCR);
        this.userData.unlockedModels.push(hull.id);
        saveCustomization(this.userData);
        this.crPlate.setAmount(this.credits);

        this.userData.selectedModelId = hull.id;
        equipModelLocal(hull.id);
        selectSkin(hull.id);

        void gameServices.unlockModel(hull.id, hull.priceCR).catch(() => {});
        void gameServices.equipCustomization(
          this.userData.selectedModelId,
          this.userData.selectedPaletteId,
        );
      } else {
        const pal = ctx.item as PaletteDef;
        if (this.blueprints < pal.priceBP) return;

        this.blueprints -= pal.priceBP;
        GameState.addBlueprints(-pal.priceBP);
        this.userData.unlockedPalettes.push(pal.id);
        saveCustomization(this.userData);
        this.bpPlate.setAmount(this.blueprints);

        this.userData.selectedPaletteId = pal.id;
        equipPaletteLocal(pal.id);

        void gameServices.unlockPalette(pal.id, pal.priceBP).catch(() => {});
        void gameServices.equipCustomization(
          this.userData.selectedModelId,
          this.userData.selectedPaletteId,
        );
      }

      this.closeModal();
      this.refreshCards();
    } finally {
      this.isPurchasing = false;
    }
  }

  /* ─── Preview ───────────────────────────────────────────── */

  private updatePreview(): void {
    this.shipGfx.clear();
    const hull = this.hulls.find((h) => h.id === this.userData.selectedModelId) ?? this.hulls[0];
    const pal = this.getActivePalette();

    const skin = {
      ...getSkinById(hull.id),
      primaryColor: pal.primary,
      accentColor: pal.accent,
      glowColor: pal.glow,
      gapSize: 1,
      parts: hull.parts,
    };

    NeonShipRenderer.updateSkin(this.shipGfx, skin, Math.round(this.cardW * 1.6));
  }

  private getActivePalette(): PaletteDef {
    return PALETTES.find((p) => p.id === this.userData.selectedPaletteId) ?? PALETTES[0];
  }

  /* ─── Refresh cards in-place ─────────────────────────────── */

  private refreshCards(): void {
    this.credits = GameState.getCoins();
    this.blueprints = GameState.getBlueprints();
    this.crPlate.setAmount(this.credits);
    this.bpPlate.setAmount(this.blueprints);

    this.updatePreview();

    const { width: w, height: h } = this.scale;
    this.buildSkinRow(w, h * 0.50);
    this.buildPaletteRow(w, h * 0.70);
  }

  /* ─── Firebase: загрузка с мержем массивов ─────────────────── */

  private async loadFirebaseData(): Promise<void> {
    try {
      const data = await gameServices.loadUserData();
      if (!this.scene.isActive()) return;

      if (data) {
        this.designLevel = data.station.designWingLevel ?? data.station.design ?? 0;

        // --- Валюты: берём максимум из Firestore и localStorage ---
        const cloudCredits = data.currencies.credits;
        const localCredits = GameState.getCoins();
        if (cloudCredits > localCredits) {
          GameState.addCoins(cloudCredits - localCredits);
        }

        // --- BP: сначала ставим таймстамп из облака, потом sync ---
        if (data.currencies.lastBpTimestamp > 0) {
          GameState.setLastBpTimestamp(data.currencies.lastBpTimestamp);
        }
        const cloudBP = data.currencies.blueprints;
        const localBP = GameState.getBlueprints();
        if (cloudBP > localBP) {
          GameState.addBlueprints(cloudBP - localBP);
        }
        GameState.syncBlueprints();
        this.blueprints = GameState.getBlueprints();
        this.credits = GameState.getCoins();

        // --- Кастомизация: мержим массивы (localStorage ∪ Firestore) ---
        const localCustom = loadCustomization();
        const mergedModels = [
          ...new Set([
            ...localCustom.unlockedModels,
            ...(data.customization?.unlockedModels ?? ["scout"]),
          ]),
        ];
        const mergedPalettes = [
          ...new Set([
            ...localCustom.unlockedPalettes,
            ...(data.customization?.unlockedPalettes ?? ["cyan"]),
          ]),
        ];

        this.userData = {
          selectedModelId: data.customization?.selectedModelId ?? localCustom.selectedModelId,
          selectedPaletteId: data.customization?.selectedPaletteId ?? localCustom.selectedPaletteId,
          unlockedModels: mergedModels,
          unlockedPalettes: mergedPalettes,
        };
        saveCustomization(this.userData);
        selectSkin(this.userData.selectedModelId);

        // Обратно в Firestore — если мерж добавил что-то из локала
        void gameServices.saveUserData(this.toUserData()).catch(() => {});
      }
    } catch (e) {
      console.warn("GarageScene: error loading Firebase data", e);
    }

    if (!this.scene.isActive()) return;
    this.crPlate.setAmount(this.credits);
    this.bpPlate.setAmount(this.blueprints);
    this.updatePreview();
  }

  /** Конвертирует текущее состояние в UserData для сохранения в Firestore */
  private toUserData(): UserData {
    return {
      currencies: {
        credits: this.credits,
        blueprints: this.blueprints,
        lastBpTimestamp: GameState.getLastBpTimestamp(),
      },
      station: this.designLevel > 0
        ? { designWingLevel: this.designLevel, design: this.designLevel }
        : {},
      inventory: {
        equippedShip: this.userData.selectedModelId,
        unlockedSkins: this.userData.unlockedModels,
      },
      customization: { ...this.userData },
    };
  }

  /* ─── Back ───────────────────────────────────────────────── */

  private createBackButton(x: number, y: number): void {
    const g = this.add.graphics();
    g.fillStyle(COLOR_DARK_PANEL, 0.8);
    g.fillRoundedRect(-45, -12, 90, 24, 6);
    g.lineStyle(1, COLOR_CYAN, 0.7);
    g.strokeRoundedRect(-45, -12, 90, 24, 6);

    const txt = this.add
      .text(0, 0, "BACK", {
        fontFamily: FONT,
        fontSize: "11px",
        color: "#00f0ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const btn = this.add.container(x, y, [g, txt]);
    btn.setSize(90, 24);
    btn.setInteractive({ useHandCursor: true });

    btn.on("pointerdown", () => {
      this.tweens.add({ targets: btn, scale: 0.95, duration: 60 });
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("MainMenu");
      });
    });
  }
}
