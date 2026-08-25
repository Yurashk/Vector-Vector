import * as Phaser from "phaser";
import { NeonShipRenderer } from "../NeonShipRenderer";
import { gameServices } from "../../services/GameServicesManager";
import { GameState, drawSciFiIcon } from "../ui/NeonUI";
import { GameOverModal } from "../ui/GameOverModal";
import {
  getSkinById,
  getSelectedSkin,
  selectSkin,
  SPACESHIP_SKINS,
  SpaceshipSkin,
} from "../spaceship-skins";

// --- Рекорд в localStorage ---
const HIGHSCORE_KEY = "dodge-runner-highscore";

// Моноширинный шрифт всех цифр HUD — ровные колонки без «прыжков»
const HUD_FONT = 'Consolas, "Courier New", monospace';

// Геометрия плашки активного буста (иконка + узкий прогресс-бар)
const BUFF_W = 95;
const BUFF_H = 18;
const BAR_W = 66;
const BAR_X = -26;
const BAR_Y = -2;
const BAR_H = 4;
// Стек бустов под кнопкой паузы: опущен ниже превью-полосок волн
// (полоски рисуются на y≈40±8, поэтому начинаем со 72)
const BUFF_STACK_X_OFFSET = -52; // от правого края: плашка 95px + марджин 5px
const BUFF_STACK_Y_START = 72;
const BUFF_STACK_STEP = 24;

function loadHighscore(): number {
  try {
    const raw = localStorage.getItem(HIGHSCORE_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveHighscore(value: number): void {
  try {
    localStorage.setItem(HIGHSCORE_KEY, String(value));
  } catch {
    // localStorage недоступен — играем без сохранения рекорда
  }
}

/** Открыт ли скин при текущем уровне конструкторского отсека станции */
function isSkinUnlocked(skin: SpaceshipSkin): boolean {
  return (skin.requiredDesignLevel ?? 0) <= GameState.getStation().design;
}

// HUD активного буста: векторная иконка + узкий прогресс-бар времени
interface BoostHud {
  container: Phaser.GameObjects.Container;
  barFill: Phaser.GameObjects.Graphics;
  barWidth: number;
  color: number;
  tween?: Phaser.Tweens.Tween;
}

export class Game extends Phaser.Scene {
  // Контейнер игрока
  private playerContainer!: Phaser.GameObjects.Container;
  private shipGraphics!: Phaser.GameObjects.Graphics;
  private playerBorder!: Phaser.GameObjects.Graphics;
  private playerBody!: Phaser.Physics.Arcade.Body;

  // Выбранный скин
  private currentSkin: SpaceshipSkin = getSelectedSkin();

  private isGameOver: boolean = false;

  // Модальное окно Game Over (REVIVE временно выключен — см. showGameOver)
  private gameOverModal?: GameOverModal;

  private obstacles!: Phaser.Physics.Arcade.Group;
  private boostsGroup!: Phaser.Physics.Arcade.Group;
  private bombsGroup!: Phaser.Physics.Arcade.Group;
  private gateTriggers!: Phaser.Physics.Arcade.Group;

  // Состояние
  private score: number = 0;
  private lives: number = 1;
  // === БАЛАНС: жёсткий потолок доп. жизней
  private maxLives: number = 15;
  private scoreMultiplier: number = 1;
  private isInvulnerable: boolean = false;

  // --- 🎨 ЦВЕТА И СОСТОЯНИЯ ОБВОДКИ ---
  private readonly COLOR_BORDER_ACTIVE: number = 0x00f3ff; // Неоново-голубой (при клике)
  private readonly COLOR_BORDER_SHIELD: number = 0x00ff88; // Неоново-зеленый (для щита)
  private readonly COLOR_BORDER_BOOST: number = 0xffd700; // Золотой (для x2)

  private currentBorderColor: number = 0x666688;

  // Таймеры и твины для эффекта щита
  private shieldTimer?: Phaser.Time.TimerEvent;
  private shieldBlinkTween?: Phaser.Tweens.Tween;
  private shieldAlpha: number = 1;
  private shieldArcs!: Phaser.GameObjects.Graphics;
  private x2Hud!: BoostHud;
  private shieldHud!: BoostHud;

  // Хук для внешних SDK (реклама/аналитика): срабатывает при смене паузы
  private onPauseChanged?: (paused: boolean) => void;

  // Таймер множителя X2
  private boostMultiplierTimer?: Phaser.Time.TimerEvent;

  // Прогрессия скорости
  private baseSpeed: number = 0.35;
  private currentSpeed: number = 0.35;
  // === БАЛАНС === двухступенчатый рост скорости: до множителя x5 —
  // быстрые +25% за уровень, дальше плавнее +16%; лимита нет
  private readonly fastSpeedStepPerLevel: number = 0.25;
  private readonly normalSpeedStepPerLevel: number = 0.16;
  private readonly fastSpeedCapMultiplier: number = 5;
  // === БАЛАНС: бонусы падают с фиксированной «вольной» скоростью,
  // не зависящей от уровня игры, чтобы их можно было поймать на любой скорости
  private boostFallSpeed: number = 0.3;
  // === БАЛАНС === честные фиксированные длительности бустов
  private readonly shieldDurationMs: number = 7000;
  private readonly x2DurationMs: number = 8000;
  // === БАЛАНС === шанс красной бомбы среди коллектиблов, %
  private readonly bombChancePercent: number = 15;
  private speedLevel: number = 0;
  // === БАЛАНС === уровни идут чаще: шаг между порогами растёт всего на
  // +1 волну (4,5,6,7...), после таблицы продолжаем ×1.18 вместо ×1.25
  private speedThresholds: number[] = [
    4, 9, 15, 22, 30, 39, 49, 60, 72, 85,
  ];

  private spawnTimer!: Phaser.Time.TimerEvent;
  private baseSpawnDelay: number = 2200;

  // --- БАЛАНС: градация превью и Blind Mode на высоких скоростях ---
  // Стандартное превью (мс) — держится до множителя x5
  private readonly basePreviewDelay: number = 800;
  private readonly previewFullUntilMultiplier: number = 5;
  // На x5→x6 превью плавно ужимается к промежуточным 400мс
  private readonly previewMidDelay: number = 400;
  private readonly previewFastAtMultiplier: number = 6;
  // На x6→x8 сокращается 400мс → 150мс...
  private readonly minPreviewDelay: number = 150;
  // ...а с x8 включается Blind Mode: превью полностью отключено
  private readonly blindModeMultiplier: number = 8;

  /** Множитель скорости уровня: +25%/уровень до x5, дальше +16%, без потолка */
  private getCurrentSpeedMult(): number {
    const fastLevels = Math.round(
      (this.fastSpeedCapMultiplier - 1) / this.fastSpeedStepPerLevel,
    ); // уровень, на котором достигается x5 (16)
    if (this.speedLevel <= fastLevels) {
      return 1 + this.speedLevel * this.fastSpeedStepPerLevel;
    }
    return (
      this.fastSpeedCapMultiplier +
      (this.speedLevel - fastLevels) * this.normalSpeedStepPerLevel
    );
  }

  // Палитра препятствий по мере роста множителя скорости: синий → жёлтый → оранжевый → красный
  private readonly SPEED_COLOR_STOPS: number[] = [
    0x00aaff, // неоново-синий
    0x00f3ff, // голубой
    0xffd700, // жёлтый
    0xff8800, // оранжевый
    0xff2d55, // красный
  ];

  // UI элементы
  private livesText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private pauseBtn!: Phaser.GameObjects.Container;
  private pauseGlyph!: Phaser.GameObjects.Graphics;
  private isPaused: boolean = false;
  private levelBarContainer!: Phaser.GameObjects.Container;
  private levelText!: Phaser.GameObjects.Text;
  private levelBarFill!: Phaser.GameObjects.Graphics;

  // --- Blind Mode (x8+): игра без превью волн ---
  private blindModeActive: boolean = false;
  private blindVignette?: Phaser.GameObjects.Graphics;

  // Управление
  private dragStartX: number = 0;
  private playerStartX: number = 0;
  private dragStartY: number = 0;
  private playerStartY: number = 0;
  private isDragging: boolean = false;

  // Размеры
  private playerSize: number = 35;
  private readonly borderPadding: number = 10;

  // Аудио
  private audioCtx!: AudioContext;
  private melodyNoteIndex: number = 0;
  private marioMelody: number[] = [
    659.25, 659.25, 0, 659.25, 0, 523.25, 659.25, 783.99, 0, 392.0,
  ];

  constructor() {
    super("Game");
  }

create() {
    this.score = 0;
    this.lives = 1;
    this.scoreMultiplier = 1;
    this.isInvulnerable = false;
    this.melodyNoteIndex = 0;
    this.shieldAlpha = 1;

    this.currentSpeed = this.baseSpeed;
    this.speedLevel = 0;
    this.currentBorderColor = this.defaultBorderColor();
    this.isGameOver = false;
    this.gameOverModal = undefined;
    this.blindModeActive = false;
    if (this.blindVignette) {
      this.blindVignette.destroy();
      this.blindVignette = undefined;
    }

    this.initAudio();

    const width = this.scale.width;
    const height = this.scale.height;

    // --- 🕸️ НЕОНОВАЯ ФОНОВАЯ СЕТКА ---
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x00f3ff, 0.05);

    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      grid.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y < height; y += gridSize) {
      grid.lineBetween(0, y, width, y);
    }

    // Игрок и рамка
    this.playerSize = Math.max(35, Math.floor(width * 0.08));
    this.playerBorder = this.add.graphics();

    // Двойная дуга щита перед носом корабля (видна только при активном щите)
    this.shieldArcs = this.add.graphics().setVisible(false);

    // Размер корабля подбираем под внутреннюю часть рамки,
    // чтобы он заполнял пространство внутри неё
    this.shipGraphics = NeonShipRenderer.create(this, this.currentSkin, this.shipRenderSize());
    // === БАЛАНС: корабль на 5% уже по ширине (хитбокс не меняется)
    this.shipGraphics.setScale(0.95, 1);
    this.tweens.add({
      targets: this.shipGraphics,
      alpha: { from: 0.72, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "sine.inout",
    });

    this.currentBorderColor = this.defaultBorderColor();
    this.drawPlayerBorder(this.currentBorderColor);

    this.playerContainer = this.add.container(width / 2, height - 80, [
      this.shipGraphics,
      this.playerBorder,
      this.shieldArcs,
    ]);

    this.physics.add.existing(this.playerContainer);
    this.playerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body;

    const containerSize = this.playerSize + this.borderPadding * 2;
    this.playerBody.setSize(containerSize, containerSize);
    this.playerBody.setOffset(-containerSize / 2, -containerSize / 2);
    this.playerBody.setCollideWorldBounds(true);

    // Группы
    this.obstacles = this.physics.add.group();
    this.boostsGroup = this.physics.add.group();
    this.bombsGroup = this.physics.add.group();
    this.gateTriggers = this.physics.add.group();

    // Весь статичный HUD собирается в одном месте
    this.renderHUD();

    // Восстановление прогресса из облака: станция/монеты (берём максимум
    // локального и облачного) и сохранённый скин, если он открыт.
    // Асинхронно и без блокировки — пока грузится, играем с локальным выбором.
    void gameServices
      .loadProgress()
      .then((progress) => {
        if (!this.scene.isActive()) return;

        if (progress?.stationLevels) {
          const local = GameState.getStation();
          GameState.setStation({
            engineering: Math.max(
              local.engineering,
              progress.stationLevels.engineering ?? 0,
            ),
            finance: Math.max(local.finance, progress.stationLevels.finance ?? 0),
            design: Math.max(local.design, progress.stationLevels.design ?? 0),
          });
        }
        if (
          typeof progress?.coins === "number" &&
          progress.coins > GameState.getCoins()
        ) {
          GameState.addCoins(progress.coins - GameState.getCoins());
        }

        if (!progress?.selectedSkin) return;
        const savedSkin = getSkinById(progress.selectedSkin);
        // Скин из облака применяем только если Design Wing его открывает
        if (savedSkin.id !== this.currentSkin.id && isSkinUnlocked(savedSkin)) {
          this.applySkin(savedSkin);
        }
      })
      .catch(() => {
        /* облако недоступно — играем с локальным скином */
      });

    // Управление
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver) {
        return;
      }
      this.resumeAudio();
      if (this.isPaused) return;
      this.isDragging = true;
      this.dragStartX = pointer.x;
      this.playerStartX = this.playerContainer.x;
      // Запоминаем стартовую точку и по вертикали — для драга вверх/вниз
      this.dragStartY = pointer.y;
      this.playerStartY = this.playerContainer.y;

      if (!this.isInvulnerable) {
        this.drawPlayerBorder(this.COLOR_BORDER_ACTIVE);
      }
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver || this.isPaused) return;
      if (this.isDragging) {
        const deltaX = pointer.x - this.dragStartX;
        const targetX = this.playerStartX + deltaX;
        const halfWidth = (this.playerSize + this.borderPadding * 2) / 2;
        const clampedX = Phaser.Math.Clamp(
          targetX,
          halfWidth,
          this.scale.width - halfWidth,
        );

        // Вертикальный драг: вверх не выше середины экрана, вниз — до нижней границы
        const deltaY = pointer.y - this.dragStartY;
        const targetY = this.playerStartY + deltaY;
        const clampedY = Phaser.Math.Clamp(
          targetY,
          this.scale.height / 2,
          this.scale.height - halfWidth,
        );

        this.playerContainer.x = clampedX;
        this.playerContainer.y = clampedY;
        this.playerBody.updateFromGameObject();
      }
    });

    this.input.on("pointerup", (_pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver) {
        return;
      }
      this.isDragging = false;
      if (!this.isInvulnerable) {
        this.drawPlayerBorder(this.currentBorderColor);
      }
    });

    // Переключение скинов (цифры): заблокированные Design Wing — игнор
    if (this.input.keyboard) {
      SPACESHIP_SKINS.forEach((skin, index) => {
        this.input.keyboard!.on(`keydown-${index + 1}`, () => {
          if (!isSkinUnlocked(skin)) return;
          this.applySkin(skin);
        });
      });
    }

    // Таймер спавна
    this.spawnTimer = this.time.addEvent({
      delay: this.baseSpawnDelay,
      callback: this.spawnWave,
      callbackScope: this,
      loop: true,
    });

    // Пассивный ремонт корабля от инженерного отсека станции
    this.setupLifeRegen();

    // Оверлапы
    this.physics.add.overlap(
      this.playerContainer,
      this.obstacles,
      this.handleHit,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.playerContainer,
      this.boostsGroup,
      this.collectBoost,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.playerContainer,
      this.bombsGroup,
      this.collectBomb,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.playerContainer,
      this.gateTriggers,
      this.passGate,
      undefined,
      this,
    );

    this.updateHUD();
}

  // --- 🖌️ ОТРИСОВКА КРУГЛОЙ РАМКИ / ПОЛНОГО ЩИТА ---
  private drawPlayerBorder(color: number) {
    this.playerBorder.clear();

    const outerSize = this.playerSize + this.borderPadding * 2;
    const cornerRadius = 16;

    if (this.isInvulnerable) {
      this.playerBorder.fillStyle(color, 0.45 * this.shieldAlpha);
      this.playerBorder.fillRoundedRect(
        -outerSize / 2,
        -outerSize / 2,
        outerSize,
        outerSize,
        cornerRadius,
      );

      this.playerBorder.lineStyle(3, color, 0.9 * this.shieldAlpha);
      this.playerBorder.strokeRoundedRect(
        -outerSize / 2,
        -outerSize / 2,
        outerSize,
        outerSize,
        cornerRadius,
      );
    } else {
      this.playerBorder.lineStyle(3, color, 1);
      this.playerBorder.strokeRoundedRect(
        -outerSize / 2,
        -outerSize / 2,
        outerSize,
        outerSize,
        cornerRadius,
      );
    }
  }

  // --- 🛡️ ДВОЙНАЯ ДУГА ЩИТА ПЕРЕД НОСОМ КОРАБЛЯ ---
  private drawShieldArcs(alpha: number) {
    this.shieldArcs.clear();

    const s = this.playerSize + this.borderPadding * 2;
    const cx = 0;
    const cy = -s * 0.32; // заметно впереди носа, не прилипает к кораблю
    const color = this.COLOR_BORDER_SHIELD;

    // Внешняя дуга: широкое неоновое гало + яркое ядро
    const outerR = s * 0.6;
    for (const [width, a] of [
      [7, 0.25],
      [2.5, 0.95],
    ] as const) {
      this.shieldArcs.lineStyle(width, color, a * alpha);
      this.shieldArcs.beginPath();
      this.shieldArcs.arc(
        cx,
        cy,
        outerR,
        Phaser.Math.DegToRad(-155),
        Phaser.Math.DegToRad(-25),
      );
      this.shieldArcs.strokePath();
    }

    // Внутренняя дуга (короче и тоньше)
    const innerR = s * 0.44;
    for (const [width, a] of [
      [5, 0.2],
      [1.8, 0.8],
    ] as const) {
      this.shieldArcs.lineStyle(width, color, a * alpha);
      this.shieldArcs.beginPath();
      this.shieldArcs.arc(
        cx,
        cy,
        innerR,
        Phaser.Math.DegToRad(-135),
        Phaser.Math.DegToRad(-45),
      );
      this.shieldArcs.strokePath();
    }
  }

  private hideShieldArcs() {
    if (this.shieldArcs) {
      this.shieldArcs.setVisible(false).clear();
    }
  }

  // --- 🎬 renderHUD: сборка всего статичного HUD ---
  // Верхняя зона между левым статусом и кнопкой паузы остаётся
  // полностью чистой для пролетающих блоков и предупреждений.
  private renderHUD(): void {
    const w = this.scale.width;

    // Левый верхний угол: статусы в ОДНУ ровную линию [♥ x5] [⚡ x1.44]
    // Иконки рисуются вокруг своего origin, тексты — origin(0, 0.5),
    // у всех общая ось Y = 20 — одинаковый вертикальный офсет.
    const livesIcon = this.add.graphics();
    this.drawHeartGlyph(livesIcon, 0xff3366);
    livesIcon.setPosition(16, 20);
    this.livesText = this.add
      .text(28, 20, "x1", {
        fontSize: "14px",
        color: "#ffffff",
        fontFamily: HUD_FONT,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    const boltIcon = this.add.graphics();
    drawSciFiIcon(boltIcon, "engineering", 0xffcc00, 7);
    boltIcon.setPosition(76, 20);
    this.speedText = this.add
      .text(88, 20, "x1.00", {
        fontSize: "14px",
        color: "#ffd700",
        fontFamily: HUD_FONT,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    // Правый угол: пауза в углу, активные бусты — СТРОГО столбиком под ней
    this.createPauseButton();
    this.x2Hud = this.createBoostHud(
      this.COLOR_BORDER_BOOST,
      (g) => drawSciFiIcon(g, "engineering", this.COLOR_BORDER_BOOST, 7),
    );
    this.shieldHud = this.createBoostHud(
      this.COLOR_BORDER_SHIELD,
      (g) => this.drawShieldGlyph(g, this.COLOR_BORDER_SHIELD),
    );

    // Уровень — лаконичная плашка с прогрессом до следующего
    // умножения скорости в самом низу экрана
    this.createLevelBar();

    this.layoutHud(w, this.scale.height);

    // HUD привязан к краям экрана — пересчитываем при ресайзе
    const onHudResize = (size: Phaser.Structs.Size) =>
      this.layoutHud(size.width, size.height);
    this.scale.on("resize", onHudResize);
    this.events.once("shutdown", () => {
      this.scale.off("resize", onHudResize);
    });
  }

  // --- ⏸ КРУГЛАЯ КНОПКА ПАУЗЫ (32×32, правый верхний угол) ---
  private createPauseButton(): void {
    const plate = this.add.graphics();
    plate.fillStyle(0x12122a, 0.85);
    plate.fillCircle(0, 0, 16);
    plate.lineStyle(1.5, 0x00f0ff, 0.7);
    plate.strokeCircle(0, 0, 16);

    this.pauseGlyph = this.add.graphics();

    this.pauseBtn = this.add.container(0, 0, [plate, this.pauseGlyph]);

    // Явная круглая хит-зона — надёжный клик по всей кнопке
    this.pauseBtn.setInteractive(
      new Phaser.Geom.Circle(0, 0, 18),
      Phaser.Geom.Circle.Contains,
    );
    this.pauseBtn.input!.cursor = "pointer"; // useHandCursor

    this.pauseBtn.on("pointerup", () => this.togglePause());
    this.drawPauseGlyph();
  }

  // --- SDK-шов управления паузой ---
  // Внешние SDK (реклама, оверлеи магазинов) дергают публичные методы
  // pauseGame/resumeGame и подписываются на setOnPauseChanged — UI-кнопка
  // использует тот же механизм, поэтому поведение всегда синхронно.

  public pauseGame(): void {
    this.applyPaused(true);
  }

  public resumeGame(): void {
    this.applyPaused(false);
  }

  public togglePause(): void {
    this.applyPaused(!this.isPaused);
  }

  public setOnPauseChanged(cb: ((paused: boolean) => void) | undefined): void {
    this.onPauseChanged = cb;
  }

  private applyPaused(paused: boolean): void {
    if (this.isGameOver || this.isPaused === paused) return;
    this.isPaused = paused;

    if (paused) {
      this.physics.world.pause();
      this.time.paused = true; // спавн волн, реген, таймеры бустов
      this.tweens.pauseAll(); // предупреждения и прочие анимации
    } else {
      this.physics.world.resume();
      this.time.paused = false;
      this.tweens.resumeAll();
    }
    this.drawPauseGlyph();
    this.onPauseChanged?.(paused);
  }

  /** Иконка кнопки: две планки на паузе, треугольник — продолжить */
  private drawPauseGlyph(): void {
    const g = this.pauseGlyph;
    g.clear();
    g.fillStyle(0xffffff, 0.95);
    if (this.isPaused) {
      g.fillTriangle(-4, -6, -4, 6, 6, 0);
    } else {
      g.fillRect(-5, -6, 3.4, 12);
      g.fillRect(1.6, -6, 3.4, 12);
    }
  }

  // --- ВЕКТОРНЫЕ ГЛИФЫ HUD ---

  /** Сердечко для счётчика жизней */
  private drawHeartGlyph(g: Phaser.GameObjects.Graphics, color: number): void {
    g.fillStyle(color, 0.95);
    g.fillCircle(-2.7, -1.8, 3);
    g.fillCircle(2.7, -1.8, 3);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(-5.2, -0.2),
        new Phaser.Math.Vector2(5.2, -0.2),
        new Phaser.Math.Vector2(0, 5.8),
      ],
      true,
    );
  }

  /** Щит для плашки неуязвимости */
  private drawShieldGlyph(g: Phaser.GameObjects.Graphics, color: number): void {
    g.lineStyle(1.8, color, 0.95);
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(6, -4);
    g.lineTo(6, 2);
    g.lineTo(0, 7);
    g.lineTo(-6, 2);
    g.lineTo(-6, -4);
    g.closePath();
    g.strokePath();
  }

  // --- ⏳ ПАНЕЛЬ АКТИВНОГО БУСТА: мини-иконка + прогресс-бар 4px ---
  private createBoostHud(
    color: number,
    drawIcon: (g: Phaser.GameObjects.Graphics) => void,
  ): BoostHud {
    const bgG = this.add.graphics();
    bgG.fillStyle(color, 0.15);
    bgG.fillRoundedRect(-BUFF_W / 2, -BUFF_H / 2, BUFF_W, BUFF_H, 6);
    bgG.lineStyle(1, color, 0.35);
    bgG.strokeRoundedRect(-BUFF_W / 2, -BUFF_H / 2, BUFF_W, BUFF_H, 6);

    // Трек прогресс-бара
    bgG.fillStyle(0xffffff, 0.12);
    bgG.fillRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, 2);

    const icon = this.add.graphics();
    icon.setPosition(-BUFF_W / 2 + 4 + 6, 0); // 4px от левого края
    drawIcon(icon);
    icon.setScale(0.75);

    const barFill = this.add.graphics();

    // Плашка создаётся скрытой и позиционируется в layoutHud
    const container = this.add
      .container(0, 0, [bgG, barFill, icon])
      .setVisible(false);

    return { container, barFill, barWidth: BAR_W, color };
  }

  private runBoostHud(hud: BoostHud, durationMs: number): void {
    if (hud.tween) {
      hud.tween.stop();
      hud.tween.remove();
    }
    hud.container.setVisible(true).setAlpha(1);

    hud.tween = this.tweens.addCounter({
      from: 1,
      to: 0,
      duration: durationMs,
      ease: "Linear",
      onUpdate: (tween) => {
        const p = tween.getValue() ?? 0;
        hud.barFill.clear();
        hud.barFill.fillStyle(hud.color, 0.95);
        hud.barFill.fillRect(BAR_X, BAR_Y, hud.barWidth * p, BAR_H);
      },
      onComplete: () => {
        hud.container.setVisible(false);
      },
    });
  }

  private hideBoostHud(hud: BoostHud): void {
    if (hud.tween) {
      hud.tween.stop();
      hud.tween.remove();
      hud.tween = undefined;
    }
    hud.barFill.clear();
    hud.container.setVisible(false);
  }

  // --- 📊 УРОВЕНЬ: нижняя плашка с прогрессом зачистки волны ---
  private createLevelBar(): void {
    const w = 210;
    const h = 20;

    const bg = this.add.graphics();
    bg.fillStyle(0x12122a, 0.8);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(1, 0x00f0ff, 0.25);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);

    // Трек прогресса до следующего умножения скорости
    bg.fillStyle(0xffffff, 0.12);
    bg.fillRoundedRect(-36, -3, 128, 6, 3);

    this.levelText = this.add
      .text(-98, 0, "LEVEL 0", {
        fontSize: "11px",
        color: "#ffd700",
        fontFamily: HUD_FONT,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    this.levelBarFill = this.add.graphics();

    this.levelBarContainer = this.add.container(
      this.scale.width / 2,
      this.scale.height - 24,
      [bg, this.levelText, this.levelBarFill],
    );
    this.levelBarContainer.setDepth(50);
  }

  /**
   * Прогресс до следующего умножения скорости:
   * сколько волн пройдено от предыдущего порога до следующего.
   * После конца таблицы пороги продолжают расти геометрически,
   * так что прогресс считается всегда.
   */
  private getNextLevelProgress(): number {
    const table = this.speedThresholds;
    if (this.speedLevel >= table.length) return 1;
    const prev = this.speedLevel === 0 ? 0 : table[this.speedLevel - 1];
    const next = table[this.speedLevel];
    return Phaser.Math.Clamp((this.score - prev) / (next - prev), 0, 1);
  }

  /** Перепозиционирование HUD-элементов, привязанных к краям экрана */
  private layoutHud(w: number, h: number): void {
    this.pauseBtn.setPosition(w - 36, 20);
    // Стек бустов строго под кнопкой паузы
    this.x2Hud.container.setPosition(w + BUFF_STACK_X_OFFSET, BUFF_STACK_Y_START);
    this.shieldHud.container.setPosition(
      w + BUFF_STACK_X_OFFSET,
      BUFF_STACK_Y_START + BUFF_STACK_STEP,
    );
    this.levelBarContainer.setPosition(w / 2, h - 24);
  }

  // --- 🛡️ АКТИВАЦИЯ ЩИТА С МЕРЦАНИЕМ ---
  // === БАЛАНС: длительность щита увеличена с 5с до 7с
  private activateInvulnerability(durationMs: number = 7000) {
    if (this.shieldTimer) this.shieldTimer.destroy();
    if (this.shieldBlinkTween) this.shieldBlinkTween.stop();

    this.isInvulnerable = true;
    this.shieldAlpha = 1;

    this.drawPlayerBorder(this.COLOR_BORDER_SHIELD);

    // Таймер щита в верхней панели
    this.runBoostHud(this.shieldHud, durationMs);

    // Показываем двойную дугу перед носом корабля
    this.shieldArcs.setVisible(true);
    this.drawShieldArcs(this.shieldAlpha);

    const blinkStartDelay = Math.max(0, durationMs - 3000);

    this.time.delayedCall(blinkStartDelay, () => {
      if (!this.isInvulnerable) return;

      this.shieldBlinkTween = this.tweens.addCounter({
        from: 1,
        to: 0.2,
        duration: 180,
        yoyo: true,
        repeat: -1,
        onUpdate: (tween) => {
          this.shieldAlpha = tween.getValue() ?? 1;
          this.drawPlayerBorder(this.COLOR_BORDER_SHIELD);
          // Дуги мерцают синхронно с рамкой
          this.drawShieldArcs(this.shieldAlpha);
        },
      });
    });

    this.shieldTimer = this.time.delayedCall(durationMs, () => {
      this.isInvulnerable = false;
      this.shieldAlpha = 1;
      if (this.shieldBlinkTween) this.shieldBlinkTween.stop();

      this.hideShieldArcs();
      this.hideBoostHud(this.shieldHud);

      const restoreColor =
        this.scoreMultiplier > 1
          ? this.COLOR_BORDER_BOOST
          : this.defaultBorderColor();
      this.updateBorderState(restoreColor);
    });
  }

  private updateBorderState(newColor: number) {
    this.currentBorderColor = newColor;
    if (!this.isDragging && !this.isInvulnerable) {
      this.drawPlayerBorder(this.currentBorderColor);
    }
  }

  private defaultBorderColor(): number {
    return this.currentSkin.glowColor;
  }

  private applySkin(skin: SpaceshipSkin) {
    this.currentSkin = skin;
    selectSkin(skin.id);
    NeonShipRenderer.updateSkin(this.shipGraphics, skin, this.shipRenderSize());
    this.updateBorderState(this.defaultBorderColor());
  }

  // Внутренние габариты рамки игрока (между её контурами)
  private shipRenderSize(): number {
    return this.playerSize + this.borderPadding * 2 - 4;
  }

  override update() {
    const screenHeight = this.scale.height;

    [this.obstacles, this.boostsGroup, this.gateTriggers].forEach((group) => {
      [...group.getChildren()].forEach((child) => {
        const item = child as Phaser.GameObjects.Rectangle;
        if (item.y > screenHeight + 50) {
          item.destroy();
        }
      });
    });
  }

  // === БАЛАНС: пассивная регенерация жизни из инженерного отсека станции ===
  // ур.1 — +1 жизнь каждые 20с, каждый следующий уровень на 3с быстрее,
  // минимум 8с (значения дублируются в StationScene MODULES)
  private setupLifeRegen(): void {
    const level = GameState.getStation().engineering;
    if (level <= 0) return;

    const intervalMs = Math.max(8000, 20000 - (level - 1) * 3000);
    this.time.addEvent({
      delay: intervalMs,
      callback: () => {
        if (this.isGameOver) return;
        if (this.lives < this.maxLives) {
          this.lives += 1;
          this.updateHUD();
        }
      },
      loop: true,
    });
  }

  private checkSpeedProgression() {
    // Порог следующего уровня: пока идём по таблице — берём из неё,
    // после её конца пороги продолжаются геометрически (+18% за уровень),
    // чтобы уровни не застывали на поздней игре.
    const nextThreshold = (): number => {
      const table = this.speedThresholds;
      if (this.speedLevel < table.length) return table[this.speedLevel];

      let threshold = table[table.length - 1];
      for (let i = table.length; i <= this.speedLevel; i++) {
        threshold = Math.round(threshold * 1.18);
      }
      return threshold;
    };

    let leveledUp = false;
    while (this.score >= nextThreshold()) {
      this.speedLevel++;
      // === БАЛАНС === линейная скорость вместо экспоненты
      this.currentSpeed = this.baseSpeed * this.getCurrentSpeedMult();

      // === БАЛАНС === агрессивнее уплотняем волны: −130мс за уровень,
      // пол 700мс — на высоких уровнях стены идут почти сплошным потоком
      const newDelay = Math.max(
        700,
        this.baseSpawnDelay - this.speedLevel * 130,
      );
      if (this.spawnTimer) {
        this.spawnTimer.timeScale = this.baseSpawnDelay / newDelay;
      }
      leveledUp = true;
    }

    // === БАЛАНС: сигнал повышения уровня — только блинк экрана
    if (leveledUp) {
      this.cameras.main.flash(250, 0, 243, 255);
    }

    // Blind Mode: при первом пересечении множителем x8 включаем режим
    if (this.getPreviewDelay() === 0 && !this.blindModeActive) {
      this.activateBlindMode();
    }
  }

  // --- 🔴 BLIND MODE: предупреждение + пульсирующая красная вигнетка ---
  private activateBlindMode() {
    this.blindModeActive = true;

    const width = this.scale.width;
    const height = this.scale.height;

    // Разовое предупреждение по центру: плавно появляется и исчезает за ~1.5с
    const warning = this.add
      .text(width / 2, height * 0.42, "NO PREVIEW - REACTION MODE!", {
        fontSize: "26px",
        color: "#ff2244",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(95)
      .setAlpha(0);
    warning.setShadow(0, 0, "#ff2244", 16, false, true);

    this.tweens.add({
      targets: warning,
      alpha: 1,
      duration: 500,
      ease: "Power2",
      onComplete: () => {
        this.tweens.add({
          targets: warning,
          alpha: 0,
          delay: 500,
          duration: 500,
          onComplete: () => warning.destroy(),
        });
      },
    });

    // Постоянный пульсирующий красный глоу по краям экрана
    const vignette = this.add.graphics().setDepth(90);
    vignette.lineStyle(40, 0xff2244, 0.07);
    vignette.strokeRect(-20, -20, width + 40, height + 40);
    vignette.lineStyle(22, 0xff2244, 0.16);
    vignette.strokeRect(-11, -11, width + 22, height + 22);
    vignette.lineStyle(3, 0xff3344, 0.45);
    vignette.strokeRect(1.5, 1.5, width - 3, height - 3);

    this.blindVignette = vignette;
    this.tweens.add({
      targets: vignette,
      alpha: { from: 0.35, to: 0.9 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "sine.inout",
    });
  }

  // Цвет препятствий зависит от текущего уровня скорости (интерполяция по палитре)
  private getSpeedColor(): number {
    const stops = this.SPEED_COLOR_STOPS;
    const maxLevel = this.speedThresholds.length;
    const t = Phaser.Math.Clamp(this.speedLevel / maxLevel, 0, 1);
    const scaled = t * (stops.length - 1);
    const i = Math.min(Math.floor(scaled), stops.length - 2);
    const f = scaled - i;

    const c1 = stops[i];
    const c2 = stops[i + 1];
    const r1 = (c1 >> 16) & 0xff;
    const g1 = (c1 >> 8) & 0xff;
    const b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff;
    const g2 = (c2 >> 8) & 0xff;
    const b2 = c2 & 0xff;

    const r = Math.round(r1 + (r2 - r1) * f);
    const g = Math.round(g1 + (g2 - g1) * f);
    const b = Math.round(b1 + (b2 - b1) * f);
    return (r << 16) | (g << 8) | b;
  }

  // Осветление цвета к белому для контура блока
  private lightenColor(hex: number, amount: number): number {
    const r = (hex >> 16) & 0xff;
    const g = (hex >> 8) & 0xff;
    const b = hex & 0xff;
    const r2 = Math.round(r + (255 - r) * amount);
    const g2 = Math.round(g + (255 - g) * amount);
    const b2 = Math.round(b + (255 - b) * amount);
    return (r2 << 16) | (g2 << 8) | b2;
  }

  // === БАЛАНС: длительность превью текущей волны ===
  // До x5 — стандартные 800мс; x5→x6 — ужимается к 400мс;
  // x6→x8 — 400мс → 150мс; с x8 — Blind Mode, превью = 0.
  private getPreviewDelay(): number {
    const mult = this.getCurrentSpeedMult();
    if (mult <= this.blindModeMultiplier) {
      if (mult <= this.previewFullUntilMultiplier) {
        return this.basePreviewDelay;
      }
      if (mult <= this.previewFastAtMultiplier) {
        // Ступень 1: x5 → x6, 800мс → 400мс
        const t = Phaser.Math.Clamp(
          (mult - this.previewFullUntilMultiplier) /
            (this.previewFastAtMultiplier - this.previewFullUntilMultiplier),
          0,
          1,
        );
        return Math.round(
          this.basePreviewDelay +
            (this.previewMidDelay - this.basePreviewDelay) * t,
        );
      }
      // Ступень 2: x6 → x8, 400мс → 150мс
      const t = Phaser.Math.Clamp(
        (mult - this.previewFastAtMultiplier) /
          (this.blindModeMultiplier - this.previewFastAtMultiplier),
        0,
        1,
      );
      return Math.round(
        this.previewMidDelay +
          (this.minPreviewDelay - this.previewMidDelay) * t,
      );
    }

    // Blind Mode: блоки спавнятся мгновенно, без превью-полосок
    return 0;
  }

  // === БАЛАНС: компенсация укороченного превью ===
  // Блок заранее позиционируется выше по траектории на дистанцию, которую
  // он пролетит за «отнятое» у превью время. Итог: подсказка короче, но блок
  // появляется раньше и игрок сохраняет честное время на реакцию.
  private getSpawnY(fallVelocity: number, previewDelay: number): number {
    const lostMs = this.basePreviewDelay - previewDelay;
    if (lostMs <= 0) {
      return -20;
    }
    // Возвращаем половину потерянного времени как дополнительную дистанцию полёта
    const extraDistance = (fallVelocity * lostMs) / 1000 / 2;
    // Ограничиваем 12% высоты экрана, чтобы блок оставался быстро заметен
    const cappedExtra = Math.min(extraDistance, this.scale.height * 0.12);
    return -20 - cappedExtra;
  }

  // === БАЛАНС: плотность волны зависит от уровня скорости ===
  // Ранняя игра (эквивалент < x5 по старой шкале): 1–2 препятствия,
  // середина (~x5–x8): 3, финал (x8+): 2–4 рандомно — стена с проходом,
  // но непредсказуемой ширины
  private getObstacleCount(): number {
    if (this.speedLevel <= 4) {
      return Phaser.Math.Between(1, 2);
    }
    if (this.speedLevel <= 7) {
      return 3;
    }
    return Phaser.Math.Between(2, 4);
  }

  private spawnWave() {
    const screenWidth = this.scale.width;
    const totalColumns = 5;
    const columnWidth = screenWidth / totalColumns;

    const fallVelocity = this.scale.height * this.currentSpeed;

    // === БАЛАНС: превью и стартовая позиция зависят от текущей скорости ===
    const previewDelay = this.getPreviewDelay();
    const spawnY = this.getSpawnY(fallVelocity, previewDelay);

    // Цвет всегда от текущей скорости: смены палитры волны больше нет
    const obstacleColor = this.getSpeedColor();
    const strokeColor = this.lightenColor(obstacleColor, 0.45);
    const safeColor = 0x00ff88;

    // === БАЛАНС: выбираем N колонок под препятствия, одну — под бонусный
    // проход (невидимый триггер + мелодия), остальные остаются свободными.
    // Превью у всех не-блочных колонок одинаковое — тонкий белый «прочерк»,
    // чтобы игрок читал волну, а не искал подсвеченный проход
    const allColumns = Phaser.Utils.Array.Shuffle([0, 1, 2, 3, 4]);
    const obstacleCount = this.getObstacleCount();
    const obstacleColumns = allColumns.slice(0, obstacleCount);
    const safeColumn = allColumns[obstacleCount];

    for (let i = 0; i < totalColumns; i++) {
      const x = i * columnWidth + columnWidth / 2;

      if (!obstacleColumns.includes(i)) {
        // Нейтральная метка-проход (как у свободных колонок)
        const marker = this.add.rectangle(
          x,
          44,
          columnWidth - 26,
          3,
          0xffffff,
          0.14,
        );

        if (i === safeColumn) {
          this.time.delayedCall(previewDelay, () => {
            marker.destroy();

            const gateTrigger = this.add.rectangle(
              x,
              spawnY,
              columnWidth - 10,
              10,
              safeColor,
              0,
            );
            this.gateTriggers.add(gateTrigger);

            const gateBody = gateTrigger.body as Phaser.Physics.Arcade.Body;
            gateBody.setVelocityY(fallVelocity);
          });
        } else {
          this.time.delayedCall(previewDelay, () => {
            marker.destroy();
          });
        }
        continue;
      }

      // Препятствие (Стена)
      const warning = this.add.rectangle(
        x,
        40,
        columnWidth - 10,
        15,
        obstacleColor,
        0.3,
      );
      warning.setStrokeStyle(1, obstacleColor, 0.6);

      // === БАЛАНС: превью и старт блока от скорости ===
      this.time.delayedCall(previewDelay, () => {
        warning.destroy();

        const block = this.add.rectangle(
          x,
          spawnY,
          columnWidth - 10,
          45,
          obstacleColor,
          0.65,
        );
        block.setStrokeStyle(2, strokeColor, 1);

        this.obstacles.add(block);

        const blockBody = block.body as Phaser.Physics.Arcade.Body;
        blockBody.setVelocityY(fallVelocity);
      });
    }

    // === БАЛАНС === шанс буста скручен до 22%
    if (Phaser.Math.Between(1, 100) <= 22) {
      // Буст выезжает сразу после того, как превью волны отработало
      this.time.delayedCall(previewDelay + 300, () => {
        this.spawnBetweenWaveBoost(totalColumns, columnWidth);
      });
    }

    this.score += 1 * this.scoreMultiplier;
    this.checkSpeedProgression();
    this.updateHUD();
  }

  private spawnBetweenWaveBoost(totalColumns: number, columnWidth: number) {
    const randomColumn = Phaser.Math.Between(0, totalColumns - 1);
    const x = randomColumn * columnWidth + columnWidth / 2;

    // === БАЛАНС === 15% коллектиблов — красная бомба-ловушка,
    // остальные 85% — честные бусты (жизнь / x2 / щит)
    const isBomb = Phaser.Math.Between(1, 100) <= this.bombChancePercent;
    const warnFill = isBomb ? 0xff2244 : 0xbb00ff;
    const warnStroke = isBomb ? 0xff6677 : 0xdd44ff;

    // === БАЛАНС: фиксированная «вольная» скорость полёта бонуса —
    // не привязана к скорости игры, чтобы бонус висел дольше
    // и его можно было подобрать даже на высоких скоростях
    const boostVelocity = this.scale.height * this.boostFallSpeed;

    const collectibleWarning = this.add.circle(x, 40, 10, warnFill, 0.4);
    collectibleWarning.setStrokeStyle(1, warnStroke, 0.8);

    this.time.delayedCall(600, () => {
      collectibleWarning.destroy();

      if (isBomb) {
        this.spawnBomb(x, boostVelocity);
        return;
      }

      const boostBlock = this.add.rectangle(x, -20, 30, 30, 0xbb00ff, 0.7);
      boostBlock.setStrokeStyle(2, 0xee77ff, 1);

      this.boostsGroup.add(boostBlock);

      const boostBody = boostBlock.body as Phaser.Physics.Arcade.Body;
      boostBody.setVelocityY(boostVelocity);

      this.tweens.add({
        targets: boostBlock,
        rotation: Math.PI,
        duration: 1000,
        repeat: -1,
      });
    });
  }

  // --- 💣 КРАСНАЯ БОМБА: единственный тип ловушки ---
  private spawnBomb(x: number, fallVelocity: number) {
    const bombGfx = this.add.graphics();
    // Корпус
    bombGfx.fillStyle(0xff2244, 0.92);
    bombGfx.fillCircle(0, 0, 14);
    bombGfx.lineStyle(2, 0xff8899, 1);
    bombGfx.strokeCircle(0, 0, 14);
    // Тёмный «крест»-детонатор
    bombGfx.lineStyle(2.5, 0x550008, 0.95);
    bombGfx.lineBetween(-8, 0, 8, 0);
    bombGfx.lineBetween(0, -8, 0, 8);
    // Блик
    bombGfx.fillStyle(0xffffff, 0.85);
    bombGfx.fillCircle(-5, -5, 3);

    const bomb = this.add.container(x, -20, [bombGfx]);
    this.physics.add.existing(bomb);
    this.bombsGroup.add(bomb);

    const bombBody = bomb.body as Phaser.Physics.Arcade.Body;
    bombBody.setSize(28, 28);
    bombBody.setOffset(-14, -14);
    bombBody.setVelocityY(fallVelocity);

    // Тревожная пульсация вместо вращения
    this.tweens.add({
      targets: bombGfx,
      alpha: { from: 1, to: 0.55 },
      scale: { from: 1, to: 1.12 },
      duration: 320,
      yoyo: true,
      repeat: -1,
      ease: "sine.inout",
    });
  }

  private collectBomb(_player: any, bomb: any) {
    this.tweens.killTweensOf(bomb);
    bomb.destroy();

    // Щит полностью блокирует урон — бомба детонирует впустую
    if (!this.isInvulnerable) {
      this.lives -= 1;
      this.updateHUD();
    }

    // Красная вспышка + короткая тряска камеры в любом случае
    this.cameras.main.flash(200, 255, 0, 0);
    this.cameras.main.shake(150, 0.01);

    if (this.lives <= 0) {
      this.showGameOver();
    }
  }

  private passGate(_player: any, trigger: any) {
    trigger.destroy();
    this.playNextMelodyNote();
  }

  private collectBoost(_player: any, boostBlock: any) {
    this.tweens.killTweensOf(boostBlock);
    boostBlock.destroy();
    this.playBoostSound();

    const type = Phaser.Utils.Array.GetRandom([1, 2, 3]);

    if (type === 1) {
      // Жизнь засчитывается только до лимита — на потолке бонус уходит в никуда
      if (this.lives < this.maxLives) {
        this.lives += 1;
      }
    } else if (type === 2) {
      if (this.boostMultiplierTimer) this.boostMultiplierTimer.destroy();

      this.scoreMultiplier = 2;
      this.updateBorderState(this.COLOR_BORDER_BOOST);
      // === БАЛАНС === честные фиксированные 8 секунд, без урезания
      this.runBoostHud(this.x2Hud, this.x2DurationMs);

      this.boostMultiplierTimer = this.time.delayedCall(
        this.x2DurationMs,
        () => {
          this.scoreMultiplier = 1;
          this.hideBoostHud(this.x2Hud);
          this.updateBorderState(
            this.isInvulnerable
              ? this.COLOR_BORDER_SHIELD
              : this.defaultBorderColor(),
          );
        },
      );
    } else if (type === 3) {
      this.activateInvulnerability(this.shieldDurationMs);
    }

    this.updateHUD();
  }

  private initAudio() {
    if (this.sound && (this.sound as any).context) {
      this.audioCtx = (this.sound as any).context;
    } else {
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
  }

  private resumeAudio() {
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  private playNextMelodyNote() {
    if (!this.audioCtx) return;
    const freq = this.marioMelody[this.melodyNoteIndex];
    this.melodyNoteIndex = (this.melodyNoteIndex + 1) % this.marioMelody.length;

    if (freq === 0) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

    gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.audioCtx.currentTime + 0.3,
    );

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.3);
  }

  private playBoostSound() {
    if (!this.audioCtx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, index) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(
        freq,
        this.audioCtx.currentTime + index * 0.06,
      );

      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime + index * 0.06);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.audioCtx.currentTime + index * 0.06 + 0.1,
      );

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(this.audioCtx.currentTime + index * 0.06);
      osc.stop(this.audioCtx.currentTime + index * 0.06 + 0.1);
    });
  }

  private handleHit(_player: any, obstacle: any) {
    if (this.isInvulnerable) return;

    obstacle.destroy();
    this.lives -= 1;
    this.updateHUD();
    this.cameras.main.flash(200, 255, 0, 0);
    this.cameras.main.shake(120, 0.008);

    if (this.lives <= 0) {
      this.showGameOver();
    }
  }

  // --- 🎮 МОДАЛЬНОЕ ОКНО GAME OVER (GameOverModal) ---
  private showGameOver() {
    if (this.isGameOver) return;
    this.isGameOver = true;

    // Останавливаем игровую логику
    if (this.spawnTimer) this.spawnTimer.paused = true;
    this.time.removeAllEvents();
    if (this.shieldBlinkTween) this.shieldBlinkTween.stop();
    this.isDragging = false;
    this.hideShieldArcs();
    this.hideBoostHud(this.x2Hud);
    this.hideBoostHud(this.shieldHud);

    // Очищаем падающие объекты
    this.obstacles.clear(true, true);
    this.boostsGroup.clear(true, true);
    this.bombsGroup.clear(true, true);
    this.gateTriggers.clear(true, true);

    // Статистика: текущий счёт рядом с рекордом из localStorage
    const currentMult = this.getCurrentSpeedMult().toFixed(2);
    const prevBest = loadHighscore();
    const isNewRecord = this.score > prevBest;
    if (isNewRecord) {
      saveHighscore(this.score);
    }
    const best = Math.max(prevBest, this.score);

    // === БАЛАНС === монеты за забег: счёт × множитель финансового
    // отсека станции (+10% за уровень)
    const station = GameState.getStation();
    const coinMult = 1 + station.finance * 0.1;
    const earnedCoins = Math.max(1, Math.round(this.score * coinMult));
    GameState.addCoins(earnedCoins);

    // Облачная синхронизация (Firebase через адаптер): рекорд в лидерборд
    // с ником игрока из настроек и текущий прогресс (включая станцию).
    // Fire-and-forget — не блокирует отрисовку UI, а менеджер сам
    // глотает сетевые ошибки.
    void gameServices.submitScore(this.score, GameState.getUsername());
    void gameServices.saveProgress({
      achievements: [],
      selectedShip: this.currentSkin.id,
      selectedSkin: this.currentSkin.id,
      stationLevels: station,
      coins: GameState.getCoins(),
    });

    this.gameOverModal = new GameOverModal(
      this,
      {
        score: this.score,
        best,
        isNewRecord,
        maxSpeedMult: `x${currentMult}`,
        coins: earnedCoins,
      },
      {
        onDoubleCoins: () => this.doubleRunCoins(earnedCoins),
        onRestart: () => this.scene.restart(),
        onMenu: () => this.scene.start("MainMenu"),
      },
    );
  }

  /** Удвоение награды за просмотр рекламы: начисляем вторую половину */
  private doubleRunCoins(baseCoins: number) {
    GameState.addCoins(baseCoins);
    this.gameOverModal?.markCoinsDoubled();

    // Повторная облачная синхронизация с удвоенной суммой
    void gameServices.saveProgress({
      achievements: [],
      selectedShip: this.currentSkin.id,
      selectedSkin: this.currentSkin.id,
      stationLevels: GameState.getStation(),
      coins: GameState.getCoins(),
    });
  }

  private updateHUD() {
    this.livesText.setText(`x${this.lives}`);

    const currentMult = this.getCurrentSpeedMult().toFixed(2);
    this.speedText.setText(`x${currentMult}`);

    // Нижняя плашка: номер уровня = количество умножений скорости,
    // бар — прогресс до следующего умножения
    this.levelText.setText(`LEVEL ${this.speedLevel}`);
    const p = this.getNextLevelProgress();
    this.levelBarFill.clear();
    this.levelBarFill.fillStyle(this.getSpeedColor(), 0.95);
    this.levelBarFill.fillRect(-36, -3, 128 * p, 6);
  }
}