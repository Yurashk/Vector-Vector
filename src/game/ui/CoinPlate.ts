// ============================================================
// CoinPlate — единый UI-компонент плашки валюты (CR / BP).
// Используется в MainMenuScene, StationScene и любых других
// сценах для отображения баланса монет или чертежей.
// ============================================================

import * as Phaser from "phaser";
import { COLOR_GOLD, COLOR_PINK } from "./NeonUI";
import { drawCurrencyIcon } from "./NeonUI";

/** Тип валюты: CR (кредиты/монеты) или BP (черте́жи) */
export type CurrencyType = "CR" | "BP";

/** Конфигурация стиля плашки для каждого типа валюты */
interface PlateStyle {
  plateW: number;
  plateH: number;
  radius: number;
  neonColor: number;
  textColor: string;
  fillBg: number;
  fillBgAlpha: number;
  iconSize: number;
  fontSize: string;
  suffix: string;
}

const STYLES: Record<CurrencyType, PlateStyle> = {
  CR: {
    plateW: 130,
    plateH: 38,
    radius: 10,
    neonColor: COLOR_GOLD,
    textColor: "#ffb700",
    fillBg: 0x221a00,
    fillBgAlpha: 0.65,
    iconSize: 9,
    fontSize: "15px",
    suffix: " CR",
  },
  BP: {
    plateW: 110,
    plateH: 32,
    radius: 9,
    neonColor: COLOR_PINK,
    textColor: "#ff007f",
    fillBg: 0x1a0010,
    fillBgAlpha: 0.65,
    iconSize: 8,
    fontSize: "13px",
    suffix: " BP",
  },
};

export class CoinPlate extends Phaser.GameObjects.Container {
  private bgGfx: Phaser.GameObjects.Graphics;
  private iconGfx: Phaser.GameObjects.Graphics;
  private amountText: Phaser.GameObjects.Text;
  private readonly plateStyle: PlateStyle;
  private readonly currencyType: CurrencyType;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    amount: number,
    currencyType: CurrencyType = "CR",
  ) {
    super(scene, x, y);

    this.currencyType = currencyType;
    this.plateStyle = STYLES[currencyType];

    // 1. Подложка: тёмная заливка + неоновая рамка
    this.bgGfx = scene.make.graphics({});
    this.drawPlate();

    // 2. Векторная иконка валюты (слева)
    this.iconGfx = scene.make.graphics({});
    this.iconGfx.setPosition(-this.plateStyle.plateW / 2 + 22, 0);
    drawCurrencyIcon(this.iconGfx, currencyType, this.plateStyle.iconSize);

    // 3. Текст суммы (справа от иконки)
    this.amountText = scene.make
      .text({
        x: 8,
        y: 0,
        text: this.formatAmount(amount),
        style: {
          fontSize: this.plateStyle.fontSize,
          color: this.plateStyle.textColor,
          fontStyle: "bold",
        },
      })
      .setOrigin(0.5);

    this.add([this.bgGfx, this.iconGfx, this.amountText]);

    scene.add.existing(this);
  }

  /** Обновить отображаемую сумму */
  setAmount(val: number): void {
    this.amountText.setText(this.formatAmount(val));
  }

  /** Текущая отображаемая сумма (число, без суффикса) */
  getAmount(): number {
    const raw = this.amountText.text.replace(this.plateStyle.suffix, "").trim();
    return parseInt(raw.replace(/,/g, ""), 10) || 0;
  }

  /** Тип валюты этой плашки */
  getCurrencyType(): CurrencyType {
    return this.currencyType;
  }

  /** Перерисовка подложки (тёмный фон + неоновая рамка) */
  private drawPlate(): void {
    const { plateW, plateH, radius, neonColor, fillBg, fillBgAlpha } =
      this.plateStyle;
    const g = this.bgGfx;
    g.clear();

    // Тёмная заливка
    g.fillStyle(fillBg, fillBgAlpha);
    g.fillRoundedRect(-plateW / 2, -plateH / 2, plateW, plateH, radius);

    // Внешнее гало
    g.lineStyle(6, neonColor, 0.08);
    g.strokeRoundedRect(-plateW / 2, -plateH / 2, plateW, plateH, radius);
    // Средний слой
    g.lineStyle(3, neonColor, 0.2);
    g.strokeRoundedRect(-plateW / 2, -plateH / 2, plateW, plateH, radius);
    // Яркий контур
    g.lineStyle(1.6, neonColor, 0.92);
    g.strokeRoundedRect(-plateW / 2, -plateH / 2, plateW, plateH, radius);
  }

  /** Форматирование числа: 1250 → "1,250 CR" */
  private formatAmount(val: number): string {
    return val.toLocaleString("en-US") + this.plateStyle.suffix;
  }
}
