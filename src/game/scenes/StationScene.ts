// ============================================================
// StationScene — космическая станция в виде интерактивного хаба.
// Отсеки — псевдо-3D неоновые здания (изометрия через Graphics,
// луч в небо + рёбра охлаждения), с векторными sci-fi иконками
// на крышках. Над зданиями парят имя + индикаторы уровня и
// периодически спавнятся кликабельные бусты. Клик по зданию
// открывает модальное окно апгрейда (UpgradeModal).
//
// Логика разделена на классы: StationBuilding (здание),
// UpgradeModal (окно прокачки), StationScene (хаб и экономика).
// Уровни хранятся в localStorage (GameState.getStation/setStation)
// и синхронизируются в облако через GameServicesManager.
// ============================================================

import * as Phaser from "phaser";
import {
  COLOR_BG,
  COLOR_CYAN,
  COLOR_DARK_PANEL,
  COLOR_GOLD,
  COLOR_PINK,
  COLOR_PURPLE,
  GameState,
  type StationLevels,
  drawGrid,
  drawNeonPlate,
  drawSciFiIcon,
  formatDuration,
} from "../ui/NeonUI";
import { gameServices } from "../../services/GameServicesManager";
import { CoinPlate } from "../ui/CoinPlate";
import { getSelectedSkin } from "../spaceship-skins";
import { loadCustomization } from "../garage-data";

// ============================================================
// Конфигурация отсеков станции
// ============================================================

interface StationModule {
  key: keyof StationLevels;
  title: string;
  /** Описание роли отсека — показывается в модальном окне */
  description: string;
  maxLevel: number;
  color: number;
  costs: number[];
  /** Время постройки следующего уровня (мс), индекс = текущий уровень */
  buildDurationsMs: number[];
  effectText: (level: number) => string;
}

const MODULES: StationModule[] = [
  {
    key: "engineering",
    title: "ENGINEERING BAY",
    description: "Auto-repairs hull damage during runs. Higher levels mean faster repairs, keeping you alive longer.",
    maxLevel: 5,
    color: COLOR_CYAN,
    // === БАЛАНС === ур.1 — реген каждые 25с, каждый уровень быстрее до 8с
    costs: [250, 600, 1400, 3000, 6500],
    // === БАЛАНС === время стройки: 3/10/30/60/120 минут
    buildDurationsMs: [3, 10, 30, 60, 120].map((m) => m * 60_000),
    effectText: (level) =>
      level === 0
        ? "NO AUTO REPAIR"
        : `AUTO REPAIR EVERY ${Math.max(8, 25 - (level - 1) * 4)}S`,
  },
  {
    key: "finance",
    title: "FINANCE OFFICE",
    description: "Boosts coin income multiplier per run. More levels = more credits from every successful escape.",
    maxLevel: 5,
    color: COLOR_GOLD,
    // === БАЛАНС === +10% монет за уровень (x1.1 … x1.5),
    costs: [300, 750, 1800, 4000, 8500],
    // === БАЛАНС === время стройки: 3/10/30/60/120 минут
    buildDurationsMs: [3, 10, 30, 60, 120].map((m) => m * 60_000),
    effectText: (level) =>
      `COIN INCOME x${(1 + level * 0.1).toFixed(1)} PER RUN`,
  },
  {
    key: "design",
    title: "DESIGN WING",
    description: "Unlocks new ship skins and blueprints. Each level reveals unique ship designs and boosts BP generation.",
    maxLevel: 5,
    color: COLOR_PINK,
    // === БАЛАНС === каждый уровень открывает новые скины + BP/ч
    costs: [400, 1200, 3000, 6000, 12000],
    // === БАЛАНС === время стройки: 5/20/45/90/120 минут
    buildDurationsMs: [5, 20, 45, 90, 120].map((m) => m * 60_000),
    effectText: (level) => {
      const skins = [3, 5, 6, 7, 8, 9][level];
      const bpHr = [0, 8, 20, 40, 60, 80][level];
      return `${skins} SKINS UNLOCKED · ${bpHr} BP/HR`;
    },
  },
];

// --- Утилиты цвета ---

/** Затемняет цвет (t: 0..1 — доля чёрного) для теневых граней изометрии */
function shadeColor(color: number, t: number): number {
  const r = Math.round(((color >> 16) & 0xff) * (1 - t));
  const g = Math.round(((color >> 8) & 0xff) * (1 - t));
  const b = Math.round((color & 0xff) * (1 - t));
  return (r << 16) | (g << 8) | b;
}

function colorToHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

// ============================================================
// Векторный генератор Sci-Fi иконок (drawSciFiIcon) живёт в
// ../ui/NeonUI — он общий для станции и главного меню.
// ============================================================

// --- Общие примитивы изометрии (здания отсеков и Command Core) ---

/** Стиль отрисовки изометрического корпуса */
interface IsoStyle {
  /** Затемнение левой/правой стены (доля чёрного) */
  wallShadeDark?: number;
  wallShadeLight?: number;
  /** Цвет и альфа крышки-ромба (по умолчанию — базовый цвет) */
  topFillColor?: number;
  topFillAlpha?: number;
  /** Цвет неоновых рёбер */
  edgeColor?: number;
  /** Сколько линий охлаждения/окон нарисовать на стенах */
  windowCount?: number; 
}

/** Изометрический корпус: стены, крышка, луч в небо и рёбра охлаждения */
function drawIsoStructure(
  g: Phaser.GameObjects.Graphics,
  hw: number,
  hh: number,
  depth: number,
  baseColor: number,
  style: IsoStyle = {}
): void {
  const dark = style.wallShadeDark ?? 0.72;
  const light = style.wallShadeLight ?? 0.5;
  const topColor = style.topFillColor ?? baseColor;
  const topAlpha = style.topFillAlpha ?? 0.4;
  const edge = style.edgeColor ?? baseColor;

  // 1. Неоновый лазерный луч в небо
  g.lineStyle(2, baseColor, 0.15);
  g.lineBetween(0, 0, 0, -120);

  // 2. Базовые стены
  g.fillStyle(shadeColor(baseColor, dark), 0.9);
  g.fillPoints([
    new Phaser.Math.Vector2(-hw, 0),
    new Phaser.Math.Vector2(0, hh),
    new Phaser.Math.Vector2(0, hh + depth),
    new Phaser.Math.Vector2(-hw, depth)
  ], true);

  g.fillStyle(shadeColor(baseColor, light), 0.9);
  g.fillPoints([
    new Phaser.Math.Vector2(hw, 0),
    new Phaser.Math.Vector2(0, hh),
    new Phaser.Math.Vector2(0, hh + depth),
    new Phaser.Math.Vector2(hw, depth)
  ], true);

  // 3. Крышка-платформа
  g.fillStyle(topColor, topAlpha);
  g.fillPoints([
    new Phaser.Math.Vector2(-hw, 0),
    new Phaser.Math.Vector2(0, -hh),
    new Phaser.Math.Vector2(hw, 0),
    new Phaser.Math.Vector2(0, hh)
  ], true);

  // 4. Световые ребра охлаждения (Параллельно граням ромба!)
  const windowCount = style.windowCount ?? 3;
  if (windowCount > 0) {
    g.lineStyle(1.2, 0xffffff, 0.4);
    
    // Распределяем полосы по высоте стенки (depth)
    const stepY = depth / (windowCount + 1);

    for (let i = 1; i <= windowCount; i++) {
      const lineY = hh + stepY * i; // Стартуем от нижней вершины крышки (0, hh)
      
      // Левая стена: параллельно левому ребра от 60% ширины до центра
      g.lineBetween(
        -hw * 0.6, 
        lineY - hh * 0.6, 
        0, 
        lineY
      );
      
      // Правая стена: от центра к правому краю параллельно правому ребру
      g.lineBetween(
        0, 
        lineY, 
        hw * 0.6, 
        lineY - hh * 0.6
      );
    }
  }

  // 5. Яркие контуры
  g.lineStyle(2, edge, 0.95);
  strokeIsoEdges(g, hw, hh, depth);
}

/** Контур рёбер корпуса: ромб крышки + вертикали + нижний контур стен */
function strokeIsoEdges(
  g: Phaser.GameObjects.Graphics,
  hw: number,
  hh: number,
  depth: number,
): void {
  g.strokePoints(
    [
      new Phaser.Math.Vector2(-hw, 0),
      new Phaser.Math.Vector2(0, -hh),
      new Phaser.Math.Vector2(hw, 0),
      new Phaser.Math.Vector2(0, hh),
    ],
    true,
    true,
  );
  g.lineBetween(-hw, 0, -hw, depth);
  g.lineBetween(hw, 0, hw, depth);
  g.lineBetween(0, hh, 0, hh + depth);
  g.lineBetween(-hw, depth, 0, hh + depth);
  g.lineBetween(hw, depth, 0, hh + depth);
}

// ============================================================
// StationBuilding — неоновый модуль станции (минималистичный стиль).
// Каждый модуль — уникальная геометрическая форма с неоновым
// контуром: шестиугольник (Engineering), круг (Finance),
// ромб (Design). Иконка по центру, уровень — сегменты вокруг.
// ============================================================

class StationBuilding extends Phaser.GameObjects.Container {
  readonly module: StationModule;

  private level: number;
  private readonly onSelect: (building: StationBuilding) => void;
  private baseScale = 1;
  private locked = false;

  private shapeGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private glyphGfx!: Phaser.GameObjects.Graphics;
  private beacon!: Phaser.GameObjects.Arc;
  private buildText?: Phaser.GameObjects.Text;
  private wrenchGfx?: Phaser.GameObjects.Graphics;

  private statusBadge!: Phaser.GameObjects.Container;
  private statusBg!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private buildProgressBar?: Phaser.GameObjects.Graphics;

  public hasActiveBoost = false;

  private static readonly POD_R = 44;

  constructor(
    scene: Phaser.Scene,
    module: StationModule,
    level: number,
    onSelect: (building: StationBuilding) => void,
  ) {
    super(scene, 0, 0);
    this.module = module;
    this.level = level;
    this.onSelect = onSelect;

    this.shapeGfx = scene.add.graphics();
    this.fxGfx = scene.add.graphics();
    this.glyphGfx = scene.add.graphics();

    this.beacon = scene.add.circle(0, 0, 3, module.color, 1);

    this.add([this.shapeGfx, this.fxGfx, this.glyphGfx, this.beacon]);

    this.statusBg = scene.add.graphics();
    this.statusText = scene.add
      .text(0, 0, "", {
        fontSize: "11px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.statusBadge = scene.add.container(0, 0, [this.statusBg, this.statusText]);
    this.statusBadge.setVisible(false);
    this.add(this.statusBadge);

    // Хит-зона = радиус пода + запас
    const R = StationBuilding.POD_R;
    this.setInteractive({
      hitArea: new Phaser.Geom.Circle(0, 0, R + 16),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
      useHandCursor: true,
    });

    this.on("pointerover", () => this.tweenScaleTo(this.baseScale * 1.05, 120));
    this.on("pointerout", () => this.tweenScaleTo(this.baseScale, 140));
    this.on("pointerdown", () => this.tweenScaleTo(this.baseScale * 0.95, 70));
    this.on(
      "pointerup",
      (
        _p: Phaser.Input.Pointer,
        _lx: number,
        _ly: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.playClickImpulse();
        this.onSelect(this);
      },
    );

    this.redraw();
    this.drawFx();
    this.updateLockedVisuals();
    this.initFxTweens();
  }

  get currentLevel(): number {
    return this.level;
  }

  setBuildCountdown(remainingMs: number | null): void {
    if (!this.buildText) {
      this.buildText = this.scene.add
        .text(0, StationBuilding.POD_R + 14, "", {
          fontSize: "10px",
          color: "#ffd700",
          fontStyle: 'bold',
          fontFamily: 'Consolas, "Courier New", monospace',
        })
        .setOrigin(0.5);
      this.add(this.buildText);

      this.wrenchGfx = this.scene.add.graphics();
      this.drawWrenchIcon(this.wrenchGfx, this.module.color, 7);
      this.add(this.wrenchGfx);
    }

    if (remainingMs === null) {
      if (this.buildText.visible) {
        this.buildText.setVisible(false);
        this.wrenchGfx?.setVisible(false);
      }
      return;
    }

    this.buildText.setVisible(true);
    this.wrenchGfx?.setVisible(true);
    this.buildText.setText(formatDuration(remainingMs, true));
    this.wrenchGfx?.setPosition(-14, StationBuilding.POD_R + 14);
  }

  private drawWrenchIcon(g: Phaser.GameObjects.Graphics, color: number, s: number): void {
    g.clear();
    g.lineStyle(1.8, color, 0.9);
    g.lineBetween(-s, s, s * 0.3, -s * 0.3);
    g.beginPath();
    g.arc(s * 0.3, -s * 0.3, s * 0.45, -0.8, Math.PI * 0.6, false);
    g.strokePath();
    g.lineBetween(s * 0.55, -s * 0.7, s * 0.55, -s * 0.2);
  }

  get roofY(): number {
    return -(StationBuilding.POD_R + 22);
  }

  setBaseScale(s: number): void {
    this.baseScale = s;
    this.scene.tweens.killTweensOf(this);
    this.setScale(s);
  }

  private tweenScaleTo(to: number, duration: number): void {
    this.scene.tweens.add({
      targets: this,
      scale: to,
      duration,
      ease: "Sine.easeOut",
    });
  }

  private playClickImpulse(): void {
    const tw = this.scene.tweens;
    tw.killTweensOf(this);
    tw.add({
      targets: this,
      scale: { from: this.baseScale * 0.95, to: this.baseScale * 1.07 },
      duration: 90,
      yoyo: true,
      hold: 50,
      ease: "Quad.easeOut",
      onComplete: () => this.setScale(this.baseScale),
    });
  }

  refresh(level: number): void {
    this.level = level;
    this.locked = level === 0;
    this.redraw();
    this.drawFx();
    this.updateLockedVisuals();
  }

  private updateLockedVisuals(): void {
    this.setAlpha(this.locked ? 0.4 : 1);
  }

  // ============================================================
  // Отрисовка минималистичного неон-пода
  // ============================================================

  private redraw(): void {
    const R = StationBuilding.POD_R;
    const c = this.module.color;
    const g = this.shapeGfx;
    g.clear();

    // Внутренняя заливка (очень прозрачная)
    g.fillStyle(c, 0.06);

    switch (this.module.key) {
      case "engineering":
        this.drawHexagon(g, 0, 0, R, c);
        break;
      case "finance":
        this.drawCirclePod(g, 0, 0, R, c);
        break;
      case "design":
        this.drawDiamond(g, 0, 0, R, c);
        break;
    }

    // Сегменты уровня вокруг формы
    this.drawLevelSegments(g, R + 6, c);

    // Иконка модуля по центру
    drawSciFiIcon(this.glyphGfx, this.module.key, c, 14);

    // Beacon сверху
    this.beacon.setPosition(0, -R - 4);
  }

  /** Шестиугольник (Engineering) */
  private drawHexagon(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    r: number,
    color: number,
  ): void {
    // Заливка
    g.fillStyle(color, 0.08);
    const pts = this.hexPoints(cx, cy, r);
    g.fillPoints(pts, true);

    // Контур
    g.lineStyle(2, color, 0.9);
    g.strokePoints(pts, true);

    // Внутренняя сетка (горизонтальные линии — «схема»)
    g.lineStyle(0.8, color, 0.2);
    for (let i = -2; i <= 2; i++) {
      const y = cy + i * (r * 0.35);
      const hw = r * 0.85;
      g.lineBetween(cx - hw, y, cx + hw, y);
    }
  }

  /** Круг с кольцами (Finance) */
  private drawCirclePod(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    r: number,
    color: number,
  ): void {
    // Заливка
    g.fillStyle(color, 0.08);
    g.fillCircle(cx, cy, r);

    // Контур
    g.lineStyle(2, color, 0.9);
    g.strokeCircle(cx, cy, r);

    // Внутренние кольца
    g.lineStyle(0.8, color, 0.25);
    g.strokeCircle(cx, cy, r * 0.7);
    g.strokeCircle(cx, cy, r * 0.4);

    // CR-ромб по центру (поверх иконки будет glyphGfx)
    //小型 неоновый ромб валюты
    const crY = cy + 16;
    const crS = 6;
    const hw = crS * 0.75;
    g.lineStyle(1.2, 0xffb700, 0.8);
    g.beginPath();
    g.moveTo(0, crY - crS);
    g.lineTo(hw, crY);
    g.lineTo(0, crY + crS);
    g.lineTo(-hw, crY);
    g.closePath();
    g.strokePath();
    g.fillStyle(0xffb700, 0.35);
    g.fillPath();
  }

  /** Ромб (Design) */
  private drawDiamond(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    r: number,
    color: number,
  ): void {
    const pts = [
      new Phaser.Math.Vector2(cx, cy - r),
      new Phaser.Math.Vector2(cx + r * 0.75, cy),
      new Phaser.Math.Vector2(cx, cy + r),
      new Phaser.Math.Vector2(cx - r * 0.75, cy),
    ];

    // Заливка
    g.fillStyle(color, 0.08);
    g.fillPoints(pts, true);

    // Контур
    g.lineStyle(2, color, 0.9);
    g.strokePoints(pts, true);

    // Внутренний орбитальный эллипс (атом)
    g.lineStyle(0.8, color, 0.3);
    g.strokeEllipse(cx, cy, r * 1.1, r * 0.6);
    g.strokeEllipse(cx, cy, r * 0.6, r * 1.0);
    // Ядро атома
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(cx, cy, 3);
  }

  /** Точки шестиугольника */
  private hexPoints(cx: number, cy: number, r: number): Phaser.Math.Vector2[] {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push(new Phaser.Math.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
    return pts;
  }

  /** Сегменты уровня: дуги вокруг pod (0 = тусклые, lv = залитые) */
  private drawLevelSegments(
    g: Phaser.GameObjects.Graphics,
    radius: number,
    color: number,
  ): void {
    const max = this.module.maxLevel;
    const arcSpan = (2 * Math.PI) / max;
    const gap = 0.06;

    for (let i = 0; i < max; i++) {
      const startA = arcSpan * i - Math.PI / 2 + gap;
      const endA = arcSpan * (i + 1) - Math.PI / 2 - gap;
      const filled = i < this.level;

      if (filled) {
        g.lineStyle(3, color, 0.95);
      } else {
        g.lineStyle(1.5, color, 0.2);
      }

      g.beginPath();
      g.arc(0, 0, radius, startA, endA, false);
      g.strokePath();
    }
  }

  // ============================================================
  // Спецэффекты отсеков
  // ============================================================

  drawFx(): void {
    const g = this.fxGfx;
    g.clear();
    if (this.locked) return;

    const R = StationBuilding.POD_R;
    const c = this.module.color;

    switch (this.module.key) {
      case "engineering": {
        // Три искры вдоль нижнего правого края
        for (let i = 0; i < 3; i++) {
          const angle = Math.PI * 0.25 + i * 0.3;
          const sx = R * 0.7 * Math.cos(angle);
          const sy = R * 0.7 * Math.sin(angle);
          g.fillStyle(0xffffff, 0.25);
          g.fillCircle(sx, sy, 5 + i);
          g.fillStyle(0xffffff, 0.7);
          g.fillCircle(sx, sy, 1.5);
        }
        break;
      }
      case "finance": {
        // Вертикальный луч вверх
        const beamAlpha = 0.15 + this.level * 0.03;
        g.lineStyle(2, c, beamAlpha);
        g.lineBetween(0, -R, 0, -R - 30 - this.level * 8);
        g.lineStyle(0.8, 0xffffff, beamAlpha * 0.5);
        g.lineBetween(0, -R, 0, -R - 20 - this.level * 6);
        break;
      }
      case "design": {
        // Горизонтальный сканирующий луч
        g.lineStyle(1.5, c, 0.7);
        g.lineBetween(-R * 0.8, 0, R * 0.8, 0);
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(-R * 0.8, 0, 2);
        g.fillCircle(R * 0.8, 0, 2);
        break;
      }
    }
  }

  private initFxTweens(): void {
    if (this.locked) return;

    switch (this.module.key) {
      case "engineering":
        this.scene.tweens.add({
          targets: this.fxGfx,
          alpha: { from: 1, to: 0.35 },
          duration: 280,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
          delay: 150,
        });
        break;
      case "finance":
        this.scene.tweens.add({
          targets: this.fxGfx,
          alpha: { from: 1, to: 0.5 },
          duration: 1400,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        break;
      case "design":
        this.scene.tweens.add({
          targets: this.fxGfx,
          x: { from: -4, to: 4 },
          duration: 1800,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        break;
    }
  }

  // ================================================================
  // Статус-бейджи: READY / UNDER CONSTRUCTION / MAX
  // ================================================================

  /**
   * Обновление плавающего бейджа над зданием.
   * @param coins - текущее количество кредитов игрока (null = скрыть)
   */
  updateStatusBadge(coins: number | null): void {
    const build = GameState.getStationBuilds()[this.module.key];
    const maxed = this.level >= this.module.maxLevel;

    // --- UNDER CONSTRUCTION ---
    if (build.isBuilding) {
      const remaining = build.finishTime - Date.now();
      if (remaining <= 0) {
        this.statusBadge.setVisible(false);
        return;
      }
      this.statusBadge.setVisible(true);
      // === JUICE === сдвигаем бейдж выше пипсов, чтобы не наезжал на имя
      this.statusBadge.setPosition(0, this.roofY - 58);

      this.statusBg.clear();
      drawNeonPlate(this.statusBg, 116, 16, COLOR_PURPLE, 5, 0.18);
      this.statusText.setText(
        `BUILDING ${formatDuration(remaining, true)}`,
      );
      this.statusText.setColor("#e8d0ff");
      this.statusText.setFontSize("9px");

      // Прогресс-бар под статусом
      this.drawBuildProgressBar(build.finishTime);
      return;
    }

    // --- MAX LEVEL ---
    if (maxed) {
      this.statusBadge.setVisible(true);
      this.statusBadge.setPosition(0, this.roofY - 58);

      this.statusBg.clear();
      drawNeonPlate(this.statusBg, 52, 16, COLOR_GOLD, 5, 0.22);
      this.statusText.setText("MAX");
      this.statusText.setColor("#ffd700");
      this.statusText.setFontSize("10px");
      this.clearBuildProgressBar();
      return;
    }

    // --- READY (только когда реально хватает кредитов) ---
    if (coins !== null && coins >= this.module.costs[this.level]) {
      this.statusBadge.setVisible(true);
      // Прижимаем к левому краю пипсов, чтобы не наезжало на имя
      this.statusBadge.setPosition(0, this.roofY - 58);

      this.statusBg.clear();
      drawNeonPlate(this.statusBg, 64, 14, COLOR_CYAN, 4, 0.2);
      this.statusText.setText("READY");
      this.statusText.setColor("#00f0ff");
      this.statusText.setFontSize("10px");

      // Пульс READY-бейджа
      if (!this.statusBadge.getData("pulsing")) {
        this.scene.tweens.add({
          targets: this.statusBadge,
          alpha: { from: 1, to: 0.6 },
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        this.statusBadge.setData("pulsing", true);
      }
      this.clearBuildProgressBar();
      return;
    }

    // --- Нет средств / нечего показывать ---
    this.statusBadge.setVisible(false);
    this.clearBuildProgressBar();
  }

  /** Прогресс-бар стройки под текстом «UNDER CONSTRUCTION» */
  private drawBuildProgressBar(finishTime: number): void {
    const build = GameState.getStationBuilds()[this.module.key];
    if (!build.isBuilding) {
      this.clearBuildProgressBar();
      return;
    }

    if (!this.buildProgressBar) {
      this.buildProgressBar = this.scene.add.graphics();
      this.add(this.buildProgressBar);
    }
    this.buildProgressBar.setVisible(true);

    const barW = 80;
    const barH = 3;
    // === JUICE === позиция бара привязана к бейджу (roofY - 58)
    const barY = this.roofY - 50;
    // === БАЛАНС === totalDuration = buildDurationsMs текущего уровня
    const totalDuration = this.module.buildDurationsMs[this.level];
    const remaining = Math.max(0, finishTime - Date.now());
    const progress = Phaser.Math.Clamp(1 - remaining / totalDuration, 0, 1);

    this.buildProgressBar.clear();
    // Фон бара
    this.buildProgressBar.fillStyle(0x222233, 0.6);
    this.buildProgressBar.fillRoundedRect(-barW / 2, barY, barW, barH, 2);
    // Заполнение
    this.buildProgressBar.fillStyle(this.module.color, 0.85);
    this.buildProgressBar.fillRoundedRect(
      -barW / 2,
      barY,
      barW * progress,
      barH,
      2,
    );
  }

  private clearBuildProgressBar(): void {
    if (this.buildProgressBar) {
      this.buildProgressBar.setVisible(false);
    }
  }
}

// ============================================================
// CommandCore — центральное ядро станции. Крупный фиолетово-
// белый изометрический модуль с пульсирующими кольцами площадки,
// двойной антенной и векторной иконкой реактора на крышке.
// Не интерактивен: служит визуальным центром, от которого
// расходятся коридоры.
// ============================================================

class CommandCore extends Phaser.GameObjects.Container {
  private static readonly HALF_W = 64;
  private static readonly HALF_H = 29;
  private static readonly DEPTH = 34;
  private static readonly GLYPH_Y = -3;

  private shapeGfx!: Phaser.GameObjects.Graphics;
  private ringGfx!: Phaser.GameObjects.Graphics;
  private beacon!: Phaser.GameObjects.Arc;
  private labelBox!: Phaser.GameObjects.Container;

  get roofY(): number {
    return -(CommandCore.HALF_H + 46);
  }

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    const purple = COLOR_PURPLE;

    this.ringGfx = scene.add.graphics();
    this.ringGfx.setPosition(0, CommandCore.HALF_H + CommandCore.DEPTH + 2);
    this.ringGfx.lineStyle(1.5, purple, 0.3);
    this.ringGfx.strokeEllipse(0, 0, 190, 80);
    this.ringGfx.lineStyle(1, 0xffffff, 0.22);
    this.ringGfx.strokeEllipse(0, 0, 232, 98);

    this.shapeGfx = scene.add.graphics();

    const glyphGlow = scene.add.graphics();
    glyphGlow.fillStyle(purple, 0.22);
    glyphGlow.fillCircle(0, CommandCore.GLYPH_Y, 17);
    glyphGlow.lineStyle(1.2, purple, 0.5);
    glyphGlow.strokeCircle(0, CommandCore.GLYPH_Y, 17);

    const iconGfx = scene.add.graphics();
    iconGfx.setPosition(0, CommandCore.GLYPH_Y);

    const label = scene.add
      .text(0, 0, "COMMAND CORE", {
        fontSize: "14px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.labelBox = scene.add.container(0, -(CommandCore.HALF_H + 52), [label]);

    this.beacon = scene.add.circle(0, 0, 3.5, 0xffffff, 1);

    this.add([this.ringGfx, this.shapeGfx, glyphGlow, iconGfx, this.labelBox, this.beacon]);

    this.drawBody();
    drawSciFiIcon(iconGfx, "core", purple, 15);

    scene.tweens.add({
      targets: this.ringGfx,
      scale: 1.1,
      alpha: 0.55,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    scene.tweens.add({
      targets: this.labelBox,
      y: "-=5",
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    scene.tweens.add({
      targets: this.beacon,
      alpha: 0.1,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

private drawBody(): void {
  const { HALF_W, HALF_H, DEPTH } = CommandCore;
  const g = this.shapeGfx;

  g.clear();

  // 1. Рисуем базовый корпус
  drawIsoStructure(g, HALF_W, HALF_H, DEPTH, COLOR_PURPLE, {
    topFillColor: 0xffffff,
    edgeColor: COLOR_PURPLE,
  });

  // 2. БИО-КУПОЛ (опирается прямо на силовое поле снизу)
  const domeRx = HALF_W + 55;      // Ширина по эллипсу площадки
  const domeRy = 50;               // Сплюснутость под изометрию
  const domeCenterY = 55; // Опускаем нижний край ровно к кольцам

  // Внутреннее свечение кислорода
  g.fillStyle(COLOR_CYAN, 0.12);
  g.fillEllipse(0, domeCenterY, domeRx * 2, domeRy * 2);

  // Полупрозрачная купольная заливка
  g.fillStyle(0x00f0ff, 0.13);
  g.beginPath();
  g.arc(0, domeCenterY, domeRx, Math.PI, 0, false);
  g.closePath();
  g.fillPath();

  // Основной неоновый контур купола
  g.lineStyle(2, COLOR_CYAN, 0.85);
  g.strokeEllipse(0, domeCenterY, domeRx * 2, domeRy * 2);

  // Горизонтальные ребра жесткости (экваториальные кольца)
  // g.lineStyle(1, COLOR_CYAN, 0.4);
  // g.strokeEllipse(0, domeCenterY - 18, domeRx * 1.8, domeRy * 1.2);
  // g.lineStyle(1, 0xffffff, 0.25);
  // g.strokeEllipse(0, domeCenterY + 12, domeRx * 1.9, domeRy * 1.4);

  // Блик на стекле купола
  g.fillStyle(0xffffff, 0.7);
  g.fillCircle(-domeRx * 0.45, domeCenterY - domeRy * 0.4, 3.5);
  g.fillStyle(0xffffff, 0.4);
  g.fillCircle(-domeRx * 0.35, domeCenterY - domeRy * 0.5, 2);

  // 3. Антенна над верхней точкой купола
  // const topOfDomeY = domeCenterY - domeRy;
  // g.lineStyle(2, COLOR_PURPLE, 0.95);
  // g.lineBetween(0, topOfDomeY, 0, topOfDomeY - 22);
  // g.lineStyle(1.5, COLOR_CYAN, 0.8);
  // g.lineBetween(-8, topOfDomeY - 10, 8, topOfDomeY - 10);

  // this.beacon.setPosition(0, topOfDomeY - 24);
}
}

// ============================================================
// UpgradeModal — модальное окно прокачки отсека.
// Затемнение фона блокирует клики мимо окна; панель показывает
// название, текущий/следующий уровень, эффект и кнопку покупки
// с динамической стоимостью. После успешного апгрейда окно
// остаётся открытым и обновляет своё содержимое.
// ============================================================

interface UpgradeModalCallbacks {
  /** Покупка; true — списано и повышено (сцена сама сохранит состояние) */
  onAttemptUpgrade: (mod: StationModule) => boolean;
  onRequestToast: (message: string, color: number) => void;
  /** Вызывается из destroy() — сцена сбрасывает ссылку на модалку */
  onDestroy?: () => void;
}

class UpgradeModal {
  private readonly scene: Phaser.Scene;
  private readonly mod: StationModule;
  private level: number;
  private readonly cb: UpgradeModalCallbacks;

  private dim!: Phaser.GameObjects.Rectangle;
  private root!: Phaser.GameObjects.Container;
  private panelBg!: Phaser.GameObjects.Graphics;
  private iconGfx!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private descText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private currentText!: Phaser.GameObjects.Text;
  private nextText!: Phaser.GameObjects.Text;
  private buyBtn?: Phaser.GameObjects.Container;
  private buyBg!: Phaser.GameObjects.Graphics;
  private buyTxt!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Container;

  private static readonly PANEL_W = 380;
  private static readonly PANEL_H = 320;

  constructor(
    scene: Phaser.Scene,
    mod: StationModule,
    level: number,
    cb: UpgradeModalCallbacks,
  ) {
    this.scene = scene;
    this.mod = mod;
    this.level = level;
    this.cb = cb;

    const w = scene.scale.width;
    const h = scene.scale.height;
    const PW = UpgradeModal.PANEL_W;
    const PH = UpgradeModal.PANEL_H;

    // Затемнение фона
    this.dim = scene.add.rectangle(w / 2, h / 2, w, h, 0x050510, 0.92);
    this.dim.setInteractive({ useHandCursor: false });
    this.dim.once("pointerup", () => this.destroy());

    this.root = scene.add.container(w / 2, h / 2);
    this.root.setDepth(99);
    this.dim.setDepth(98);

    // Hit-area под новые размеры 380×320
    this.root.setSize(PW, PH);
    this.root.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-PW / 2, -PH / 2, PW, PH),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    });

    // --- Фон панели ---
    this.panelBg = scene.add.graphics();
    drawNeonPlate(this.panelBg, PW - 20, PH - 20, COLOR_PURPLE, 14, 0.22);

    // --- Иконка модуля: y = -125 ---
    this.iconGfx = scene.add.graphics();
    this.iconGfx.setPosition(-PW / 2 + 32, -125);
    drawSciFiIcon(this.iconGfx, mod.key, mod.color, 14);

    // --- Заголовок: y = -125 (рядом с иконкой) ---
    this.titleText = scene.add
      .text(-PW / 2 + 56, -125, mod.title, {
        fontSize: "17px",
        color: colorToHex(mod.color),
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    // --- Описание: y = -90, по центру ---
    this.descText = scene.add
      .text(0, -90, mod.description, {
        fontSize: "11px",
        color: "#99aabb",
        align: "center",
        wordWrap: { width: 330 },
      })
      .setOrigin(0.5, 0);

    // --- Уровень: y = -45 ---
    this.levelText = scene.add
      .text(0, -45, "", {
        fontSize: "13px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // --- Текущий эффект: y = -15 ---
    this.currentText = scene.add
      .text(0, -15, "", {
        fontSize: "13px",
        color: "#e8f6ff",
        align: "center",
        wordWrap: { width: PW - 50 },
      })
      .setOrigin(0.5);

    // --- Следующий эффект (+ прирост в одну строку): y = 20 ---
    this.nextText = scene.add
      .text(0, 20, "", {
        fontSize: "13px",
        color: colorToHex(COLOR_GOLD),
        align: "center",
        wordWrap: { width: PW - 50 },
      })
      .setOrigin(0.5);

    // --- Кнопка покупки: y = 105, размер 200×44 ---
    this.buyBg = scene.add.graphics();
    this.buyTxt = scene.add
      .text(0, 0, "", {
        fontSize: "14px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.closeBtn = this.buildCloseButton();

    this.root.add([
      this.panelBg,
      this.iconGfx,
      this.titleText,
      this.descText,
      this.levelText,
      this.currentText,
      this.nextText,
      this.buyBg,
      this.buyTxt,
      this.closeBtn,
    ]);

    // Адаптив
    const fit = Phaser.Math.Clamp(Math.min(w / 440, h / 600), 0.72, 1);
    this.root.setScale(fit);

    this.refresh();

    // Появление
    this.root.setScale(fit * 0.85);
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, scale: fit, alpha: 1, duration: 160, ease: "Back.easeOut" });

    scene.events.once("shutdown", () => this.destroy());
  }

  private buildCloseButton(): Phaser.GameObjects.Container {
    const bg = this.scene.add.graphics();
    drawNeonPlate(bg, 34, 34, COLOR_PINK, 8, 0.2);
    const txt = this.scene.add
      .text(0, 0, "✕", { fontSize: "15px", color: "#ffffff", fontStyle: "bold" })
      .setOrigin(0.5);
    // Внутри плашки: (PW/2 - 15, -PH/2 + 15)
    const btn = this.scene.add.container(
      UpgradeModal.PANEL_W / 2 - 25,
      -UpgradeModal.PANEL_H / 2 + 25,
      [bg, txt],
    );
    btn.setSize(34, 34);
    btn.setInteractive({ useHandCursor: true });
    btn.on("pointerup", () => this.destroy());
    return btn;
  }

  /** Пересчёт текстов/стоимости под текущее состояние отсека */
  refresh(): void {
    const lv = this.level;
    const maxed = lv >= this.mod.maxLevel;
    const build = GameState.getStationBuilds()[this.mod.key];

    // --- Режим стройки ---
    if (build.isBuilding) {
      this.levelText.setText(`LEVEL ${lv} — UNDER CONSTRUCTION`);
      this.currentText.setText(
        `BUILDING NOW: ${formatDuration(build.finishTime - Date.now(), true)}`,
      );
      this.currentText.setColor("#00f0ff");
      this.nextText.setVisible(false);
      this.hideBuyButton();
      return;
    }

    // --- Уровень ---
    this.levelText.setText(
      maxed
        ? `LEVEL ${lv} / ${this.mod.maxLevel} — MAX`
        : `LEVEL ${lv} → ${lv + 1}`,
    );

    // --- Текущий эффект ---
    this.currentText.setText(`CURRENT: ${this.mod.effectText(lv)}`);
    this.currentText.setColor("#e8f6ff");

    if (maxed) {
      this.nextText.setText("UPGRADE COMPLETE").setColor("#ffd700").setVisible(true);
      this.hideBuyButton();
    } else {
      // --- Следующий эффект + прирост в одну строку ---
      const nextEffect = this.mod.effectText(lv + 1);
      const delta = this.getDeltaText(lv);
      this.nextText.setText(`NEXT: ${nextEffect} ${delta}`);
      this.nextText.setColor(colorToHex(COLOR_GOLD));
      this.nextText.setVisible(true);

      // --- Кнопка покупки: y = 105, 200×44 ---
      const cost = this.mod.costs[lv];
      const affordable = GameState.getCoins() >= cost;
      const accent = affordable ? this.mod.color : 0x555566;
      drawNeonPlate(this.buyBg, 200, 44, accent, 10, affordable ? 0.2 : 0.12);
      this.buyTxt.setText(`UPGRADE  ${cost.toLocaleString("en-US")} CR`);
      this.buyTxt.setColor(affordable ? "#ffffff" : "#888899");

      if (!this.buyBtn) {
        this.buyBtn = this.scene.add.container(0, 105, [this.buyBg, this.buyTxt]);
        this.buyBtn.setSize(200, 44);
        this.buyBtn.setInteractive({ useHandCursor: true });
        this.buyBtn.on("pointerover", () =>
          this.scene.tweens.add({ targets: this.buyBtn, scale: 1.05, duration: 100 }),
        );
        this.buyBtn.on("pointerout", () =>
          this.scene.tweens.add({ targets: this.buyBtn, scale: 1, duration: 100 }),
        );
        this.buyBtn.on(
          "pointerup",
          (
            _p: Phaser.Input.Pointer,
            _lx: number,
            _ly: number,
            event: Phaser.Types.Input.EventData,
          ) => {
            event.stopPropagation();
            this.attemptUpgrade();
          },
        );
        this.root.addAt(this.buyBtn, this.root.length - 1);
      } else {
        this.buyBtn.setVisible(true);
        this.buyBtn.setInteractive({ useHandCursor: true });
      }
    }
  }

  /** Текст прироста бонуса между уровнями (короткая строка в скобках) */
  private getDeltaText(lv: number): string {
    switch (this.mod.key) {
      case "engineering": {
        const cur = Math.max(8, 20 - (lv - 1) * 3);
        const next = Math.max(8, 20 - lv * 3);
        return `(${cur}s → ${next}s, −${cur - next}s)`;
      }
      case "finance": {
        const cur = (1 + lv * 0.1).toFixed(1);
        const next = (1 + (lv + 1) * 0.1).toFixed(1);
        return `(x${cur} → x${next}, +${(0.1).toFixed(1)}x)`;
      }
      case "design": {
        const cur = 3 + lv;
        const next = 3 + lv + 1;
        return `(${cur} → ${next} skins, +1)`;
      }
      default:
        return "";
    }
  }

  /** Прячет кнопку покупки (режимы MAX и стройки) */
  private hideBuyButton(): void {
    this.buyBg.clear();
    this.buyTxt.setText("");
    if (this.buyBtn) {
      this.buyBtn.disableInteractive();
      this.buyBtn.setVisible(false);
    }
  }

  /**
   * Посекундный тик из сцены: обновляет обратный отсчёт стройки,
   * пока модалка открыта. После завершения — перерисовка состояния.
   */
  tick(): void {
    if (!this.scene || !this.root.scene) return;
    const build = GameState.getStationBuilds()[this.mod.key];
    if (build.isBuilding) {
      // Обновляем отсчёт в текущем тексте
      this.currentText.setText(formatDuration(build.finishTime - Date.now(), true));
    } else if (this.levelText.text.includes("CONSTRUCTION")) {
      // Постройка завершилась, пока окно было открыто
      this.refresh();
    }
  }

  private attemptUpgrade(): void {
    if (this.level >= this.mod.maxLevel) return;

    const ok = this.cb.onAttemptUpgrade(this.mod);
    if (ok) {
      // Уровень придёт после постройки — окно просто переключается
      // в режим "UNDER CONSTRUCTION"
      this.refresh();
    } else {
      // Лёгкая тряска кнопки при нехватке кредитов
      this.scene.tweens.add({
        targets: this.buyBtn,
        x: { from: -6, to: 0 },
        duration: 60,
        yoyo: true,
        repeat: 2,
      });
    }
  }

  destroy(): void {
    // Повторный вызов (shutdown сцены после ручного закрытия) — no-op,
    // чтобы onDestroy не сработал дважды
    if (!this.dim.scene) return;
    this.cb.onDestroy?.();
    this.dim.destroy();
    this.root.destroy(true);
  }
}

// ============================================================
// StationScene — сам хаб: расстановка зданий, производство
// бустов, экономика и модальные окна.
// ============================================================

export class StationScene extends Phaser.Scene {
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private coinPlate!: CoinPlate;
  private bpPlate!: CoinPlate;
  private backBtn!: Phaser.GameObjects.Container;
  private toast?: Phaser.GameObjects.Text;

  private buildings: StationBuilding[] = [];
  private modal?: UpgradeModal;
  private commandCore!: CommandCore;
  private connectorGfx!: Phaser.GameObjects.Graphics;
  private pulses: Phaser.GameObjects.Container[] = [];
  private infoPanel!: Phaser.GameObjects.Container;
  private infoPanelBg!: Phaser.GameObjects.Graphics;

  constructor() {
    super("Station");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR_BG);
    this.cameras.main.fadeIn(300, 0, 0, 0);

    // Синхронизируем BP при входе на станцию (Design Wing генерирует пассивно)
    GameState.syncBlueprints();
    void gameServices.updateBlueprintsToCloud(
      GameState.getBlueprints(),
      GameState.getLastBpTimestamp(),
    );

    this.gridGraphics = this.add.graphics().setDepth(0);
    // Заголовок прижат к левому краю под кнопкой BACK — правый верхний
    // угол занят столбцом ресурсов (кредиты + чертежи)
    this.titleText = this.add
      .text(0, 0, "SPACE STATION", {
        fontSize: "20px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    // Плашка баланса кредитов справа сверху
    this.coinPlate = new CoinPlate(this, 0, 0, GameState.getCoins(), "CR");
    this.coinPlate.setDepth(50);

    // Плашка чертежей (BP) — второй ресурс правого столбца
    this.bpPlate = new CoinPlate(this, 0, 0, GameState.getBlueprints(), "BP");
    this.bpPlate.setDepth(50);

    this.createBackButton();

    // Центральное ядро и коридоры к отсекам (под зданиями)
    this.connectorGfx = this.add.graphics().setDepth(5);
    this.commandCore = new CommandCore(this);
    this.commandCore.setDepth(8);
    this.add.existing(this.commandCore);

    this.createBuildings();
    this.createInfoPanel();
    this.startBoostProduction();

    // Стройки, завершившиеся пока игрок был вне станции
    this.tickBuildTimers();
    // Посекундный тик таймеров построек
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.tickBuildTimers(),
    });

    this.layout(this.scale.width, this.scale.height);

    const onResize = (size: Phaser.Structs.Size) => this.layout(size.width, size.height);
    this.scale.on("resize", onResize);
    this.events.once("shutdown", () => {
      this.scale.off("resize", onResize);
      this.modal?.destroy();
    });
  }

  // --- Здания базы вокруг центрального ядра ---
  private createBuildings(): void {
    const levels = GameState.getStation();
    this.buildings = MODULES.map((mod) => {
      const building = new StationBuilding(
        this,
        mod,
        levels[mod.key],
        (b) => this.openUpgradeModal(b),
      );
      building.setDepth(10);
      this.add.existing(building);
      return building;
    });
  }

  // --- Нижняя инфо-панель: иконка + название + шкала уровня ---
  private createInfoPanel(): void {
    this.infoPanelBg = this.add.graphics().setDepth(40);
    this.infoPanel = this.add.container(0, 0).setDepth(41);
    this.refreshInfoPanel();
  }

  private refreshInfoPanel(): void {
    this.infoPanel.removeAll(true);
    const w = this.scale.width;
    const h = this.scale.height;
    const pad = 12;
    const panelH = 72;
    const panelY = h - panelH / 2 - pad;

    // Полупрозрачный фон на всю ширину
    this.infoPanelBg.clear();
    this.infoPanelBg.fillStyle(COLOR_DARK_PANEL, 0.82);
    this.infoPanelBg.fillRoundedRect(pad, panelY - panelH / 2, w - pad * 2, panelH, 10);
    this.infoPanelBg.lineStyle(1, COLOR_CYAN, 0.25);
    this.infoPanelBg.strokeRoundedRect(pad, panelY - panelH / 2, w - pad * 2, panelH, 10);

    const slotW = (w - pad * 2) / MODULES.length;
    const levels = GameState.getStation();

    MODULES.forEach((mod, i) => {
      const cx = pad + slotW * i + slotW / 2;

      // Иконка модуля (векторная)
      const iconG = this.add.graphics();
      drawSciFiIcon(iconG, mod.key, mod.color, 14);
      iconG.setPosition(cx - 50, panelY - 2);
      this.infoPanel.add(iconG);

      // Название
      const name = this.add.text(cx - 34, panelY - 12, mod.title, {
        fontSize: "12px",
        color: "#ffffff",
        fontStyle: "bold",
        fontFamily: 'Consolas, "Courier New", monospace',
      }).setOrigin(0, 0.5);
      this.infoPanel.add(name);

      // Шкала уровня
      const lv = levels[mod.key];
      const barG = this.add.graphics();
      const segW = 10;
      const gap = 2;
      const totalW = mod.maxLevel * segW + (mod.maxLevel - 1) * gap;
      const startX = cx - 34;
      const barY = panelY + 8;
      for (let j = 0; j < mod.maxLevel; j++) {
        const sx = startX + j * (segW + gap);
        if (j < lv) {
          barG.fillStyle(mod.color, 0.95);
          barG.fillRect(sx, barY, segW, 5);
        } else {
          barG.lineStyle(1, mod.color, 0.4);
          barG.strokeRect(sx, barY, segW, 5);
        }
      }
      this.infoPanel.add(barG);

      // Lv.N справа
      const lvText = this.add.text(cx - 34 + totalW + 8, panelY + 8, `Lv.${lv}`, {
        fontSize: "11px",
        color: "#aaaaaa",
        fontFamily: 'Consolas, "Courier New", monospace',
      }).setOrigin(0, 0);
      this.infoPanel.add(lvText);
    });
  }

  // --- Производство бустов: у каждого отсека свой таймер ---
  private startBoostProduction(): void {
    this.buildings.forEach((building, index) => {
      const delay = building.module.key === "finance" ? 9000 : 14000;
      this.time.addEvent({
        delay,
        // Рассинхрон, чтобы бусты не появлялись синхронной волной
        startAt: Phaser.Math.Between(2500, delay - 1500),
        loop: true,
        callback: () => this.spawnBoost(building),
      });
      void index;
    });
  }

  private spawnBoost(building: StationBuilding): void {
    if (building.hasActiveBoost) return;
    building.hasActiveBoost = true;

    // === JUICE === спавн буста СБОКУ от здания, а не прямо над плашкой READY
    const spawnX = building.x + 35;
    const spawnY = building.y + building.roofY;
    const icon = this.add.container(spawnX, spawnY);
    icon.setDepth(60);

    const glow = this.add.graphics();
    glow.fillStyle(building.module.color, 0.25);
    glow.fillCircle(0, 0, 17);
    glow.lineStyle(1.5, building.module.color, 0.7);
    glow.strokeCircle(0, 0, 17);

    // Векторная иконка буста: отличается от логотипа здания
    const glyph = this.add.graphics();
    this.drawBoostGlyph(glyph, building.module.key, building.module.color, 10);

    icon.add([glow, glyph]);
    icon.setSize(40, 40);
    icon.setInteractive({ useHandCursor: true });

    // Покачивание вверх-вниз
    this.tweens.add({
      targets: icon,
      y: "-=8",
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Клик строго по иконке: stopPropagation не даёт событию
    // провалиться в хит-зону здания под ней
    icon.on(
      "pointerup",
      (
        _p: Phaser.Input.Pointer,
        _lx: number,
        _ly: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.collectBoost(building, icon);
      },
    );
  }

  /**
   * Иконки бустов отличаются от логотипов зданий:
   * engineering → гаечный ключ, finance → кристалл, design → атом
   */
  private drawBoostGlyph(
    g: Phaser.GameObjects.Graphics,
    key: string,
    color: number,
    s: number,
  ): void {
    g.clear();
    g.lineStyle(2, color, 0.95);

    switch (key) {
      case "engineering": {
        // Гаечный ключ ( wrench )
        g.lineBetween(-s, s, s * 0.3, -s * 0.3);
        g.beginPath();
        g.arc(s * 0.3, -s * 0.3, s * 0.45, -0.8, Math.PI * 0.6, false);
        g.strokePath();
        g.lineBetween(s * 0.55, -s * 0.7, s * 0.55, -s * 0.2);
        break;
      }
      case "finance": {
        // Кристалл / Алмаз (тот же что drawSciFiIcon finance)
        drawSciFiIcon(g, "finance", color, s);
        break;
      }
      case "design": {
        // Атом / Орбиты
        drawSciFiIcon(g, "design", color, s);
        break;
      }
    }
  }

  private collectBoost(building: StationBuilding, icon: Phaser.GameObjects.Container): void {
    building.hasActiveBoost = false;

    const mod = building.module;
    // Множитель уровня отсека, награды кратны 5
    const mult = 1 + building.currentLevel * 0.25;

    // Эффект буста привязан к игровой роли отсека
    let rewardText: string;
    let rewardColor: number;
    // Целевая плашка для полёта частицы (null = инженерный = LIFE)
    let targetPlate: Phaser.GameObjects.Container | null = null;

    switch (mod.key) {
      case "engineering": {
        // Мгновенный ремонт: +1 жизнь запаса энергии.
        // Если склад полон, излишек ремонта продаётся за кредиты
        if (GameState.getLives() < GameState.getMaxLives()) {
          GameState.setLives(GameState.getLives() + 1);
          rewardText = "+1 LIFE";
          rewardColor = COLOR_CYAN;
          targetPlate = null; // LIFE — нет плашки, частица просто улетает
        } else {
          GameState.addCoins(20); // === БАЛАНС === излишек ремонта = 20 CR
          this.updateCoinDisplay();
          rewardText = "+20 CR";
          rewardColor = COLOR_GOLD;
          targetPlate = this.coinPlate;
        }
        break;
      }
      case "finance": {
        // Кристаллы с учётом уровня Finance Office
        // === БАЛАНС === база 45 CR × (1 + уровень×0.25)
        const amount = Math.max(5, Math.round((45 * mult) / 5) * 5);
        GameState.addCoins(amount);
        this.updateCoinDisplay();
        rewardText = `+${amount} CR`;
        rewardColor = COLOR_GOLD;
        targetPlate = this.coinPlate;
        break;
      }
      case "design": {
        // Чертежи (BP) — исследовательская валюта Design Wing
        // === БАЛАНС === база 10 BP × (1 + уровень×0.25)
        const bp = Math.max(5, Math.round((10 * mult) / 5) * 5);
        GameState.addBlueprints(bp);
        this.updateBlueprintDisplay();
        rewardText = `+${bp} BP`;
        rewardColor = COLOR_PINK;
        targetPlate = this.bpPlate;
        break;
      }
    }

    // === JUICE: Светящаяся частица летит от здания к плашке ===
    const particle = this.add.circle(icon.x, icon.y, 5, rewardColor, 0.9);
    particle.setDepth(62);

    // Взлёт и растворение оригинальной иконки
    this.tweens.killTweensOf(icon);
    this.tweens.add({
      targets: icon,
      y: "-=46",
      scale: 1.35,
      alpha: 0,
      duration: 450,
      ease: "Cubic.easeOut",
      onComplete: () => icon.destroy(true),
    });

    if (targetPlate) {
      // Частица летит к плашке ресурсов + импульс масштаба
      this.tweens.add({
        targets: particle,
        x: targetPlate.x,
        y: targetPlate.y,
        scale: 0.5,
        duration: 500,
        ease: "Cubic.easeIn",
        onComplete: () => {
          particle.destroy();
          this.pulsePlate(targetPlate!);
        },
      });
    } else {
      // LIFE — частица просто взлетает вверх и растворяется
      this.tweens.add({
        targets: particle,
        y: particle.y - 60,
        alpha: 0,
        scale: 1.5,
        duration: 450,
        ease: "Cubic.easeOut",
        onComplete: () => particle.destroy(),
      });
    }

    // Всплывающая цифра награды
    const float = this.add
      .text(icon.x, icon.y - 26, rewardText, {
        fontSize: "14px",
        color: colorToHex(rewardColor),
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(61);
    this.tweens.add({
      targets: float,
      y: "-=30",
      alpha: 0,
      duration: 800,
      ease: "Sine.easeOut",
      onComplete: () => float.destroy(),
    });
  }

  /** Импульс масштаба плашки ресурсов при получении буста */
  private pulsePlate(plate: Phaser.GameObjects.Container): void {
    this.tweens.killTweensOf(plate);
    this.tweens.add({
      targets: plate,
      scale: { from: 1.15, to: 1 },
      duration: 280,
      ease: "Back.easeOut",
    });
  }

  // --- Модальное окно апгрейда ---
  private openUpgradeModal(building: StationBuilding): void {
    if (this.modal) return;
    this.modal = new UpgradeModal(this, building.module, building.currentLevel, {
      onAttemptUpgrade: (mod) => this.tryUpgrade(mod),
      onRequestToast: (msg, color) => this.showToast(msg, color),
      // Ссылка сбрасывается из любого пути закрытия:
      // крестик, клик по dim, shutdown сцены
      onDestroy: () => {
        this.modal = undefined;
      },
    });
  }

  /**
   * Тик построек: обновляет отсчёты над зданиями, достраивает
   * истёкшие модули и синхронизирует открытую модалку.
   */
  private tickBuildTimers(): void {
    const builds = GameState.getStationBuilds();
    const now = Date.now();
    const coins = GameState.getCoins();

    this.buildings.forEach((b) => {
      const st = builds[b.module.key];
      if (st.isBuilding && st.finishTime > now) {
        b.setBuildCountdown(st.finishTime - now);
      } else {
        b.setBuildCountdown(null);
      }
      // === JUICE: обновляем статус-бейдж (READY / CONSTRUCTION / MAX) ===
      b.updateStatusBadge(coins);
    });

      const completed = GameState.finalizeFinishedBuilds();
      if (completed.length > 0) {
        const freshLevels = GameState.getStation();
        completed.forEach((key) => {
          this.buildings.find((b) => b.module.key === key)?.refresh(freshLevels[key]);
          const title = MODULES.find((m) => m.key === key)?.title ?? key;
          this.showToast(`${title} ONLINE`, COLOR_CYAN);
          // === БАЛАНС: при достройке Design Wing сбрасываем таймер BP ===
          if (key === "design") {
            GameState.setLastBpTimestamp(Date.now());
          }
        });
        // Модалка сама перерисуется, если её модуль достроен (с guard'ом)
        this.modal?.tick();
        this.refreshInfoPanel();
      }
  }

  private tryUpgrade(mod: StationModule): boolean {
    const levels = GameState.getStation();
    const level = levels[mod.key];
    if (level >= mod.maxLevel) return false;

    // Повторный апгрейд строящегося модуля невозможен
    const builds = GameState.getStationBuilds();
    if (builds[mod.key].isBuilding) return false;

    const cost = mod.costs[level];
    if (GameState.getCoins() < cost) {
      this.showToast("NOT ENOUGH CREDITS", COLOR_PINK);
      return false;
    }

    GameState.addCoins(-cost);
    // Уровень придёт не сразу, а по таймеру стройки
    GameState.setStationBuild(mod.key, {
      isBuilding: true,
      finishTime: Date.now() + mod.buildDurationsMs[level],
    });
    this.updateCoinDisplay();

    // Здание сразу переходит в режим стройки с обратным отсчётом
    const purchased = this.buildings.find((b) => b.module.key === mod.key);
    purchased?.setBuildCountdown(mod.buildDurationsMs[level]);

    // === JUICE: обновляем статус-бейджи после траты кредитов ===
    const coinsLeft = GameState.getCoins();
    this.buildings.forEach((b) => b.updateStatusBadge(coinsLeft));

    // Мета-прогресс сразу уезжает в облако (fire-and-forget)
    const skinId = getSelectedSkin().id;
    const custom = loadCustomization();
    void gameServices.saveProgress({
      achievements: [],
      selectedShip: skinId,
      selectedSkin: skinId,
      stationLevels: levels,
      coins: GameState.getCoins(),
      blueprints: GameState.getBlueprints(),
      lastBpTimestamp: GameState.getLastBpTimestamp(),
      customization: custom,
    });
    return true;
  }

  private updateCoinDisplay(): void {
    this.coinPlate.setAmount(GameState.getCoins());
  }

  private updateBlueprintDisplay(): void {
    this.bpPlate.setAmount(GameState.getBlueprints());
  }

  private createBackButton(): void {
    const bg = this.add.graphics();
    drawNeonPlate(bg, 140, 42, COLOR_CYAN, 10);

    const txt = this.add
      .text(0, 0, "BACK", {
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.backBtn = this.add.container(0, 0, [bg, txt]);
    this.backBtn.setSize(140, 42);
    this.backBtn.setInteractive({ useHandCursor: true });

    this.backBtn.on("pointerover", () =>
      this.tweens.add({ targets: this.backBtn, scale: 1.05, duration: 100 }),
    );
    this.backBtn.on("pointerout", () =>
      this.tweens.add({ targets: this.backBtn, scale: 1, duration: 100 }),
    );
    this.backBtn.on(
      "pointerup",
      (
        _p: Phaser.Input.Pointer,
        _lx: number,
        _ly: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.closeScene();
      },
    );
  }

  private closeScene(): void {
    this.modal?.destroy();
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("MainMenu");
    });
  }

  private showToast(message: string, color: number): void {
    if (this.toast) this.toast.destroy();

    const hex = colorToHex(color);
    this.toast = this.add
      .text(this.scale.width / 2, this.scale.height * 0.62, message, {
        fontSize: "14px",
        color: hex,
        fontStyle: "bold",
        backgroundColor: "#00000099",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(100);

    this.tweens.add({
      targets: this.toast,
      y: "-=20",
      alpha: { from: 1, to: 0 },
      duration: 1400,
      onComplete: () => this.toast?.destroy(),
    });
  }

  // --- Единый адаптивный Layout ---
  private layout(w: number, h: number): void {
    // При ресайзе модалку закрываем — её координаты привязаны к старому экрану
    this.modal?.destroy();
    this.modal = undefined;

    // Шапка: BACK и кредиты на одной верхней строке по краям,
    // чертежи — вторым ресурсом правого столбца,
    // заголовок прижат влево под кнопкой BACK
    const pad = 16;
    this.backBtn.setPosition(pad + 70, pad + 19);
    this.coinPlate.setPosition(w - pad - 65, pad + 19);
    this.bpPlate.setPosition(w - pad - 65, pad + 61);
    this.titleText.setPosition(pad + 8, pad + 62);

    drawGrid(this.gridGraphics, w, h);
    this.updateCoinDisplay();
    this.updateBlueprintDisplay();

    // Масштаб базы под маленькие экраны
    const baseScale = Phaser.Math.Clamp(Math.min(w / 520, h / 680), 0.62, 1);

    // Ядро в центре, отсеки вокруг него треугольником
    const corePos = { x: w * 0.5, y: h * 0.47 };
    this.commandCore.setPosition(corePos.x, corePos.y);
    this.commandCore.setScale(baseScale);

    const slots = [
      { x: w * 0.25, y: h * 0.73 }, // ENGINEERING BAY — слева внизу
      { x: w * 0.5, y: h * 0.28 },  // FINANCE OFFICE — выше центра
      { x: w * 0.75, y: h * 0.73 }, // DESIGN WING — справа внизу
    ];
    this.buildings.forEach((building, index) => {
      building.setPosition(slots[index].x, slots[index].y);
      building.setBaseScale(baseScale);
    });

    this.rebuildCorridors(corePos, slots, baseScale);
    this.refreshInfoPanel();
  }

  /**
   * Неоновые коридоры-трубы от Command Core к отсекам.
   * Три слоя обводки (гало → тело → ядро) + бегущие импульсы света
   * от центра к модулям. Пересоздаются при каждом layout.
   */
  private rebuildCorridors(
    from: { x: number; y: number },
    targets: { x: number; y: number }[],
    s: number,
  ): void {
    // Сносим старые импульсы вместе с их твинам
    this.pulses.forEach((p) => {
      this.tweens.killTweensOf(p);
      p.destroy(true);
    });
    this.pulses = [];

    const g = this.connectorGfx;
    g.clear();

    MODULES.forEach((mod, i) => {
      const to = targets[i];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      // Обрезаем концы: труба выходит из корпуса ядра и входит
      // в боковую стенку модуля (под плавающей подписью)
      const sx = from.x + ux * 52 * s;
      const sy = from.y + uy * 30 * s;
      const ex = to.x - ux * 66 * s;
      // Опускаем точку входа к середине корпуса здания,
      // чтобы линии не прорезали парящие подписи и пипсы
      const ey = to.y + 30 * s;
      const segLen = Math.hypot(ex - sx, ey - sy);

      g.lineStyle(7, mod.color, 0.07);
      g.lineBetween(sx, sy, ex, ey);
      g.lineStyle(3, mod.color, 0.16);
      g.lineBetween(sx, sy, ex, ey);
      g.lineStyle(1.3, mod.color, 0.75);
      g.lineBetween(sx, sy, ex, ey);

      // Стык-муфта у входа в модуль
      g.fillStyle(mod.color, 0.8);
      g.fillCircle(ex, ey, 3);

      // Два импульса со сдвигом фазы: контейнер с гало и белым ядром
      for (let k = 0; k < 2; k++) {
        const pulse = this.add.container(sx, sy).setDepth(5);
        const halo = this.add.circle(0, 0, 5, mod.color, 0.3);
        const dot = this.add.circle(0, 0, 2, 0xffffff, 0.95);
        pulse.add([halo, dot]);

        const duration = Phaser.Math.Clamp(segLen * 2.4, 900, 2400);
        this.tweens.add({
          targets: pulse,
          x: ex,
          y: ey,
          ease: "Linear",
          duration,
          repeat: -1,
          delay: k * duration * 0.5 + i * 300,
        });
        this.pulses.push(pulse);
      }
    });
  }
}
