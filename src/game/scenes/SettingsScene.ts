// ============================================================
// SettingsScene — системные настройки в киберпанк-стиле.
// Тумблеры Sound FX / Music и смена ника игрока.
// Всё состояние хранится в localStorage через GameState.
// ============================================================

import * as Phaser from "phaser";
import {
  COLOR_BG,
  COLOR_CYAN,
  COLOR_GOLD,
  GameState,
  drawGrid,
  drawNeonPlate,
} from "../ui/NeonUI";

export class SettingsScene extends Phaser.Scene {
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;

  private soundToggle!: Phaser.GameObjects.Container;
  private musicToggle!: Phaser.GameObjects.Container;
  private nameCard!: Phaser.GameObjects.Container;
  private nameValueText!: Phaser.GameObjects.Text;
  private backBtn!: Phaser.GameObjects.Container;

  constructor() {
    super("Settings");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR_BG);
    this.cameras.main.fadeIn(300, 0, 0, 0);

    this.gridGraphics = this.add.graphics().setDepth(0);

    this.titleText = this.add
      .text(0, 0, "SYSTEM SETTINGS", {
        fontSize: "28px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.soundToggle = this.createToggle(
      "SOUND FX",
      GameState.getSoundEnabled(),
      (val) => GameState.setSoundEnabled(val),
    );
    this.musicToggle = this.createToggle(
      "MUSIC",
      GameState.getMusicEnabled(),
      (val) => GameState.setMusicEnabled(val),
    );

    this.createUsernameCard();
    this.createBackButton();

    this.layout(this.scale.width, this.scale.height);

    const onResize = (size: Phaser.Structs.Size) =>
      this.layout(size.width, size.height);
    this.scale.on("resize", onResize);
    this.events.once("shutdown", () => {
      this.scale.off("resize", onResize);
    });
  }

  // --- Тумблер-переключатель ---
  private createToggle(
    label: string,
    initialState: boolean,
    onToggle: (val: boolean) => void,
  ): Phaser.GameObjects.Container {
    const cardW = Math.min(380, this.scale.width * 0.9);
    const cardH = 54;
    let state = initialState;

    const bg = this.add.graphics();
    drawNeonPlate(bg, cardW, cardH, COLOR_CYAN, 10, 0.1);

    const txt = this.add
      .text(-cardW / 2 + 24, 0, label, {
        fontSize: "16px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    const switchW = 60;
    const switchH = 26;
    const switchX = cardW / 2 - 80;

    const switchBg = this.add.graphics();
    const knob = this.add.graphics();

    const redrawSwitch = (active: boolean): void => {
      switchBg.clear();
      knob.clear();
      const color = active ? COLOR_CYAN : 0x555566;

      switchBg.fillStyle(color, 0.3);
      switchBg.fillRoundedRect(switchX, -switchH / 2, switchW, switchH, 13);
      switchBg.lineStyle(1.5, color, 0.9);
      switchBg.strokeRoundedRect(switchX, -switchH / 2, switchW, switchH, 13);

      const knobX = active ? switchX + switchW - 13 : switchX + 13;
      knob.fillStyle(active ? COLOR_CYAN : 0x888899, 1);
      knob.fillCircle(knobX, 0, 9);
    };

    redrawSwitch(state);

    const container = this.add.container(0, 0, [bg, txt, switchBg, knob]);
    container.setSize(cardW, cardH);
    container.setInteractive({ useHandCursor: true });

    container.on("pointerup", () => {
      state = !state;
      redrawSwitch(state);
      onToggle(state);
    });

    return container;
  }

  // --- Карточка имени игрока ---
  private createUsernameCard(): void {
    const cardW = Math.min(380, this.scale.width * 0.9);
    const cardH = 64;

    const bg = this.add.graphics();
    drawNeonPlate(bg, cardW, cardH, COLOR_GOLD, 10, 0.1);

    const labelTxt = this.add
      .text(-cardW / 2 + 24, -12, "PLAYER NAME", {
        fontSize: "12px",
        color: "#ffd700",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    this.nameValueText = this.add
      .text(-cardW / 2 + 24, 12, GameState.getUsername(), {
        fontSize: "17px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    const editBtnBg = this.add.graphics();
    drawNeonPlate(editBtnBg, 70, 32, COLOR_GOLD, 6, 0.2);
    const editTxt = this.add
      .text(cardW / 2 - 45, 0, "EDIT", {
        fontSize: "13px",
        color: "#ffd700",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const editBtn = this.add.container(0, 0, [editBtnBg, editTxt]);
    editBtn.setSize(70, 32);
    editBtn.setInteractive({ useHandCursor: true });
    editBtn.on("pointerup", () => this.promptNameChange());

    this.nameCard = this.add.container(0, 0, [
      bg,
      labelTxt,
      this.nameValueText,
      editBtn,
    ]);
  }

  private promptNameChange(): void {
    const newName = window.prompt("Enter Cyber Alias:", GameState.getUsername());
    if (newName && newName.trim().length > 0) {
      const sanitized = newName.trim().substring(0, 14).toUpperCase();
      GameState.setUsername(sanitized);
      this.nameValueText.setText(sanitized);
    }
  }

  // --- Кнопка сохранения ---
  private createBackButton(): void {
    const bg = this.add.graphics();
    drawNeonPlate(bg, 150, 42, COLOR_CYAN, 10);

    const txt = this.add
      .text(0, 0, "SAVE & BACK", {
        fontSize: "14px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.backBtn = this.add.container(0, 0, [bg, txt]);
    this.backBtn.setSize(150, 42);
    this.backBtn.setInteractive({ useHandCursor: true });

    this.backBtn.on("pointerover", () =>
      this.tweens.add({ targets: this.backBtn, scale: 1.05, duration: 100 }),
    );
    this.backBtn.on("pointerout", () =>
      this.tweens.add({ targets: this.backBtn, scale: 1, duration: 100 }),
    );
    this.backBtn.on("pointerup", () => {
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("MainMenu");
      });
    });
  }

  // --- Адаптивный layout ---
  private layout(w: number, h: number): void {
    drawGrid(this.gridGraphics, w, h);

    this.titleText.setPosition(w / 2, h * 0.15);
    this.soundToggle.setPosition(w / 2, h * 0.34);
    this.musicToggle.setPosition(w / 2, h * 0.46);
    this.nameCard.setPosition(w / 2, h * 0.6);
    this.backBtn.setPosition(w / 2, h * 0.82);
  }
}
