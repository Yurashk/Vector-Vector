import * as Phaser from "phaser";
import {
  COLOR_BG,
  COLOR_BRONZE,
  COLOR_CYAN,
  COLOR_GOLD,
  COLOR_PINK,
  COLOR_SILVER,
  GameState,
  drawGrid,
  drawNeonPlate,
} from "../ui/NeonUI";
import { gameServices } from "../../services/GameServicesManager";

interface LeaderboardRow {
  rank: number;
  name: string;
  score: number;
  isPlayer?: boolean;
}

const OFFLINE_ROWS: LeaderboardRow[] = [
  { rank: 1, name: "NEO_ONE", score: 98500 },
  { rank: 2, name: "CYBER_PUNK", score: 87400 },
  { rank: 3, name: "SHADOW_99", score: 76200 },
  { rank: 4, name: "GRID_RUNNER", score: 65100 },
  { rank: 5, name: "ZERO_COOL", score: 54900 },
];

export class LeaderboardScene extends Phaser.Scene {
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private cardContainer!: Phaser.GameObjects.Container;
  private backBtn!: Phaser.GameObjects.Container;

  private rows: LeaderboardRow[] = [];
  private playerBest = 0;
  private playerRank: number | null = null;

  constructor() {
    super("Leaderboard");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR_BG);
    this.cameras.main.fadeIn(300, 0, 0, 0);

    this.gridGraphics = this.add.graphics().setDepth(0);

    this.titleText = this.add
      .text(0, 0, "LEADERBOARD", {
        fontSize: "26px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(0, 0, "CONNECTING...", {
        fontSize: "12px",
        color: "#00f0ff",
      })
      .setOrigin(0.5);

    this.cardContainer = this.add.container(0, 0);

    // Загрузка локального рекорда
    const rawBest = localStorage.getItem("dodge-runner-highscore");
    this.playerBest = rawBest ? parseInt(rawBest, 10) || 0 : 0;

    // Оффлайн-версия по умолчанию
    this.rows = [...OFFLINE_ROWS];
    
    this.createBackButton();
    this.layout(this.scale.width, this.scale.height);

    // Запрос в Firebase
    void gameServices
      .getLeaderboard(10)
      .then((entries) => {
        if (!this.scene.isActive()) return;

        if (entries.length === 0) {
          this.statusText.setText("OFFLINE MODE");
          return;
        }

        const myUserId = gameServices.getUserId();
        const currentUsername = GameState.getUsername().toUpperCase();

        let foundPlayerInTop = false;

        this.rows = entries.map((e, i) => {
          const entryName = e.playerName.toUpperCase();
          const isPlayer = myUserId
            ? e.userId === myUserId
            : entryName === currentUsername;

          if (isPlayer) {
            foundPlayerInTop = true;
            this.playerRank = i + 1;
          }

          return {
            rank: i + 1,
            name: entryName,
            score: e.score,
            isPlayer,
          };
        });

        // Если игрока нет в ТОП-10, но у него есть очки — определяем его место
        if (!foundPlayerInTop && this.playerBest > 0) {
          // Здесь можно получить реальный ранг из бекенда, если есть API.
          // Иначе ставим условный ранг > 10
          this.playerRank = 99; 
        }

        this.statusText.setText("LIVE DATA");
        this.layout(this.scale.width, this.scale.height);
      })
      .catch(() => {
        if (!this.scene.isActive()) return;
        this.statusText.setText("OFFLINE MODE");
      });

    const onResize = (size: Phaser.Structs.Size) =>
      this.layout(size.width, size.height);
    this.scale.on("resize", onResize);
    this.events.once("shutdown", () => {
      this.scale.off("resize", onResize);
    });
  }

  // --- Сборка единой таблицы лидеров ---
  private rebuildBoard(width: number): void {
    this.cardContainer.removeAll(true);

    const rowHeight = 36;
    const padding = 16;
    
    // Формируем финальный список для отображения
    const displayRows = [...this.rows];
    const isPlayerInTop = displayRows.some((r) => r.isPlayer);

    // Если игрока нет в ТОП-10, добавляем разделитель и карточку игрока
    const showStickyPlayer = !isPlayerInTop && this.playerBest > 0;
    const totalRowsCount = displayRows.length + (showStickyPlayer ? 2 : 0); // +1 под '...', +1 под игрока
    const cardHeight = totalRowsCount * rowHeight + padding * 2;

    // 1. Общий фоновый планшет
    const cardBg = this.add.graphics();
    drawNeonPlate(cardBg, width, cardHeight, COLOR_CYAN, 12, 0.05);
    this.cardContainer.add(cardBg);

    let startY = -cardHeight / 2 + padding + rowHeight / 2;

    // 2. Отрисовка основных строк ТОПа
    displayRows.forEach((entry, i) => {
      const y = startY + i * rowHeight;
      const rowContainer = this.createRowItem(entry, width - padding * 2);
      rowContainer.setPosition(0, y);
      this.cardContainer.add(rowContainer);
    });

    // 3. Если игрок ниже в рейтинге — добавляем троеточие и его строку
    if (showStickyPlayer) {
      const dotsY = startY + displayRows.length * rowHeight;
      const dotsTxt = this.add
        .text(0, dotsY, "•  •  •", {
          fontSize: "14px",
          color: "#555566",
        })
        .setOrigin(0.5);
      this.cardContainer.add(dotsTxt);

      const playerY = dotsY + rowHeight;
      const playerRow = this.createRowItem(
        {
          rank: this.playerRank ?? 999,
          name: GameState.getUsername().toUpperCase(),
          score: this.playerBest,
          isPlayer: true,
        },
        width - padding * 2
      );
      playerRow.setPosition(0, playerY);
      this.cardContainer.add(playerRow);
    }
  }

  // --- Создание одной строки списка ---
  private createRowItem(entry: LeaderboardRow, rowWidth: number): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);

    // Подсветка строки игрока
    if (entry.isPlayer) {
      const highlightBg = this.add.graphics();
      drawNeonPlate(highlightBg, rowWidth, 32, COLOR_PINK, 6, 0.25);
      container.add(highlightBg);
    }

    // Цвет ранга
    let rankColor = "#00f0ff";
    if (entry.rank === 1) rankColor = `#${COLOR_GOLD.toString(16).padStart(6, "0")}`;
    else if (entry.rank === 2) rankColor = `#${COLOR_SILVER.toString(16).padStart(6, "0")}`;
    else if (entry.rank === 3) rankColor = `#${COLOR_BRONZE.toString(16).padStart(6, "0")}`;

    // Ранг
    const rankStr = entry.rank < 10 ? `0${entry.rank}` : `${entry.rank}`;
    const rankTxt = this.add
      .text(-rowWidth / 2 + 12, 0, rankStr, {
        fontSize: "15px",
        color: rankColor,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    // Имя (с автоматическим truncating)
    const displayName = entry.isPlayer ? `${entry.name} (YOU)` : entry.name;
    const nameTxt = this.add
      .text(-rowWidth / 2 + 65, 0, displayName, {
        fontSize: "14px",
        color: entry.isPlayer ? "#ff007f" : "#ffffff",
        fontStyle: entry.isPlayer ? "bold" : "normal",
      })
      .setOrigin(0, 0.5);

    // Ограничение длины текста
    if (nameTxt.width > rowWidth * 0.45) {
      nameTxt.setText(displayName.slice(0, 10) + "...");
    }

    // Очки
    const scoreTxt = this.add
      .text(rowWidth / 2 - 12, 0, `${entry.score.toLocaleString()}`, {
        fontSize: "14px",
        color: entry.isPlayer ? "#ffffff" : "#a0e0ff",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);

    container.add([rankTxt, nameTxt, scoreTxt]);
    return container;
  }

  // --- Кнопка Назад ---
  private createBackButton(): void {
    const bg = this.add.graphics();
    drawNeonPlate(bg, 140, 40, COLOR_CYAN, 8);

    const txt = this.add
      .text(0, 0, "BACK", {
        fontSize: "14px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.backBtn = this.add.container(0, 0, [bg, txt]);
    this.backBtn.setSize(140, 40);
    this.backBtn.setInteractive({ useHandCursor: true });

    this.backBtn.on("pointerover", () =>
      this.tweens.add({ targets: this.backBtn, scale: 1.05, duration: 80 })
    );
    this.backBtn.on("pointerout", () =>
      this.tweens.add({ targets: this.backBtn, scale: 1, duration: 80 })
    );
    this.backBtn.on("pointerup", () => this.closeScene());
  }

  private closeScene(): void {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("MainMenu");
    });
  }

  // --- Layout ---
  private layout(w: number, h: number): void {
    drawGrid(this.gridGraphics, w, h);

    const cardWidth = Math.min(400, w * 0.9);

    this.rebuildBoard(cardWidth);

    this.titleText.setPosition(w / 2, h * 0.07);
    this.statusText.setPosition(w / 2, h * 0.11);
    
    // Центрируем таблицу по вертикали
    this.cardContainer.setPosition(w / 2, h * 0.51);
    this.backBtn.setPosition(w / 2, h * 0.91);
  }
}