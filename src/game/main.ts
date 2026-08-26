import { Game as MainGame } from './scenes/Game';
import { MainMenuScene } from './scenes/MainMenuScene';
import { LeaderboardScene } from './scenes/LeaderboardScene';
import { SettingsScene } from './scenes/SettingsScene';
import { StationScene } from './scenes/StationScene';
import { GarageScene } from './scenes/GarageScene';
import { AUTO, Game, Scale, Types } from 'phaser';
import { gameServices } from '../services/GameServicesManager';

const config: Types.Core.GameConfig = {
    type: AUTO,
    parent: 'game-container',
    backgroundColor: '#0f0f12',
    // Отключаем сглаживание текстур — убирает «мыло» на мобильных экранах
    render: {
    pixelArt: false,       // 👈 Выключаем! Позволяет вектору быть гладким
    antialias: true,       // 👈 Включаем сглаживание для диагональных линий
    roundPixels: false,    // 👈 Без привязки к целым пикселям: дробная скорость
                           //    блоков не «ступенчит» на высоких DPI-экранах
  },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 },
            debug: false,
            // Плавное движение без рывков на экранах 90/120Гц:
            // тела обновляются каждый кадр, а не квантами по 60Гц
            fixedStep: false
        }
    },
    scale: {
        // RESIZE подгоняет внутреннее разрешение Canvas под 100% окна
        mode: Scale.RESIZE,
        autoCenter: Scale.CENTER_BOTH
    },
    scene: [MainMenuScene, MainGame, LeaderboardScene, SettingsScene, StationScene, GarageScene]
};

// Облачный сервис (Firebase через адаптер) — инициализация при старте.
// Не блокирует игру: все методы менеджера безопасно глотают ошибки сети.
void gameServices.init();

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
}

export default StartGame;