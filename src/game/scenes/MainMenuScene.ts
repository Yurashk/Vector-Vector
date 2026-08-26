import * as Phaser from "phaser";
import {
  GeoPart,
  SPACESHIP_SKINS,
  getSelectedSkin,
  getUnlockedSkins,
} from "../spaceship-skins";
import {
  COLOR_BG,
  COLOR_CYAN,
  COLOR_GOLD,
  COLOR_PINK,
  COLOR_PURPLE,
  GameState,
  drawGrid,
  drawNeonPlate,
  drawSciFiIcon,
  formatDuration,
} from "../ui/NeonUI";
import { gameServices } from "../../services/GameServicesManager";
import { CoinPlate } from "../ui/CoinPlate";
import { PALETTES, loadCustomization } from "../garage-data";

export class MainMenuScene extends Phaser.Scene {
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private coinPlate!: CoinPlate;
  private adsPlate!: Phaser.GameObjects.Container;
  private livesPlate!: Phaser.GameObjects.Container;
  private livesText!: Phaser.GameObjects.Text;
  private rankPlate!: Phaser.GameObjects.Container;
  private rankText!: Phaser.GameObjects.Text;
  private settingsBtn!: Phaser.GameObjects.Container;

  // Элементы фокуса
  private heroContainer!: Phaser.GameObjects.Container;

  // Нижний навигационный док
  private dockRoot!: Phaser.GameObjects.Container;

  private toast?: Phaser.GameObjects.Text;
  private resizeHandler?: (size: Phaser.Structs.Size) => void;

  // Габариты дока
  private static readonly DOCK_ITEM_W = 96;
  private static readonly DOCK_ITEM_H = 64;
  private static readonly DOCK_GAP = 12;
  /** Фон неоновых карточек-табов: покой и ховер */
  private static readonly TAB_BG_IDLE = 0x241740;
  private static readonly TAB_BG_HOVER = 0x3a2666;

  constructor() {
    super("MainMenu");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR_BG);
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Синхронизируем BP при входе в меню (Design Wing генерирует пассивно)
    GameState.syncBlueprints();
    void gameServices.updateBlueprintsToCloud(
      GameState.getBlueprints(),
      GameState.getLastBpTimestamp(),
    );

    this.gridGraphics = this.add.graphics().setDepth(0);
    
    this.createTopBar();
    this.createHeroSection(); // Центральный герой-блок с кнопкой START GAME
    this.createBottomDock();  // Компактная навигация внизу
    this.createSettingsButton();

    this.layout(this.scale.width, this.scale.height);

    this.resizeHandler = (size) => this.layout(size.width, size.height);
    this.scale.on("resize", this.resizeHandler);
    this.events.once("shutdown", () => {
      if (this.resizeHandler) {
        this.scale.off("resize", this.resizeHandler);
      }
    });
  }

  // --- Полупрозрачная кибер-сетка с эффектом глубины ---
  private drawGrid(w: number, h: number): void {
    drawGrid(this.gridGraphics, w, h);
  }

  // --- Неоновая плашка с эффектом Glow ---
  private drawNeonPlate(
    g: Phaser.GameObjects.Graphics,
    w: number,
    h: number,
    color: number,
    radius = 12
  ): void {
    drawNeonPlate(g, w, h, color, radius, 0.12);
  }

  // --- Верхняя панель (Top Bar) — компактные размеры под мобильные экраны ---
  private createTopBar(): void {
    const plateH = 32;

    // Монеты — единая плашка CoinPlate (золотой ромб CR)
    this.coinPlate = new CoinPlate(this, 0, 0, GameState.getCoins(), "CR");

    // Реклама
    const adsBg = this.add.graphics();
    this.drawNeonPlate(adsBg, 112, plateH, COLOR_GOLD, 9);
    const adText = this.add.text(0, 0, "+50 COINS", {
      fontSize: "12px",
      color: "#ffd700",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.adsPlate = this.add.container(0, 0, [adsBg, adText]);
    this.adsPlate.setSize(112, plateH);
    this.adsPlate.setInteractive({ useHandCursor: true });

    this.adsPlate.on("pointerover", () => this.tweens.add({ targets: this.adsPlate, scale: 1.05, duration: 100 }));
    this.adsPlate.on("pointerout", () => this.tweens.add({ targets: this.adsPlate, scale: 1, duration: 100 }));
    this.adsPlate.on("pointerup", () => this.onWatchAdClick());

    // Жизни (энергия): векторная молния + счётчик и таймер восстановления
    const livesBg = this.add.graphics();
    this.drawNeonPlate(livesBg, 136, 30, COLOR_PINK, 9);
    const livesIcon = this.add.graphics();
    drawSciFiIcon(livesIcon, "engineering", COLOR_PINK, 7);
    livesIcon.setPosition(-48, 0);
    this.livesText = this.add
      .text(8, 0, "", {
        fontSize: "12px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.livesPlate = this.add.container(0, 0, [livesBg, livesIcon, this.livesText]);
    this.updateLivesDisplay();

    // Позиция игрока в топе — плашка с фиолетовым фоном под жизнями
    const rankW = 100;
    const rankH = 22;
    const rankBg = this.add.graphics();
    rankBg.fillStyle(0x12002a, 0.7);
    rankBg.fillRoundedRect(-rankW / 2, -rankH / 2, rankW, rankH, 6);
    rankBg.lineStyle(1.4, COLOR_PURPLE, 0.75);
    rankBg.strokeRoundedRect(-rankW / 2, -rankH / 2, rankW, rankH, 6);

    this.rankText = this.add
      .text(0, 0, "", {
        fontSize: "11px",
        color: "#9d00ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.rankPlate = this.add.container(0, 0, [rankBg, this.rankText]);
    this.rankPlate.setAlpha(0);

    this.fetchAndShowRank();

    // Посекундное обновление таймера восстановления
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.updateLivesDisplay(),
    });
  }

  /** Актуализирует жизни по реальному времени и перерисовывает плашку */
  private updateLivesDisplay(): void {
    const lives = GameState.syncLives();
    const max = GameState.getMaxLives();
    const ms = GameState.msToNextLife();
    const timer = ms > 0 ? ` · ${formatDuration(ms)}` : "";
    this.livesText.setText(`${lives}/${max}${timer}`);
  }

  /**
   * Запрашивает топ-100 лидерборда, находит позицию текущего игрока
   * и показывает её под плашкой энергии фиолетовым неоновым цветом.
   * Fire-and-forget: ошибки молча глотаются.
   */
  private async fetchAndShowRank(): Promise<void> {
    try {
      const userId = gameServices.getUserId();
      if (!userId) return;

      const top = await gameServices.getLeaderboard(100);
      const idx = top.findIndex((e) => e.userId === userId);
      if (idx < 0) return; // Игрока нет в топе — не показываем

      const rank = idx + 1;
      this.rankText.setText(`#${rank} IN TOP`);

      // Мягкое появление через 1с (когда данные точно загружены)
      this.time.delayedCall(1000, () => {
        if (!this.rankPlate) return;
        this.rankPlate.setAlpha(1);
        this.tweens.add({
          targets: this.rankPlate,
          alpha: { from: 0.6, to: 1 },
          duration: 1800,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      });
    } catch {
      /* fire-and-forget */
    }
  }

  // --- Центральный блок с акцентом (Hero Section) ---
 private createHeroSection(): void {
  const baseSkin = getSelectedSkin();
  // === БАЛАНС: применяем выбранную палитру к hull геометрии ===
  const custom = loadCustomization();
  const palette = PALETTES.find((p) => p.id === custom.selectedPaletteId) ?? PALETTES[0];
  const skin = {
    ...baseSkin,
    primaryColor: palette.primary,
    accentColor: palette.accent,
    glowColor: palette.glow,
  };

  // 1. Неоновая фоновая орбита (создает эффект кибер-платформы под кораблем)
  const orbitGraphics = this.add.graphics();
  
  // Внешний пунктирный / тонкий неоновый диск
  orbitGraphics.lineStyle(2, skin.glowColor, 0.4);
  orbitGraphics.strokeCircle(0, 0, 75);
  orbitGraphics.lineStyle(1, skin.accentColor, 0.25);
  orbitGraphics.strokeCircle(0, 0, 88);

  // Декоративные перекрестия (кибер-прицел)
  orbitGraphics.lineStyle(1.5, skin.glowColor, 0.5);
  orbitGraphics.lineBetween(-95, 0, -80, 0);
  orbitGraphics.lineBetween(80, 0, 95, 0);
  orbitGraphics.lineBetween(0, -95, 0, -80);
  orbitGraphics.lineBetween(0, 80, 0, 95);

  // Вращение фоновой орбиты
  this.tweens.add({
    targets: orbitGraphics,
    angle: 360,
    duration: 16000,
    repeat: -1,
    ease: "Linear",
  });

  // 2. Отрисовка самого корабля из полигонов
  const shipGraphics = this.add.graphics();
  const scale = 2.8; // Оптимальный масштаб для центрального экрана

  skin.parts.forEach((part: GeoPart) => {
    if (part.type === "polygon" && part.points) {
      const color = part.accent ? skin.accentColor : skin.primaryColor;
      const pts = part.points.map((pt) => pt * scale);

      // Полупрозрачная неоновая заливка
      shipGraphics.fillStyle(color, 0.35);
      shipGraphics.beginPath();
      shipGraphics.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) {
        shipGraphics.lineTo(pts[i], pts[i + 1]);
      }
      shipGraphics.closePath();
      shipGraphics.fillPath();

      // Яркий контур полигона
      shipGraphics.lineStyle(1.8, color, 0.95);
      shipGraphics.strokePath();
    }
  });

  // 3. Главная кнопка START GAME — доминирующий CTA экрана
  const BTN_W = 230;
  const BTN_H = 58;

  // Пульсирующий неоновый контур позади кнопки (привлекает взгляд)
  const ringGfx = this.add.graphics();
  ringGfx.lineStyle(3, skin.glowColor, 0.55);
  ringGfx.strokeRoundedRect(-BTN_W / 2 - 6, -BTN_H / 2 - 6, BTN_W + 12, BTN_H + 12, 18);
  const ctaGlow = this.add.container(0, 125, [ringGfx]);
  this.tweens.add({
    targets: ctaGlow,
    scale: 1.04,
    alpha: { from: 1, to: 0.25 },
    duration: 900,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });

  const playBtnBg = this.add.graphics();
  this.drawNeonPlate(playBtnBg, BTN_W, BTN_H, skin.glowColor, 14);

  const playText = this.add.text(0, 0, "START GAME", {
    fontSize: "21px",
    color: "#ffffff",
    fontStyle: "bold",
  }).setOrigin(0.5);

  const playBtn = this.add.container(0, 125, [playBtnBg, playText]);
  playBtn.setSize(BTN_W, BTN_H);
  playBtn.setInteractive({ useHandCursor: true });

  playBtn.on("pointerover", () =>
    this.tweens.add({ targets: playBtn, scale: 1.06, duration: 100 })
  );
  playBtn.on("pointerout", () =>
    this.tweens.add({ targets: playBtn, scale: 1, duration: 100 })
  );
  playBtn.on("pointerup", () => this.onStartClick());

  // 4. Сборка Hero-контейнера (свечение под кнопкой)
  this.heroContainer = this.add.container(0, 0, [
    orbitGraphics,
    shipGraphics,
    ctaGlow,
    playBtn,
  ]);

  // Эффект плавного парения в воздухе
  this.tweens.add({
    targets: this.heroContainer,
    y: "-=10",
    duration: 1800,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });
}

  // --- Нижний навигационный док: минималистичные вкладки «иконка + подпись» ---
  private createBottomDock(): void {
    const unlocked = getUnlockedSkins(GameState.getStation().design).length;
    const { DOCK_ITEM_W, DOCK_GAP } = MainMenuScene;

    this.dockRoot = this.add.container(0, 0);

    interface DockDef {
      label: string;
      color: number;
      drawIcon: (g: Phaser.GameObjects.Graphics) => void;
      onClick: () => void;
    }

    const defs: DockDef[] = [
      {
        label: "STATION",
        color: COLOR_PURPLE,
        drawIcon: (g) => this.drawStationGlyph(g, COLOR_PURPLE),
        onClick: () => this.goToScene("Station"),
      },
      {
        label: `SKINS (${unlocked}/${SPACESHIP_SKINS.length})`,
        color: COLOR_PINK,
        drawIcon: (g) => this.drawShipGlyph(g, COLOR_PINK),
        onClick: () => this.onSkinsClick(),
      },
      {
        label: "RANKS",
        color: COLOR_GOLD,
        drawIcon: (g) => this.drawChevronGlyph(g, COLOR_GOLD),
        onClick: () => this.goToScene("Leaderboard"),
      },
    ];

    defs.forEach((def, i) => {
      const totalW = 3 * DOCK_ITEM_W + 2 * DOCK_GAP;
      const x = -totalW / 2 + DOCK_ITEM_W / 2 + i * (DOCK_ITEM_W + DOCK_GAP);
      this.createDockItem(def, x);
    });
  }

  private createDockItem(
    cfg: {
      label: string;
      color: number;
      drawIcon: (g: Phaser.GameObjects.Graphics) => void;
      onClick: () => void;
    },
    localX: number,
  ): void {
    const { DOCK_ITEM_W, DOCK_ITEM_H } = MainMenuScene;
    const homeY = 0;

    // Неоновая киберпанк-карточка: тёмно-фиолетая подложка +
    // тонкая неоновая рамка цветом отсека
    const bg = this.add.graphics();
    this.drawTabCard(bg, DOCK_ITEM_W, DOCK_ITEM_H, cfg.color, false);

    const icon = this.add.graphics();
    cfg.drawIcon(icon);
    icon.setScale(1.2);
    icon.setPosition(0, -13);

    const label = this.add.text(0, 17, cfg.label, {
      fontSize: "11px",
      color: "#ffffff",
      fontStyle: "bold",
    }).setOrigin(0.5);

    const container = this.add.container(localX, homeY, [bg, icon, label]);
    container.setSize(DOCK_ITEM_W, DOCK_ITEM_H);
    container.setInteractive({ useHandCursor: true });
    this.dockRoot.add(container);

    // Ховер: рамка до полной яркости + более светлый фон + подъём на -4px
    container.on("pointerover", () => {
      this.drawTabCard(bg, DOCK_ITEM_W, DOCK_ITEM_H, cfg.color, true);
      this.tweens.add({
        targets: container,
        y: homeY - 4,
        duration: 120,
        ease: "Sine.easeOut",
      });
    });
    container.on("pointerout", () => {
      this.drawTabCard(bg, DOCK_ITEM_W, DOCK_ITEM_H, cfg.color, false);
      this.tweens.add({
        targets: container,
        y: homeY,
        duration: 140,
        ease: "Sine.easeOut",
      });
    });
    // Нажатие: лёгкое сжатие
    container.on("pointerdown", () =>
      this.tweens.add({ targets: container, scale: 0.95, duration: 70 }),
    );
    container.on("pointerup", () => {
      this.tweens.add({ targets: container, scale: 1, duration: 90 });
      cfg.onClick();
    });
  }

  /**
   * Фон вкладки дока — неоновая карточка:
   * полупрозрачная тёмно-фиолетовая плашка radius 10 без острых углов
   * + тонкая рамка 1.5px цветом отсека. На ховере фон светлее,
   * рамка — полной яркости.
   */
  private drawTabCard(
    g: Phaser.GameObjects.Graphics,
    w: number,
    h: number,
    color: number,
    hovered: boolean,
  ): void {
    g.clear();
    g.fillStyle(hovered ? MainMenuScene.TAB_BG_HOVER : MainMenuScene.TAB_BG_IDLE, 0.4);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    g.lineStyle(1.5, color, hovered ? 1 : 0.8);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
  }

  // --- Векторные глифы элементов дока ---

  /** Орбитальная станция: ядро + кольцо орбиты со спутниками */
  private drawStationGlyph(g: Phaser.GameObjects.Graphics, color: number): void {
    g.lineStyle(1.6, color, 0.9);
    g.strokeCircle(0, -1, 5);       // ядро
    g.strokeEllipse(0, -1, 22, 8);  // орбита
    g.lineStyle(1.2, color, 0.7);
    g.lineBetween(0, -12, 0, -6);   // антенна
    g.fillStyle(color, 0.95);
    g.fillCircle(11, -4, 1.8);      // спутники на орбите
    g.fillCircle(-11, 2, 1.8);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(0, -1, 1.6);       // блик ядра
  }

  /** Мини-силуэт корабля (отсеки SKINS) */
  private drawShipGlyph(g: Phaser.GameObjects.Graphics, color: number): void {
    const pts = [0, -10, 7, 4, 3, 2, 0, 8, -3, 2, -7, 4];
    g.fillStyle(color, 0.35);
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fillPath();
    g.lineStyle(1.6, color, 0.95);
    g.strokePath();
  }

  /** Военный шеврон (отсек RANKS) */
  private drawChevronGlyph(g: Phaser.GameObjects.Graphics, color: number): void {
    g.lineStyle(2.4, color, 0.95);
    g.beginPath();
    g.moveTo(-8, -2);
    g.lineTo(0, -9);
    g.lineTo(8, -2);
    g.strokePath();
    g.beginPath();
    g.moveTo(-8, 6);
    g.lineTo(0, -1);
    g.lineTo(8, 6);
    g.strokePath();
  }

  // --- Круглая кнопка SETTINGS (шестерёнка) в правом верхнем углу ---
  private createSettingsButton(): void {
    const plate = this.add.graphics();
    plate.fillStyle(0x12122a, 0.85);
    plate.fillCircle(0, 0, 15);
    plate.lineStyle(1.4, COLOR_CYAN, 0.7);
    plate.strokeCircle(0, 0, 15);

    const gear = this.add.graphics();
    this.drawGearGlyph(gear, COLOR_CYAN);

    this.settingsBtn = this.add.container(0, 0, [plate, gear]);

    // Явная круглая хит-зона: гарантированный клик по всей шестерёнке
    this.settingsBtn.setInteractive(
      new Phaser.Geom.Circle(0, 0, 17),
      Phaser.Geom.Circle.Contains,
    );
    this.settingsBtn.input!.cursor = "pointer"; // useHandCursor

    // Ховер: микро-вращение шестерёнки
    this.settingsBtn.on("pointerover", () =>
      this.tweens.add({ targets: gear, angle: 45, duration: 250, ease: "Back.easeOut" }),
    );
    this.settingsBtn.on("pointerout", () =>
      this.tweens.add({ targets: gear, angle: 0, duration: 200 }),
    );
    // Клик по самой кнопке — открываем настройки
    this.settingsBtn.on(
      "pointerdown",
      (
        _p: Phaser.Input.Pointer,
        _lx: number,
        _ly: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.openSettingsModal();
      },
    );
  }

  /** Открытие настроек (переход на сцену Settings) */
  private openSettingsModal(): void {
    this.goToScene("Settings");
  }

  /** Шестерёнка: зубцы по окружности + ступица с отверстием (компактная) */
  private drawGearGlyph(g: Phaser.GameObjects.Graphics, color: number): void {
    const teeth = 8;
    const rIn = 6;
    const rOut = 9.5;
    g.lineStyle(2.1, color, 0.95);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      g.lineBetween(
        Math.cos(a) * rIn,
        Math.sin(a) * rIn,
        Math.cos(a) * rOut,
        Math.sin(a) * rOut,
      );
    }
    g.strokeCircle(0, 0, rIn);
    // Отверстие ступицы — пробиваем цветом фона
    g.fillStyle(COLOR_BG, 1);
    g.fillCircle(0, 0, 2.5);
  }

  // --- Адаптивный Layout ---
  private layout(w: number, h: number): void {
    this.drawGrid(w, h);

    const pad = 16;
    // Левый край всех элементов: pad + 5 = 21px
    const leftX = pad + 5;
    // Top Bar: монеты сверху, жизни под ними, ранг под жизнями
    const topBarY = pad + 20 + 16; // pad + 36

    // CoinPlate: ширина 130, контейнер в центре → сдвиг вправо на halfW
    this.coinPlate.setPosition(leftX + 65, topBarY);
    // LivesPlate: ширина 136
    this.livesPlate.setPosition(leftX + 68, topBarY + 38);
    // RankPlate: центрируем под livesPlate (x = leftX + 68)
    this.rankPlate.setPosition(leftX + 68, topBarY + 38 + 22);
    this.adsPlate.setPosition(w - pad - 56, topBarY);

    // SETTINGS — под кнопкой "+50 COINS" с зазором 12px
    // (низ рекламы = topBarY + 16, радиус шестерёнки = 15)
    this.settingsBtn.setPosition(w - pad - 15, topBarY + 16 + 12 + 15);

    // Hero Section (Ровно по центру верхней половины)
    this.heroContainer.setPosition(w / 2, h * 0.38);

    // Навигационный док: по центру внизу, сжимается на узких экранах.
    // Масштабируется сам dockRoot, поэтому ховер-твины вкладок
    // (y/scale) не конфликтуют с масштабом ряда
    const dockY = h * 0.82;
    this.dockRoot.setPosition(w / 2, dockY);
    const naturalW =
      3 * MainMenuScene.DOCK_ITEM_W + 2 * MainMenuScene.DOCK_GAP;
    const maxW = w - 24;
    const dockScale = Phaser.Math.Clamp(Math.min(1, maxW / naturalW), 0.7, 1.15);
    this.dockRoot.setScale(dockScale);
  }

  // --- Обработчики ---
  private onWatchAdClick(): void {
    const newTotal = GameState.addCoins(50);
    this.coinPlate.setAmount(newTotal);
    this.showToast("+50 COINS RECEIVED", COLOR_GOLD);
  }

  private onSkinsClick(): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("Garage");
    });
  }

  private goToScene(key: string): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start(key);
    });
  }

  private onStartClick(): void {
    // Энергия: запуск забега стоит одну жизнь
    if (!GameState.trySpendLife()) {
      const ms = GameState.msToNextLife();
      this.showToast(`NO LIVES LEFT — NEXT IN ${formatDuration(ms)}`, COLOR_PINK);
      return;
    }
    this.updateLivesDisplay();

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("Game");
    });
  }

  private showToast(message: string, color: number): void {
    if (this.toast) this.toast.destroy();

    const hex = `#${color.toString(16).padStart(6, "0")}`;
    this.toast = this.add.text(this.scale.width / 2, this.scale.height * 0.68, message, {
      fontSize: "14px",
      color: hex,
      fontStyle: "bold",
      backgroundColor: "#00000099",
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: this.toast,
      y: "-=20",
      alpha: { from: 1, to: 0 },
      duration: 1400,
      onComplete: () => this.toast?.destroy(),
    });
  }
}