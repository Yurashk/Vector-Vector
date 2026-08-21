import * as Phaser from "phaser";
import { NeonShipRenderer } from "../NeonShipRenderer";
import {
  getSelectedSkin,
  selectSkin,
  SPACESHIP_SKINS,
  SpaceshipSkin,
} from "../spaceship-skins";

export class Game extends Phaser.Scene {
  // Контейнер игрока
  private playerContainer!: Phaser.GameObjects.Container;
  private shipGraphics!: Phaser.GameObjects.Graphics;
  private playerBorder!: Phaser.GameObjects.Graphics;
  private playerBody!: Phaser.Physics.Arcade.Body;

  // Выбранный скин
  private currentSkin: SpaceshipSkin = getSelectedSkin();

  private isGameOver: boolean = false;

  // Временное состояние тапа/свайпа на экране Game Over
  private gameOverSwipeStartX: number = 0;
  private gameOverSwipeActive: boolean = false;

  // Элементы карусели на экране Game Over (обновляются при переключении)
  private gameOverCarousel?: {
    frame: Phaser.GameObjects.Graphics;
    ship: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
    size: number;
  };

  private obstacles!: Phaser.Physics.Arcade.Group;
  private boostsGroup!: Phaser.Physics.Arcade.Group;
  private gateTriggers!: Phaser.Physics.Arcade.Group;

  // Состояние
  private isLevelUpWave: boolean = false;
  private score: number = 0;
  private lives: number = 1;
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
  private shieldIndicator!: Phaser.GameObjects.Container;
  private shieldIndicatorTween?: Phaser.Tweens.Tween;

  // Таймер множителя X2
  private boostMultiplierTimer?: Phaser.Time.TimerEvent;

  // Прогрессия скорости
  private baseSpeed: number = 0.35;
  private currentSpeed: number = 0.35;
  private speedLevel: number = 0;
  private speedThresholds: number[] = [
    5, 12, 22, 34, 48, 64, 82, 102, 125, 150,
  ];
  private speedMultiplierStep: number = 1.25;

  private spawnTimer!: Phaser.Time.TimerEvent;
  private baseSpawnDelay: number = 2200;

  // --- БАЛАНС: превью волн на высоких скоростях ---
  // Обычная длительность показа превью-полосок (мс)
  private readonly basePreviewDelay: number = 800;
  // Множитель скорости, с которого превью начинает сокращаться
  private readonly previewShrinkAtMultiplier: number = 7;
  // Минимальная длительность превью на пиковом множителе (мс)
  private readonly minPreviewDelay: number = 320;

  // Палитра препятствий по мере роста множителя скорости: синий → жёлтый → оранжевый → красный
  private readonly SPEED_COLOR_STOPS: number[] = [
    0x00aaff, // неоново-синий
    0x00f3ff, // голубой
    0xffd700, // жёлтый
    0xff8800, // оранжевый
    0xff2d55, // красный
  ];

  // UI элементы
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  // Управление
  private dragStartX: number = 0;
  private playerStartX: number = 0;
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

  private generateTextures() {
    if (!this.textures.exists("heart_icon")) {
      const graphics = this.make.graphics();
      graphics.fillStyle(0xff3366, 1);
      graphics.fillCircle(7, 7, 6);
      graphics.fillCircle(17, 7, 6);
      graphics.beginPath();
      graphics.moveTo(1, 8);
      graphics.lineTo(23, 8);
      graphics.lineTo(12, 22);
      graphics.closePath();
      graphics.fillPath();
      graphics.generateTexture("heart_icon", 24, 24);
      graphics.destroy();
    }

    if (!this.textures.exists("lightning_icon")) {
      const graphics = this.make.graphics();
      graphics.fillStyle(0xffcc00, 1);
      graphics.beginPath();
      graphics.moveTo(14, 0);
      graphics.lineTo(3, 13);
      graphics.lineTo(11, 13);
      graphics.lineTo(8, 24);
      graphics.lineTo(21, 10);
      graphics.lineTo(13, 10);
      graphics.closePath();
      graphics.fillPath();
      graphics.generateTexture("lightning_icon", 24, 24);
      graphics.destroy();
    }
  }

create() {
    this.score = 0;
    this.lives = 1;
    this.scoreMultiplier = 1;
    this.isInvulnerable = false;
    this.melodyNoteIndex = 0;
    this.shieldAlpha = 1;
    this.isLevelUpWave = false;

    this.currentSpeed = this.baseSpeed;
    this.speedLevel = 0;
    this.currentBorderColor = this.defaultBorderColor();
    this.isGameOver = false;
    this.gameOverSwipeActive = false;
    this.gameOverCarousel = undefined;

    this.generateTextures();
    this.initAudio();

    const width = this.scale.width;
    const height = this.scale.height;

    // --- 🌌 НЕОНОВЫЙ ТЁМНЫЙ ГРАДИЕНТНЫЙ ФОН ---
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050515, 0x050515, 0x0a0518, 0x0a0518, 1);
    bg.fillRect(0, 0, width, height);

    // --- 🕸️ НЕОНОВАЯ ФОНОВАЯ СЕТКА ПОВЕРХ ГРАДИЕНТА ---
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

    // Размер корабля подбираем под внутреннюю часть рамки,
    // чтобы он заполнял пространство внутри неё
    this.shipGraphics = NeonShipRenderer.create(this, this.currentSkin, this.shipRenderSize());
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
    this.gateTriggers = this.physics.add.group();

    // UI
    this.scoreText = this.add.text(20, 18, "Level: 0", {
      fontSize: "20px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    this.add.image(20, 52, "heart_icon").setOrigin(0, 0.5);
    this.livesText = this.add
      .text(50, 52, "x1", {
        fontSize: "18px",
        color: "#ff3366",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.add.image(110, 52, "lightning_icon").setOrigin(0, 0.5);
    this.speedText = this.add
      .text(140, 52, "x1.00", {
        fontSize: "18px",
        color: "#ffcc00",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.statusText = this.add.text(20, 80, "", {
      fontSize: "16px",
      color: "#00ffff",
      fontStyle: "bold",
    });

    this.createShieldIndicator();

    // Управление
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver) {
        // На Game Over фиксируем стартовую точку тапа/свайпа для карусели
        this.gameOverSwipeStartX = pointer.x;
        this.gameOverSwipeActive = true;
        return;
      }
      this.resumeAudio();
      this.isDragging = true;
      this.dragStartX = pointer.x;
      this.playerStartX = this.playerContainer.x;

      if (!this.isInvulnerable) {
        this.drawPlayerBorder(this.COLOR_BORDER_ACTIVE);
      }
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver) return;
      if (this.isDragging) {
        const deltaX = pointer.x - this.dragStartX;
        const targetX = this.playerStartX + deltaX;
        const halfWidth = (this.playerSize + this.borderPadding * 2) / 2;
        const clampedX = Phaser.Math.Clamp(
          targetX,
          halfWidth,
          this.scale.width - halfWidth,
        );

        this.playerContainer.x = clampedX;
        this.playerBody.updateFromGameObject();
      }
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver) {
        if (this.gameOverSwipeActive) {
          this.handleGameOverSwipe(pointer.x, pointer.y);
        }
        this.gameOverSwipeActive = false;
        return;
      }
      this.isDragging = false;
      if (!this.isInvulnerable) {
        this.drawPlayerBorder(this.currentBorderColor);
      }
    });

    // Переключение скинов (1/2/3)
    if (this.input.keyboard) {
      SPACESHIP_SKINS.forEach((skin, index) => {
        this.input.keyboard!.on(`keydown-${index + 1}`, () => {
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
      this.gateTriggers,
      this.passGate,
      undefined,
      this,
    );

    this.updateUI();
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

  // --- 🛡️ НЕОНОВЫЙ ИНДИКАТОР ЩИТА (по центру сверху) ---
  private createShieldIndicator() {
    const radius = 36;
    const pointyTop = 90;
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 6; i++) {
      const a = ((pointyTop - i * 60) * Math.PI) / 180;
      pts.push(new Phaser.Math.Vector2(radius * Math.cos(a), -radius * Math.sin(a)));
    }

    const shieldGraphic = this.add.graphics();
    shieldGraphic.fillStyle(this.COLOR_BORDER_SHIELD, 0.18);
    shieldGraphic.fillPoints(pts, true);
    shieldGraphic.lineStyle(3, this.COLOR_BORDER_SHIELD, 0.15);
    shieldGraphic.strokePoints(pts, true, true);
    shieldGraphic.lineStyle(1.5, this.COLOR_BORDER_SHIELD, 0.95);
    shieldGraphic.strokePoints(pts, true, true);

    const label = this.add
      .text(0, 0, "SHIELD", {
        fontSize: "15px",
        color: "#00ff88",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    label.setShadow(0, 0, "#00ff88d2", 8, false, true);

    this.shieldIndicator = this.add
      .container(this.scale.width / 2, 80, [shieldGraphic, label])
      .setVisible(false);
  }

  // --- 🛡️ АКТИВАЦИЯ ЩИТА С МЕРЦАНИЕМ ---
  private activateInvulnerability(durationMs: number = 5000) {
    if (this.shieldTimer) this.shieldTimer.destroy();
    if (this.shieldBlinkTween) this.shieldBlinkTween.stop();

    this.isInvulnerable = true;
    this.shieldAlpha = 1;
    this.showStatus("🛡️ Shield!");

    this.drawPlayerBorder(this.COLOR_BORDER_SHIELD);

    // Показываем индикатор с лёгким «всплытием»
    this.shieldIndicator.setVisible(true).setAlpha(1).setScale(0.8);
    if (this.shieldIndicatorTween) this.shieldIndicatorTween.stop();
    this.shieldIndicatorTween = this.tweens.add({
      targets: this.shieldIndicator,
      scale: 1,
      duration: 300,
      ease: "back.out",
    });

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
          if (this.shieldIndicator) {
            this.shieldIndicator.setAlpha(this.shieldAlpha);
          }
        },
      });
    });

    this.shieldTimer = this.time.delayedCall(durationMs, () => {
      this.isInvulnerable = false;
      this.shieldAlpha = 1;
      if (this.shieldBlinkTween) this.shieldBlinkTween.stop();

      this.shieldIndicator.setVisible(false).setAlpha(1).setScale(1);

      this.showStatus("");

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

  private checkSpeedProgression() {
    if (
      this.speedLevel < this.speedThresholds.length &&
      this.score >= this.speedThresholds[this.speedLevel]
    ) {
      this.speedLevel++;
      this.currentSpeed =
        this.baseSpeed * Math.pow(this.speedMultiplierStep, this.speedLevel);

      const newDelay = Math.max(
        1000,
        this.baseSpawnDelay / Math.pow(1.15, this.speedLevel),
      );
      if (this.spawnTimer) {
        this.spawnTimer.timeScale = this.baseSpawnDelay / newDelay;
      }

      this.isLevelUpWave = true;

      const currentMultiplierStr = Math.pow(
        this.speedMultiplierStep,
        this.speedLevel,
      ).toFixed(2);
      this.showStatus(`⚡ TURBO! (${currentMultiplierStr}x)`);
      this.cameras.main.flash(250, 0, 243, 255);
      this.cameras.main.shake(150, 0.005);
    }
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
  // До множителя x7 — стандартные 800мс, дальше плавно ужимается до минимума.
  // На x7–x8 постоянный ряд подсказок позволял «абьюзить» тайминги и заранее
  // вычитывать безопасную колонку — укорачиваем окно реакции по подсказке.
  private getPreviewDelay(): number {
    const mult = Math.pow(this.speedMultiplierStep, this.speedLevel);
    if (mult <= this.previewShrinkAtMultiplier) {
      return this.basePreviewDelay;
    }

    const peakMult = Math.pow(
      this.speedMultiplierStep,
      this.speedThresholds.length,
    );
    // sqrt-сглаживание: сокращение ощутимо уже на x7–x8,
    // а не только в самом конце прогрессии
    const t = Math.sqrt(
      Phaser.Math.Clamp(
        (mult - this.previewShrinkAtMultiplier) /
          (peakMult - this.previewShrinkAtMultiplier),
        0,
        1,
      ),
    );
    return Math.round(
      this.basePreviewDelay + (this.minPreviewDelay - this.basePreviewDelay) * t,
    );
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

  private spawnWave() {
    const screenWidth = this.scale.width;
    const totalColumns = 5;
    const columnWidth = screenWidth / totalColumns;

    const safeColumn = Phaser.Math.Between(0, totalColumns - 1);
    const fallVelocity = this.scale.height * this.currentSpeed;

    // === БАЛАНС: превью и стартовая позиция зависят от текущей скорости ===
    const previewDelay = this.getPreviewDelay();
    const spawnY = this.getSpawnY(fallVelocity, previewDelay);

    // Палитра волны: при повышении уровня — бирюзовый/белый, в обычном режиме
    // цвет зависит от текущей скорости (синий → жёлтый → красный)
    const isLevelUp = this.isLevelUpWave;
    const obstacleColor = isLevelUp ? 0x00f3ff : this.getSpeedColor();
    const strokeColor = isLevelUp ? 0xffffff : this.lightenColor(obstacleColor, 0.45);
    const safeColor = isLevelUp ? 0xffd700 : 0x00ff88;

    if (isLevelUp) {
      this.isLevelUpWave = false;
    }

    for (let i = 0; i < totalColumns; i++) {
      const x = i * columnWidth + columnWidth / 2;

      if (i === safeColumn) {
        // Безопасный проход
        const safeWarning = this.add.rectangle(
          x,
          40,
          columnWidth - 10,
          15,
          safeColor,
          0.3,
        );
        safeWarning.setStrokeStyle(1, safeColor, 0.8);

        this.time.delayedCall(previewDelay, () => {
          safeWarning.destroy();

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

    if (Phaser.Math.Between(1, 100) <= 35) {
      // Буст выезжает сразу после того, как превью волны отработало
      this.time.delayedCall(previewDelay + 300, () => {
        this.spawnBetweenWaveBoost(totalColumns, columnWidth, fallVelocity);
      });
    }

    this.score += 1 * this.scoreMultiplier;
    this.checkSpeedProgression();
    this.updateUI();
  }

  private spawnBetweenWaveBoost(
    totalColumns: number,
    columnWidth: number,
    fallVelocity: number,
  ) {
    const randomColumn = Phaser.Math.Between(0, totalColumns - 1);
    const x = randomColumn * columnWidth + columnWidth / 2;

    const boostWarning = this.add.circle(x, 40, 10, 0xbb00ff, 0.4);
    boostWarning.setStrokeStyle(1, 0xdd44ff, 0.8);

    this.time.delayedCall(600, () => {
      boostWarning.destroy();

      const boostBlock = this.add.rectangle(x, -20, 30, 30, 0xbb00ff, 0.7);
      boostBlock.setStrokeStyle(2, 0xee77ff, 1);

      this.boostsGroup.add(boostBlock);

      const boostBody = boostBlock.body as Phaser.Physics.Arcade.Body;
      boostBody.setVelocityY(fallVelocity);

      this.tweens.add({
        targets: boostBlock,
        rotation: Math.PI,
        duration: 1000,
        repeat: -1,
      });
    });
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
      this.lives += 1;
      this.showStatus("❤️ +1 Life!");
    } else if (type === 2) {
      if (this.boostMultiplierTimer) this.boostMultiplierTimer.destroy();

      this.scoreMultiplier = 2;
      this.showStatus("🔥 X2 Score!");
      this.updateBorderState(this.COLOR_BORDER_BOOST);

      this.boostMultiplierTimer = this.time.delayedCall(10000, () => {
        this.scoreMultiplier = 1;
        this.showStatus("");
        this.updateBorderState(
          this.isInvulnerable
            ? this.COLOR_BORDER_SHIELD
            : this.defaultBorderColor(),
        );
      });
    } else if (type === 3) {
      this.activateInvulnerability(5000);
    }

    this.updateUI();
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
    this.updateUI();
    this.cameras.main.flash(200, 255, 0, 0);
    this.cameras.main.shake(120, 0.008);

    if (this.lives <= 0) {
      this.showGameOver();
    }
  }

  // --- 🎮 ОКНО GAME OVER С НЕОНОВЫМ ОВЕРЛЕЕМ И КАРУСЕЛЬЮ СКИНОВ ---
  private showGameOver() {
    if (this.isGameOver) return;
    this.isGameOver = true;

    // Останавливаем игровую логику
    if (this.spawnTimer) this.spawnTimer.paused = true;
    this.time.removeAllEvents();
    if (this.shieldBlinkTween) this.shieldBlinkTween.stop();
    this.isDragging = false;
    this.shieldIndicator.setVisible(false);

    // Очищаем падающие объекты
    this.obstacles.clear(true, true);
    this.boostsGroup.clear(true, true);
    this.gateTriggers.clear(true, true);

    const width = this.scale.width;
    const height = this.scale.height;

    // Контейнер для всего UI окончания игры
    const gameOverContainer = this.add.container(0, 0).setDepth(100);

    // Полупрозрачный темный фон
    const bg = this.add
      .rectangle(width / 2, height / 2, width, height, 0x050510, 0.85);

    // Текст GAME OVER
    const title = this.add
      .text(width / 2, height * 0.18, "GAME OVER", {
        fontSize: "36px",
        color: "#ff0055",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    title.setShadow(0, 0, "#ff0055", 12, false, true);

    // Статистика
    const currentMult = Math.pow(
      this.speedMultiplierStep,
      this.speedLevel,
    ).toFixed(2);
    const statsText = this.add
      .text(
        width / 2,
        height * 0.32,
        `SCORE: ${this.score}\nMAX SPEED: x${currentMult}`,
        {
          fontSize: "20px",
          color: "#ffffff",
          align: "center",
          lineSpacing: 10,
        },
      )
      .setOrigin(0.5);

// --- ПРЕВЬЮ КОРАБЛЯ В КАРУСЕЛИ (живой через NeonShipRenderer) ---
    const previewSize = Math.min(90, width * 0.14);
    const previewFrame = this.add.graphics();
    const previewShip = NeonShipRenderer.create(this, this.currentSkin, previewSize);
    const previewContainer = this.add.container(width / 2, height * 0.46, [
      previewFrame,
      previewShip,
    ]);

    // Название корабля над превью
    const skinLabel = this.add
      .text(width / 2, height * 0.64, `SHIP: ${this.currentSkin.name}`, {
        fontSize: "16px",
        color: "#ffcc00",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Стрелки и подсказка (визуальные)
    const prevBtn = this.add
      .text(width / 2 - 110, height * 0.64, "◄", {
        fontSize: "28px",
        color: "#ffcc00",
      })
      .setOrigin(0.5);
    const nextBtn = this.add
      .text(width / 2 + 110, height * 0.64, "►", {
        fontSize: "28px",
        color: "#ffcc00",
      })
      .setOrigin(0.5);

    const hintText = this.add
      .text(width / 2, height * 0.72, "TAP / SWIPE ◄ ►", {
        fontSize: "12px",
        color: "#888899",
      })
      .setOrigin(0.5);

    // Переключение скинов обрабатывается на уровне сцены
    // (тап/свайп по экрану + стрелки клавиатуры), см. handleGameOverSwipe
    this.gameOverCarousel = {
      frame: previewFrame,
      ship: previewShip,
      label: skinLabel,
      size: previewSize,
    };
    // Синхронизируем рамку/подпись с текущим скином
    this.switchSkinBy(0);

    // Клавиатура: стрелки листают скины
    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-LEFT", () => this.switchSkinBy(-1));
      this.input.keyboard.on("keydown-RIGHT", () => this.switchSkinBy(1));
    }

    // --- КНОПКА: RESTART ---
    const restartBtnBg = this.add
      .rectangle(width / 2, height * 0.8, 220, 52, 0x00f3ff, 0.2)
      .setStrokeStyle(2, 0x00f3ff, 1)
      .setInteractive({ useHandCursor: true });
    const restartBtnText = this.add
      .text(width / 2, height * 0.8, "RESTART", {
        fontSize: "20px",
        color: "#00f3ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    restartBtnBg.on("pointerdown", () => {
      this.scene.restart();
    });

    gameOverContainer.add([
      bg,
      title,
      statsText,
      previewContainer,
      skinLabel,
      prevBtn,
      nextBtn,
      hintText,
      restartBtnBg,
      restartBtnText,
]);

    // Плавное появление UI
    gameOverContainer.setAlpha(0);
    this.tweens.add({
      targets: gameOverContainer,
      alpha: 1,
      duration: 400,
      ease: "Power2",
    });
  }

  /**
   * Листает скины в карусели на Game Over.
   * direction: -1 — назад, 1 — вперёд, 0 — только перерисовать текущий.
   */
  private switchSkinBy(direction: number): void {
    const carousel = this.gameOverCarousel;
    if (!carousel) return;

    const currentIndex = SPACESHIP_SKINS.findIndex(
      (s) => s.id === this.currentSkin.id,
    );
    let newIndex = (currentIndex + direction) % SPACESHIP_SKINS.length;
    if (newIndex < 0) newIndex = SPACESHIP_SKINS.length - 1;

    const newSkin = SPACESHIP_SKINS[newIndex];
    this.applySkin(newSkin);

    NeonShipRenderer.updateSkin(carousel.ship, newSkin, carousel.size);
    const s = carousel.size + 18;
    carousel.frame.clear();
    carousel.frame.lineStyle(2, newSkin.glowColor, 0.9);
    carousel.frame.strokeRoundedRect(-s / 2, -s / 2, s, s, 14);
    carousel.label.setText(`SHIP: ${newSkin.name}`);
  }

  /**
   * Обработка тапа/свайпа по экрану Game Over:
   * свайп влево/вправо или тап в соответствующей половине листает карусель.
   */
  private handleGameOverSwipe(endX: number, endY: number): void {
    // Не реагируем на зону кнопки RESTART
    if (endY > this.scale.height * 0.76) return;

    const dx = endX - this.gameOverSwipeStartX;
    if (Math.abs(dx) >= 50) {
      // Свайп
      this.switchSkinBy(dx < 0 ? 1 : -1);
    } else if (Math.abs(dx) < 12) {
      // Тап: левая половина — назад, правая — вперёд
      this.switchSkinBy(endX < this.scale.width / 2 ? -1 : 1);
    }
    // Промежуточные движения игнорируем
  }

  private updateUI() {
    this.scoreText.setText(`Level: ${this.score}`);
    this.livesText.setText(`x${this.lives}`);

    const currentMult = Math.pow(
      this.speedMultiplierStep,
      this.speedLevel,
    ).toFixed(2);
    this.speedText.setText(`x${currentMult}`);
  }

  private showStatus(msg: string) {
    this.statusText.setText(msg);
  }
}