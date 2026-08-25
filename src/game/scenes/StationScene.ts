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
    // === БАЛАНС === ур.1 — реген каждые 20с, каждый уровень на 3с быстрее,
    // минимум 8с (значения дублируются в Game.setupLifeRegen)
    costs: [400, 800, 1600, 3200, 6400],
    // === БАЛАНС === время стройки по уровням: 5/15/30/60/90 минут
    buildDurationsMs: [5, 15, 30, 60, 90].map((m) => m * 60_000),
    effectText: (level) =>
      level === 0
        ? "NO AUTO REPAIR"
        : `AUTO REPAIR EVERY ${Math.max(8, 20 - (level - 1) * 3)}S`,
  },
  {
    key: "finance",
    title: "FINANCE OFFICE",
    description: "Boosts coin income multiplier per run. More levels = more credits from every successful escape.",
    maxLevel: 5,
    color: COLOR_GOLD,
    // === БАЛАНС === +10% монет за уровень (x1.1 … x1.5),
    // значения дублируются в Game.showGameOver
    costs: [400, 800, 1600, 3200, 6400],
    // === БАЛАНС === время стройки по уровням: 5/15/30/60/90 минут
    buildDurationsMs: [5, 15, 30, 60, 90].map((m) => m * 60_000),
    effectText: (level) =>
      `COIN INCOME x${(1 + level * 0.1).toFixed(1)} PER RUN`,
  },
  {
    key: "design",
    title: "DESIGN WING",
    description: "Unlocks new ship skins and blueprints. Each level reveals a unique ship design.",
    maxLevel: 3,
    color: COLOR_PINK,
    // === БАЛАНС === каждый уровень открывает один новый скин корабля
    costs: [500, 1500, 4000],
    // === БАЛАНС === время стройки по уровням: 10/30/60 минут
    buildDurationsMs: [10, 30, 60].map((m) => m * 60_000),
    effectText: (level) => `${3 + level} SHIP DESIGNS UNLOCKED`,
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

/** Посадочная площадка: неоновый эллипс с угловыми метками */
function drawLandingPad(
  g: Phaser.GameObjects.Graphics,
  hw: number,
  hh: number,
  depth: number,
  color: number,
): void {
  const padRx = hw + 18;
  const padRy = Math.round(padRx / 2.4);
  const padY = hh + depth + 2;

  g.lineStyle(1.5, color, 0.35);
  g.strokeEllipse(0, padY, padRx * 2, padRy * 2);
  g.lineStyle(2, color, 0.5);
  [
    [-padRx + 6, 0],
    [padRx - 6, 0],
    [0, -padRy + 4],
    [0, padRy - 4],
  ].forEach(([tx, ty]) => {
    g.lineBetween(tx - 4, padY + ty, tx + 4, padY + ty);
    g.lineBetween(tx, padY + ty - 4, tx, padY + ty + 4);
  });
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
// StationBuilding — изометрическое неоновое здание отсека.
// Рисуется через Graphics: посадочная площадка (эллипс), ромб
// верхней грани, две боковые грани-стены, окна по уровню,
// антенна с мигающим маячком. Над зданием парят название
// и ромбовидные пипсы уровня.
// ============================================================

class StationBuilding extends Phaser.GameObjects.Container {
  readonly module: StationModule;

  private level: number;
  private readonly onSelect: (building: StationBuilding) => void;
  /** Базовый масштаб из layout; эффекты ховера умножаются на него */
  private baseScale = 1;
  /** Здание заблокировано (уровень 0) — затемнение + отключение луча */
  private locked = false;

  private shapeGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private labelBox!: Phaser.GameObjects.Container;
  private nameText!: Phaser.GameObjects.Text;
  private pipsG!: Phaser.GameObjects.Graphics;
  private glyphGfx!: Phaser.GameObjects.Graphics;
  private beacon!: Phaser.GameObjects.Arc;
  private buildText?: Phaser.GameObjects.Text;
  private wrenchGfx?: Phaser.GameObjects.Graphics;

  // --- Статус-бейджи (READY / UNDER CONSTRUCTION / MAX) ---
  private statusBadge!: Phaser.GameObjects.Container;
  private statusBg!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private buildProgressBar?: Phaser.GameObjects.Graphics;

  /** Активный (несобранный) буст над зданием — не больше одного */
  public hasActiveBoost = false;

  // Габариты изометрии
  private static readonly HALF_W = 52;
  private static readonly HALF_H = 24;
  /** Y-координата иконки на крышке (центр верхней грани) */
  private static readonly GLYPH_Y = -3;

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

    // Слой спецеффектов отсека (сварка/волны/лазер) — рисуется в redraw()
    this.fxGfx = scene.add.graphics();

    // Логотип-проекция на верхней грани корпуса (векторная иконка)
    this.glyphGfx = scene.add.graphics();
    this.glyphGfx.setPosition(0, StationBuilding.GLYPH_Y);

    // Парящая подпись: название + пипсы уровня
    this.nameText = scene.add
      .text(0, 0, module.title, {
        fontSize: "13px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.pipsG = scene.add.graphics();
    this.labelBox = scene.add.container(0, 0, [this.nameText, this.pipsG]);

    this.beacon = scene.add.circle(0, 0, 3, module.color, 1);

    this.add([this.shapeGfx, this.fxGfx, this.glyphGfx, this.labelBox, this.beacon]);

    // --- Статус-бейдж: парит над пипсами уровня ---
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

    // Хит-зона = весь изометрический корпус + парящая подпись сверху
    this.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-74, -86, 148, 178),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    // Визуальный отклик на наведение и нажатие
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
        if (this.locked) return;
        this.playClickImpulse();
        this.onSelect(this);
      },
    );

    // Мягкая левитация подписи
    scene.tweens.add({
      targets: this.labelBox,
      y: "-=5",
      duration: 1600 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Мигание маячка на антенне
    scene.tweens.add({
      targets: this.beacon,
      alpha: 0.15,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: Math.random() * 800,
    });

    this.redraw();
    this.drawFx();
    this.locked = this.level === 0;
    this.updateLockedVisuals();
    this.initFxTweens();
  }

  get currentLevel(): number {
    return this.level;
  }

  /**
   * Таймер стройки под названием отсека.
   * null — прячет строку и возвращает подпись на место.
   */
  setBuildCountdown(remainingMs: number | null): void {
    if (!this.buildText) {
      this.buildText = this.scene.add
        .text(0, 27, "", {
          fontSize: "13px",
          color: "#ffd700",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.labelBox.add(this.buildText);

      // Векторная иконка гаечного ключа вместо эмодзи
      this.wrenchGfx = this.scene.add.graphics();
      this.drawWrenchIcon(this.wrenchGfx, this.module.color, 7);
      this.labelBox.add(this.wrenchGfx);
    }

    if (remainingMs === null) {
      if (this.buildText.visible) {
        this.buildText.setVisible(false);
        this.wrenchGfx?.setVisible(false);
        this.labelBox.setPosition(0, this.roofY - 16);
      }
      return;
    }

    // Поднимаем подпись выше, чтобы таймер не наезжал на антенну
    this.labelBox.setPosition(0, this.roofY - 30);
    this.buildText.setVisible(true);
    this.wrenchGfx?.setVisible(true);
    this.buildText.setText(formatDuration(remainingMs, true));
    // Ключ слева от текста
    this.wrenchGfx?.setPosition(-44, 27);
  }

  /** Маленькая векторная иконка гаечного ключа */
  private drawWrenchIcon(g: Phaser.GameObjects.Graphics, color: number, s: number): void {
    g.clear();
    g.lineStyle(1.8, color, 0.9);
    // Ручка ключа (диагональ)
    g.lineBetween(-s, s, s * 0.3, -s * 0.3);
    // Головка ключа (полукруг)
    g.beginPath();
    g.arc(s * 0.3, -s * 0.3, s * 0.45, -0.8, Math.PI * 0.6, false);
    g.strokePath();
    // Зубцы
    g.lineBetween(s * 0.55, -s * 0.7, s * 0.55, -s * 0.2);
  }

  /** Верхняя точка здания (для спавна бустов над крышей) */
  get roofY(): number {
    return -(StationBuilding.HALF_H + 26);
  }

  /** Масштаб из layout; заодно сбрасывает незавершённые скейл-твины */
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

  /** Импульс засчитанного клика: сжатие → отскок → возврат к базе */
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

  /** Перерисовка при изменении уровня: здание «растёт» вверх */
  refresh(level: number): void {
    this.level = level;
    this.locked = level === 0;
    this.redraw();
    this.drawFx();
    this.updateLockedVisuals();
  }

  /** Визуальное состояние заблокированного здания (уровень 0) */
  private updateLockedVisuals(): void {
    // Затемняем корпус и иконку, отключаем луч в небо
    this.setAlpha(this.locked ? 0.4 : 1);
    this.setInteractive({ useHandCursor: !this.locked });
  }

  private redraw(): void {
    const { HALF_W, HALF_H, GLYPH_Y } = StationBuilding;
    const c = this.module.color;
    const depth = 22 + this.level * 7; // высота стен растёт с уровнем
    const g = this.shapeGfx;

    g.clear();
    drawLandingPad(g, HALF_W, HALF_H, depth, c);

    // === БАЛАНС === Яркость отсеков: Finance и Design более сочные
    const isoStyle: IsoStyle =
      this.module.key === "finance"
        ? { wallShadeDark: 0.58, wallShadeLight: 0.32, topFillAlpha: 0.6, edgeColor: 0xffd700 }
        : this.module.key === "design"
          ? { wallShadeDark: 0.55, wallShadeLight: 0.30, topFillAlpha: 0.6, edgeColor: 0xff1493 }
          : {}; // engineering — дефолт
    drawIsoStructure(g, HALF_W, HALF_H, depth, c, isoStyle);

    // Векторная иконка отсека на крышке (поверх свечения)
    drawSciFiIcon(this.glyphGfx, this.module.key, c, 12);

    // Свечение вокруг иконки-логотипа на крышке
    const glyphAlpha = this.module.key === "engineering" ? 0.16 : 0.32;
    g.fillStyle(c, glyphAlpha);
    g.fillCircle(0, GLYPH_Y, 14);
    g.lineStyle(1.2, c, this.module.key === "engineering" ? 0.4 : 0.7);
    g.strokeCircle(0, GLYPH_Y, 14);

    // Антенна с мигающим маячком
    g.lineStyle(1.5, c, 0.8);
    g.lineBetween(0, -HALF_H, 0, -HALF_H - 16);
    this.beacon.setPosition(0, -HALF_H - 18);

    // Подпись над зданием
    this.labelBox.setPosition(0, this.roofY - 16);
    this.drawPips();
  }

  /** Ромбовидные пипсы уровня над названием */
  private drawPips(): void {
    const g = this.pipsG;
    g.clear();
    const total = this.module.maxLevel;
    for (let i = 0; i < total; i++) {
      const px = (i - (total - 1) / 2) * 15;
      const py = 13;
      g.save();
      g.translateCanvas(px, py);
      g.rotateCanvas(Math.PI / 4);
      if (i < this.level) {
        g.fillStyle(this.module.color, 0.95);
        g.fillRect(-4, -4, 8, 8);
      } else {
        g.lineStyle(1.2, this.module.color, 0.4);
        g.strokeRect(-4, -4, 8, 8);
      }
      g.restore();
    }
  }

  // ================================================================
  // Спецэффекты отсеков: сварка / волны / лазер + заблокированное
  // ================================================================

  /**
   * Отрисовка анимационного слоя, специфичного для каждого отсека.
   * Вызывается из redraw(). Анимации (твины) запускаются один раз
   * в конструкторе через initFxTweens().
   */
  drawFx(): void {
    const g = this.fxGfx;
    g.clear();
    if (this.locked) return;

    const { HALF_W: hw, HALF_H: hh } = StationBuilding;
    const c = this.module.color;
    const depth = 22 + this.level * 7;

    switch (this.module.key) {
      case "engineering": {
        // === СВАРКА: пульсирующие искры у правого шва корпуса ===
        // Три точки сварки вдоль правого вертикального ребра
        for (let i = 0; i < 3; i++) {
          const sx = hw * 0.7 - i * 6;
          const sy = hh * 0.5 + i * (depth / 4);
          // Внешнее свечение искры
          g.fillStyle(0xffffff, 0.25);
          g.fillCircle(sx, sy, 6 + i * 2);
          // Ядро искры
          g.fillStyle(0xffffff, 0.7);
          g.fillCircle(sx, sy, 2);
        }
        // Дым/пар от левого края крышки
        g.fillStyle(c, 0.12);
        g.fillCircle(-hw * 0.6, -hh * 0.4, 8);
        g.fillCircle(-hw * 0.4, -hh * 0.8, 5);
        break;
      }
      case "finance": {
        // === ЛУЧ: вертикальный пульсирующий столб + бегущие волны ===
        const beamAlpha = 0.18 + this.level * 0.04;
        g.lineStyle(3, c, beamAlpha);
        g.lineBetween(0, -hh, 0, -100 - this.level * 10);
        g.lineStyle(1, 0xffffff, beamAlpha * 0.6);
        g.lineBetween(0, -hh, 0, -80 - this.level * 8);
        // Бегущие световые полосы по рёбрам корпуса (статичные кадры)
        const waveY = hh + depth * 0.3;
        g.lineStyle(1.5, c, 0.35);
        g.lineBetween(-hw * 0.3, waveY, hw * 0.3, waveY - hh * 0.4);
        g.lineStyle(1, c, 0.2);
        g.lineBetween(-hw * 0.5, waveY + 4, hw * 0.5, waveY - hh * 0.4 + 4);

        // === CR: неоновый ромб валюты на фасаде здания ===
        const crY = -hh * 0.1;
        const crS = 9;
        const hw2 = crS * 0.75;
        // Гало
        g.lineStyle(4, 0xffb700, 0.1);
        g.beginPath();
        g.moveTo(0, crY - crS);
        g.lineTo(hw2, crY);
        g.lineTo(0, crY + crS);
        g.lineTo(-hw2, crY);
        g.closePath();
        g.strokePath();
        // Верхний треугольник (ярче)
        g.fillStyle(0xffb700, 0.5);
        g.beginPath();
        g.moveTo(0, crY - crS);
        g.lineTo(hw2, crY);
        g.lineTo(-hw2, crY);
        g.closePath();
        g.fillPath();
        // Нижний треугольник (приглушённый)
        g.fillStyle(0xffb700, 0.25);
        g.beginPath();
        g.moveTo(0, crY + crS);
        g.lineTo(hw2, crY);
        g.lineTo(-hw2, crY);
        g.closePath();
        g.fillPath();
        // Контур
        g.lineStyle(1.6, 0xffb700, 0.95);
        g.beginPath();
        g.moveTo(0, crY - crS);
        g.lineTo(hw2, crY);
        g.lineTo(0, crY + crS);
        g.lineTo(-hw2, crY);
        g.closePath();
        g.strokePath();
        // Блик
        g.fillStyle(0xffffff, 0.85);
        g.fillCircle(-hw2 * 0.25, crY - crS * 0.3, 1.2);
        break;
      }
      case "design": {
        // === ЛАЗЕР: горизонтальный сканирующий луч на крышке ===
        // Линия сканирования (горизонтальна по крыше-ромбу)
        g.lineStyle(1.8, c, 0.8);
        g.lineBetween(-hw * 0.8, -hh * 0.2, hw * 0.8, -hh * 0.2);
        // Конечные точки-марkerы
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(-hw * 0.8, -hh * 0.2, 2.5);
        g.fillCircle(hw * 0.8, -hh * 0.2, 2.5);
        // Проекция silhouette корабля (маленький треугольник)
        g.lineStyle(1.2, c, 0.55);
        g.beginPath();
        g.moveTo(0, -hh * 0.6);
        g.lineTo(-6, -hh * 0.1);
        g.lineTo(6, -hh * 0.1);
        g.closePath();
        g.strokePath();
        break;
      }
    }
  }

  /**
   * Анимации FX-слоя: вызывается один раз из конструктора.
   * Пульсирующие элементы (искры сварки, луч finance, сканер design).
   */
  private initFxTweens(): void {
    if (this.locked) return;

    switch (this.module.key) {
      case "engineering": {
        // Пульс яркости искр сварки
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
      }
      case "finance": {
        // Пульс ширины/яркости луча
        this.scene.tweens.add({
          targets: this.fxGfx,
          alpha: { from: 1, to: 0.5 },
          duration: 1400,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        break;
      }
      case "design": {
        // Сканер: горизонтальное движение
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

  /** Верхняя точка ядра (для прокладки коридоров) */
  get roofY(): number {
    return -(CommandCore.HALF_H + 26);
  }

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    const purple = COLOR_PURPLE;

    // Пульсирующие кольца на площадке — отдельный Graphics со своим
    // origin в центре эллипсов, чтобы твин масштаба расширял их симметрично
    this.ringGfx = scene.add.graphics();
    this.ringGfx.setPosition(0, CommandCore.HALF_H + CommandCore.DEPTH + 2);
    this.ringGfx.lineStyle(1.5, purple, 0.3);
    this.ringGfx.strokeEllipse(0, 0, 190, 80);
    this.ringGfx.lineStyle(1, 0xffffff, 0.22);
    this.ringGfx.strokeEllipse(0, 0, 232, 98);

    this.shapeGfx = scene.add.graphics();

    // Иконка реактора как светящаяся проекция на крышке
    const glyphGlow = scene.add.graphics();
    glyphGlow.fillStyle(purple, 0.22);
    glyphGlow.fillCircle(0, CommandCore.GLYPH_Y, 17);
    glyphGlow.lineStyle(1.2, purple, 0.5);
    glyphGlow.strokeCircle(0, CommandCore.GLYPH_Y, 17);
    const iconGfx = scene.add.graphics();
    iconGfx.setPosition(0, CommandCore.GLYPH_Y);

    // Парящая подпись
    const label = scene.add
      .text(0, 0, "COMMAND CORE", {
        fontSize: "14px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.labelBox = scene.add.container(0, -(CommandCore.HALF_H + 46), [label]);

    // Белый маячок на антенне
    this.beacon = scene.add.circle(0, 0, 3.5, 0xffffff, 1);

    this.add([this.ringGfx, this.shapeGfx, glyphGlow, iconGfx, this.labelBox, this.beacon]);

    this.drawBody();
    drawSciFiIcon(iconGfx, "core", purple, 15);

    // Пульс колец площадки
    scene.tweens.add({
      targets: this.ringGfx,
      scale: 1.1,
      alpha: 0.55,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Левитация подписи
    scene.tweens.add({
      targets: this.labelBox,
      y: "-=5",
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Частое мигание маячка
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
    drawIsoStructure(g, HALF_W, HALF_H, DEPTH, COLOR_PURPLE, {
      topFillColor: 0xffffff,
      edgeColor: COLOR_PURPLE,
    });

    // Двойная антенна с белым маячком
    g.lineStyle(1.5, COLOR_PURPLE, 0.9);
    g.lineBetween(0, -HALF_H, 0, -HALF_H - 20);
    g.lineBetween(-7, -HALF_H * 0.6, -7, -HALF_H * 0.6 - 12);
    this.beacon.setPosition(0, -HALF_H - 22);
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

  constructor() {
    super("Station");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR_BG);
    this.cameras.main.fadeIn(300, 0, 0, 0);

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
        });
        // Модалка сама перерисуется, если её модуль достроен (с guard'ом)
        this.modal?.tick();
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
    void gameServices.saveProgress({
      achievements: [],
      selectedShip: skinId,
      selectedSkin: skinId,
      stationLevels: levels,
      coins: GameState.getCoins(),
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
      { x: w * 0.5, y: h * 0.32 },  // FINANCE OFFICE — сверху (ниже, чтобы не наезжал на шапку)
      { x: w * 0.75, y: h * 0.73 }, // DESIGN WING — справа внизу
    ];
    this.buildings.forEach((building, index) => {
      building.setPosition(slots[index].x, slots[index].y);
      building.setBaseScale(baseScale);
    });

    this.rebuildCorridors(corePos, slots, baseScale);
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
