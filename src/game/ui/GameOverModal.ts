import * as Phaser from "phaser";

// --- Палитра киберпанк-модалки ---
const COLOR_DIM = 0x050510;
const COLOR_PANEL = 0x0a0a14;
const COLOR_PINK = "#ff0055";
const COLOR_GOLD = "#ffd700";
const COLOR_GOLD_HEX = 0xffd700;
const COLOR_CYAN = "#00f3ff";
const COLOR_CYAN_HEX = 0x00f3ff;
const MONO_FONT = 'Consolas, "Courier New", monospace';

// Геометрия карточки
const CARD_W = 320;
const CARD_H = 440;

// Вертикальная сетка строк внутри карточки (локальные координаты, центр = 0):
// Title → Record → Stats ×3 → Coins → Restart → Menu
const ROW_TITLE_Y = -196;
const ROW_RECORD_Y = -156;
const ROW_SCORE_Y = -112;
const ROW_BEST_Y = -86;
const ROW_SPEED_Y = -62;
const ROW_COINS_Y = -22;

const BTN_W = 258;
const COIN_BTN_W = 124;
const COIN_GAP = 12;

// Кнопки действий
const RESTART_Y = 58;
const MENU_Y = 118;

let sharedClickCtx: AudioContext | null = null;

/** Короткий неоновый «щелчок» при нажатии кнопок */
function playClickTick(): void {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    sharedClickCtx = sharedClickCtx ?? new Ctx();
    const ctx = sharedClickCtx;
    if (ctx.state === "suspended") void ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1800, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch {
    /* аудио недоступно — тикаем молча */
  }
}

export interface GameOverModalStats {
  score: number;
  best: number;
  isNewRecord: boolean;
  maxSpeedMult: string; // уже отформатировано, например "x1.44"
  coins: number;
}

export interface GameOverModalCallbacks {
  onDoubleCoins?: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

/**
 * Модальное окно Game Over:
 * карточка 320×440 с анимированными счётчиками, центрированным блоком награды,
 * кнопкой возрождения с круговым таймером и микро-анимациями кнопок.
 */
export class GameOverModal {
  private readonly scene: Phaser.Scene;
  private readonly stats: GameOverModalStats;
  private readonly callbacks: GameOverModalCallbacks;

  private root!: Phaser.GameObjects.Container;
  private card!: Phaser.GameObjects.Container;
  private alive = true;

  private coinText?: Phaser.GameObjects.Text;
  private coinsCounter?: Phaser.Tweens.Tween;
  private x2Btn?: Phaser.GameObjects.Container;
  private restartBtn?: Phaser.GameObjects.Container;
  private menuBtn?: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    stats: GameOverModalStats,
    callbacks: GameOverModalCallbacks,
  ) {
    this.scene = scene;
    this.stats = stats;
    this.callbacks = callbacks;

    this.root = scene.add.container(0, 0).setDepth(100);

    // Затемнение игрового фона (перехватывает все клики)
    const width = scene.scale.width;
    const height = scene.scale.height;
    const dim = scene.add
      .rectangle(width / 2, height / 2, width, height, COLOR_DIM, 0.72);
    dim.setInteractive(
      new Phaser.Geom.Rectangle(width / 2, height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    this.root.add(dim);

    // --- Карточка ---
    this.card = scene.add.container(width / 2, height / 2);
    this.card.setScale(0.8);
    this.root.add(this.card);

    const panel = scene.add.graphics();
    panel.fillStyle(COLOR_PANEL, 0.88);
    panel.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 16);
    panel.lineStyle(2, COLOR_CYAN_HEX, 0.9);
    panel.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 16);
    // Внутренний мягкий контур для глубины
    panel.lineStyle(6, COLOR_CYAN_HEX, 0.08);
    panel.strokeRoundedRect(
      -CARD_W / 2 + 8,
      -CARD_H / 2 + 8,
      CARD_W - 16,
      CARD_H - 16,
      12,
    );
    this.card.add(panel);

    this.buildTitle();
    if (stats.isNewRecord && stats.score > 0) {
      this.buildRecordBadge();
    }
    this.buildStats();
    this.buildRewardRow();
    this.buildActionButtons();

    // Появление карточки: scale 0.8 → 1, alpha 0 → 1 за 250мс
    this.card.setAlpha(0);
    scene.tweens.add({
      targets: this.card,
      alpha: 1,
      scale: 1,
      duration: 250,
      ease: "Back.Out",
    });
  }

  // --- Сборка блоков ---

  private buildTitle(): void {
    const title = this.scene.add
      .text(0, ROW_TITLE_Y, "GAME OVER", {
        fontSize: "34px",
        color: COLOR_PINK,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    title.setShadow(0, 0, COLOR_PINK, 14, false, true);
    this.card.add(title);
  }

  private buildRecordBadge(): void {
    const badgeW = 214;
    const badgeH = 26;
    const plate = this.scene.add.graphics();
    plate.fillStyle(COLOR_GOLD_HEX, 0.16);
    plate.fillRoundedRect(
      -badgeW / 2,
      ROW_RECORD_Y - badgeH / 2,
      badgeW,
      badgeH,
      13,
    );
    plate.lineStyle(1.5, COLOR_GOLD_HEX, 0.95);
    plate.strokeRoundedRect(
      -badgeW / 2,
      ROW_RECORD_Y - badgeH / 2,
      badgeW,
      badgeH,
      13,
    );

    const label = this.scene.add
      .text(0, ROW_RECORD_Y, "★ NEW BEST RECORD ★", {
        fontSize: "12px",
        color: COLOR_GOLD,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Мерцание золотом
    this.scene.tweens.add({
      targets: [plate, label],
      alpha: { from: 1, to: 0.45 },
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: "sine.inout",
    });

    this.card.add([plate, label]);
  }

  private buildStats(): void {
    const scoreText = this.scene.add
      .text(0, ROW_SCORE_Y, "SCORE: 0", {
        fontSize: "19px",
        color: "#ffffff",
        fontFamily: MONO_FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const bestText = this.scene.add
      .text(0, ROW_BEST_Y, `BEST: ${this.stats.best}`, {
        fontSize: "15px",
        color: "#9adfff",
        fontFamily: MONO_FONT,
      })
      .setOrigin(0.5);

    const speedText = this.scene.add
      .text(0, ROW_SPEED_Y, `MAX SPEED: ${this.stats.maxSpeedMult}`, {
        fontSize: "13px",
        color: "#aab4cc",
        fontFamily: MONO_FONT,
      })
      .setOrigin(0.5);

    this.card.add([scoreText, bestText, speedText]);

    // SCORE набегает от 0 до финального значения за 1 секунду
    this.scene.tweens.addCounter({
      from: 0,
      to: this.stats.score,
      duration: 1000,
      ease: "Power2",
      onUpdate: (t) => {
        if (!this.alive) return;
        scoreText.setText(`SCORE: ${Math.round(t.getValue() ?? 0)}`);
      },
    });
  }

  /**
   * Блок награды: текст монет слева, кнопка x2 справа, зазор 12px,
   * вся связка строго по центру карточки (X = CARD_W / 2).
   */
  private buildRewardRow(): void {
    this.coinText = this.scene.add.text(0, ROW_COINS_Y, "", {
      fontSize: "17px",
      color: COLOR_GOLD,
      fontFamily: MONO_FONT,
      fontStyle: "bold",
    });
    this.card.add(this.coinText);

    // Кнопка удвоения за просмотр рекламы
    this.x2Btn = this.makeButton({
      w: COIN_BTN_W,
      h: 30,
      fill: COLOR_GOLD_HEX,
      fillAlpha: 0.14,
      stroke: COLOR_GOLD_HEX,
      strokeAlpha: 1,
      radius: 10,
      label: "x2 COINS",
      labelColor: COLOR_GOLD,
      fontSize: "11px",
      withFilmIcon: true,
    });
    this.x2Btn.on("pointerup", () => {
      if (!this.alive) return;
      this.coinsCounter?.stop();
      this.callbacks.onDoubleCoins?.();
    });
    this.card.add(this.x2Btn);

    // Стартовая раскладка строки (счётчик начнёт с +0)
    this.layoutCoinsRow(this.stats.coins);

    // COINS тоже набегают за 1 секунду
    this.coinsCounter = this.scene.tweens.addCounter({
      from: 0,
      to: this.stats.coins,
      duration: 1000,
      ease: "Power2",
      onUpdate: (t) => {
        if (!this.alive || !this.coinText) return;
        this.coinText.setText(`+${Math.round(t.getValue() ?? 0)} COINS`);
      },
    });
  }

  /** Центрирует связку [монеты] +12px [x2 COINS] по горизонтальной оси */
  private layoutCoinsRow(displayCoins: number): void {
    if (!this.coinText || !this.x2Btn) return;

    // Ширину измеряем по финальной сумме — счётчик набегает до неё
    this.coinText.setText(`+${displayCoins} COINS`);
    const coinWidth = this.coinText.width;

    const totalWidth = coinWidth + COIN_GAP + COIN_BTN_W;
    const rowLeft = -totalWidth / 2;

    this.coinText.setPosition(rowLeft, ROW_COINS_Y);
    this.coinText.setOrigin(0, 0.5);
    this.coinText.setText(`+0 COINS`);

    this.x2Btn.setPosition(rowLeft + coinWidth + COIN_GAP + COIN_BTN_W / 2, ROW_COINS_Y);
  }

  private buildActionButtons(): void {
    this.restartBtn = this.makeButton({
      w: BTN_W,
      h: 50,
      fill: COLOR_CYAN_HEX,
      fillAlpha: 0.18,
      stroke: COLOR_CYAN_HEX,
      strokeAlpha: 1,
      strokeWidth: 2,
      radius: 12,
      label: "RESTART",
      labelColor: COLOR_CYAN,
      fontSize: "18px",
    });
    this.restartBtn.setPosition(0, RESTART_Y);
    this.restartBtn.on("pointerup", () => {
      this.callbacks.onRestart();
    });

    this.menuBtn = this.makeButton({
      w: BTN_W,
      h: 38,
      fill: 0x14141f,
      fillAlpha: 0.9,
      stroke: 0x7788aa,
      strokeAlpha: 0.8,
      strokeWidth: 1.5,
      radius: 12,
      label: "MAIN MENU",
      labelColor: "#aabbdd",
      fontSize: "14px",
    });
    this.menuBtn.setPosition(0, MENU_Y);
    this.menuBtn.on("pointerup", () => {
      this.callbacks.onMenu();
    });

    this.card.add([this.restartBtn, this.menuBtn]);
  }

  /** Удвоение монет подтверждено — фиксируем сумму и перецентровываем строку */
  markCoinsDoubled(): void {
    if (!this.alive || !this.coinText) return;
    this.coinsCounter?.stop();

    const doubled = this.stats.coins * 2;
    this.coinText.setText(`+${doubled} COINS`);
    this.layoutCoinsRow(doubled);
    this.coinText.setText(`+${doubled} COINS`);

    if (this.x2Btn && this.x2Btn.active) {
      this.x2Btn.disableInteractive();
      this.x2Btn.setAlpha(0.35);
    }
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.coinsCounter?.stop();
    this.root.destroy();
  }

  // --- Фабрика кнопок с микро-взаимодействиями ---

  private makeButton(style: {
    w: number;
    h: number;
    fill: number;
    fillAlpha: number;
    stroke: number;
    strokeAlpha: number;
    strokeWidth?: number;
    radius?: number;
    label: string;
    labelColor: string;
    fontSize: string;
    withFilmIcon?: boolean;
    iconShiftX?: number;
    labelOffsetY?: number;
  }): Phaser.GameObjects.Container {
    const { w, h } = style;
    const btn = this.scene.add.container(0, 0);

    const plate = this.scene.add.graphics();
    plate.fillStyle(style.fill, style.fillAlpha);
    plate.fillRoundedRect(-w / 2, -h / 2, w, h, style.radius ?? 12);
    plate.lineStyle(style.strokeWidth ?? 2, style.stroke, style.strokeAlpha);
    plate.strokeRoundedRect(-w / 2, -h / 2, w, h, style.radius ?? 12);
    btn.add(plate);

    let textX = 0;
    if (style.withFilmIcon) {
      const icon = this.drawFilmIcon(style.stroke, 20);
      icon.setPosition(-(w / 2) + (style.iconShiftX ?? 30), 0);
      btn.add(icon);
      textX = 10;
    }

    const label = this.scene.add
      .text(textX, style.labelOffsetY ?? 0, style.label, {
        fontSize: style.fontSize,
        color: style.labelColor,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    btn.add(label);

    // Явная хит-зона всей плашки
    btn.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    if (btn.input) {
      btn.input.cursor = "pointer";
    }

    // Микро-взаимодействия: hover ×1.04, клик ×0.95 + щелчок
    btn.on("pointerover", () => {
      this.tweenScale(btn, 1.04);
    });
    btn.on("pointerout", () => {
      this.tweenScale(btn, 1);
    });
    btn.on("pointerdown", () => {
      playClickTick();
      this.tweenScale(btn, 0.95);
    });
    btn.on("pointerup", () => {
      this.tweenScale(btn, 1);
    });

    return btn;
  }

  private tweenScale(
    target: Phaser.GameObjects.Container,
    value: number,
  ): void {
    if (!this.alive || !target.active) return;
    this.scene.tweens.add({
      targets: target,
      scale: value,
      duration: 90,
      ease: "Quad.Out",
    });
  }

  /** Векторная иконка «видео/AD»: скруглённый кадр плёнки с треугольником */
  private drawFilmIcon(
    color: number,
    size: number,
  ): Phaser.GameObjects.Container {
    const icon = this.scene.add.container(0, 0);
    const g = this.scene.add.graphics();

    const frameW = size;
    const frameH = size * 0.72;
    g.lineStyle(2, color, 0.95);
    g.strokeRoundedRect(-frameW / 2, -frameH / 2, frameW, frameH, 3);
    // Перфорация плёнки по краям
    g.fillStyle(color, 0.85);
    for (let i = 0; i < 3; i++) {
      const px = -frameW / 2 + 3 + i * 4;
      g.fillRect(px, -frameH / 2 + 2, 1.6, 2);
      g.fillRect(px, frameH / 2 - 4, 1.6, 2);
    }
    // Треугольник Play внутри
    const tri = size * 0.22;
    g.fillStyle(color, 1);
    g.fillTriangle(-tri / 2, -tri, -tri / 2, tri, tri, 0);

    icon.add(g);
    return icon;
  }
}
