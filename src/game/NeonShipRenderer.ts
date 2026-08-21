import * as Phaser from "phaser";
import type { GeoPart, SpaceshipSkin } from "./spaceship-skins";

function partPoints(
  part: GeoPart,
  cx: number,
  cy: number,
  w: number,
  h: number,
  scale: number
): Phaser.Math.Vector2[] {
  const coords: number[] = [];

  if (part.type === "polygon" && part.points) {
    // Кастомный полигон с масштабированием
    for (let i = 0; i < part.points.length; i += 2) {
      coords.push(cx + part.points[i] * scale, cy + part.points[i + 1] * scale);
    }
  } else {
    switch (part.type) {
      case "rectangle":
        coords.push(
          cx - w / 2, cy - h / 2,
          cx + w / 2, cy - h / 2,
          cx + w / 2, cy + h / 2,
          cx - w / 2, cy + h / 2
        );
        break;

      case "triangle":
        coords.push(
          cx, cy - h / 2,
          cx - w / 2, cy + h / 2,
          cx + w / 2, cy + h / 2
        );
        break;

      case "right-triangle":
        coords.push(
          cx - w / 2, cy + h / 2,
          cx + w / 2, cy + h / 2,
          cx - w / 2, cy - h / 2
        );
        break;

      case "trapezoid":
        coords.push(
          cx - w / 2, cy - h / 2,
          cx + w / 2, cy - h / 2,
          cx + w * 0.3, cy + h / 2,
          cx - w * 0.3, cy + h / 2
        );
        break;

      case "rhombus":
        coords.push(
          cx, cy - h / 2,
          cx + w / 2, cy,
          cx, cy + h / 2,
          cx - w / 2, cy
        );
        break;

      case "ellipse": {
        const segments = 16;
        const rx = w / 2;
        const ry = h / 2;
        for (let i = 0; i < segments; i++) {
          const theta = (i / segments) * Math.PI * 2;
          coords.push(cx + rx * Math.cos(theta), cy + ry * Math.sin(theta));
        }
        break;
      }
    }
  }

  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < coords.length; i += 2) {
    points.push(new Phaser.Math.Vector2(coords[i], coords[i + 1]));
  }
  return points;
}

function rotatePoints(
  points: Phaser.Math.Vector2[],
  angleDeg: number,
  cx: number,
  cy: number
): Phaser.Math.Vector2[] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return new Phaser.Math.Vector2(
      cx + dx * cos - dy * sin,
      cy + dx * sin + dy * cos
    );
  });
}

function computeScale(skin: SpaceshipSkin, size: number): number {
  let maxRadius = 1;
  for (const part of skin.parts) {
    if (part.type === "polygon" && part.points) {
      for (let i = 0; i < part.points.length; i += 2) {
        const dist = Math.hypot(part.points[i], part.points[i + 1]);
        maxRadius = Math.max(maxRadius, dist);
      }
    } else {
      const partRadius = Math.hypot(part.width / 2, part.height / 2);
      const distance = Math.hypot(part.x, part.y);
      maxRadius = Math.max(maxRadius, distance + partRadius);
    }
  }
  return size / 2 / maxRadius;
}

function drawPart(
  g: Phaser.GameObjects.Graphics,
  part: GeoPart,
  scale: number,
  skin: SpaceshipSkin
) {
  const cx = part.x * scale;
  const cy = part.y * scale;
  const w = part.width * scale;
  const h = part.height * scale;
  const angle = part.rotation ?? 0;

  let points = partPoints(part, cx, cy, w, h, scale);
  if (angle !== 0) {
    points = rotatePoints(points, angle, cx, cy);
  }

  const fillColor = part.accent ? skin.accentColor : skin.primaryColor;
  const neonColor = part.accent ? skin.accentColor : skin.glowColor;

  // 1. Едва заметная заливка
  g.fillStyle(fillColor, 0.08);
  g.fillPoints(points, true);

  // 2. Для акцентных деталей (или внешних) делаем линии ярче, для внутренних — тоньше и мягче
  const lineWidth = part.accent ? 1 : 0.75;
  const lineAlpha = part.accent ? 0.8 : 0.45;

  g.lineStyle(lineWidth, neonColor, lineAlpha);
  g.strokePoints(points, true, true);

  // 3. Белое тонкое ядро рисуем только на акцентных/главных линиях, чтобы не забивать сетку
  if (part.accent) {
    g.lineStyle(0.5, 0xffffff, 0.9);
    g.strokePoints(points, true, true);
  }
}

export class NeonShipRenderer {
  static create(
    scene: Phaser.Scene,
    skin: SpaceshipSkin,
    size: number,
    sizeScale: number = 1
  ): Phaser.GameObjects.Graphics {
    const graphics = scene.add.graphics();
    NeonShipRenderer.updateSkin(graphics, skin, size, sizeScale);
    return graphics;
  }

  static updateSkin(
    g: Phaser.GameObjects.Graphics,
    skin: SpaceshipSkin,
    size: number,
    sizeScale: number = 1
  ): void {
    g.clear();
    const scale = computeScale(skin, size) * sizeScale;
    for (const part of skin.parts) {
      drawPart(g, part, scale, skin);
    }
  }
}