/**
 * channel-mixer.js — работа с цветовыми каналами (Channel Mixer)
 */

'use strict';

/**
 * Применить Channel Mixer к ImageData
 * @param {ImageData} imageData
 * @param {Object} mixer - настройки миксера
 * @returns {ImageData}
 */
function applyChannelMixer(imageData, mixer) {
    const data = imageData.data;

    // Значения по умолчанию (100% своего канала, 0% остальных)
    const redMix = {
        red: mixer.redChannel?.red ?? 100,
        green: mixer.redChannel?.green ?? 0,
        blue: mixer.redChannel?.blue ?? 0
    };

    const greenMix = {
        red: mixer.greenChannel?.red ?? 0,
        green: mixer.greenChannel?.green ?? 100,
        blue: mixer.greenChannel?.blue ?? 0
    };

    const blueMix = {
        red: mixer.blueChannel?.red ?? 0,
        green: mixer.blueChannel?.green ?? 0,
        blue: mixer.blueChannel?.blue ?? 100
    };

    // Применяем миксер к каждому пикселю
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Вычисляем новые значения каналов
        const newR = (r * redMix.red / 100) + (g * redMix.green / 100) + (b * redMix.blue / 100);
        const newG = (r * greenMix.red / 100) + (g * greenMix.green / 100) + (b * greenMix.blue / 100);
        const newB = (r * blueMix.red / 100) + (g * blueMix.green / 100) + (b * blueMix.blue / 100);

        // Ограничиваем значения в диапазоне 0-255
        data[i] = Math.max(0, Math.min(255, newR));
        data[i + 1] = Math.max(0, Math.min(255, newG));
        data[i + 2] = Math.max(0, Math.min(255, newB));
    }

    return imageData;
}

/**
 * Применить Levels (уровни белого и чёрного)
 * @param {ImageData} imageData
 * @param {Object} levels - { blackPoint, whitePoint, gamma }
 * @returns {ImageData}
 */
function applyLevels(imageData, levels) {
    const data = imageData.data;

    const blackPoint = levels.blackPoint ?? 0;
    const whitePoint = levels.whitePoint ?? 255;
    const gamma = levels.gamma ?? 1.0;

    // Создаём lookup table для быстрого применения
    const lut = new Array(256);
    const invGamma = 1 / gamma;
    for (let i = 0; i < 256; i++) {
        // Нормализуем значение
        let normalized = (i - blackPoint) / (whitePoint - blackPoint);
        normalized = Math.max(0, Math.min(1, normalized));

        // Применяем гамму
        normalized = Math.pow(normalized, invGamma);

        // Конвертируем обратно в 0-255
        lut[i] = Math.round(normalized * 255);
    }

    // Применяем к каждому пикселю
    for (let i = 0; i < data.length; i += 4) {
        data[i] = lut[data[i]];         // Red
        data[i + 1] = lut[data[i + 1]]; // Green
        data[i + 2] = lut[data[i + 2]]; // Blue
    }

    return imageData;
}

/**
 * Пресеты для Channel Mixer
 */
const CHANNEL_MIXER_PRESETS = {
    default: {
        name: 'По умолчанию',
        redChannel: { red: 100, green: 0, blue: 0 },
        greenChannel: { red: 0, green: 100, blue: 0 },
        blueChannel: { red: 0, green: 0, blue: 100 }
    },
    'teal-orange': {
        name: 'Teal & Orange (Кино)',
        redChannel: { red: 110, green: 0, blue: -10 },
        greenChannel: { red: 0, green: 100, blue: 0 },
        blueChannel: { red: 20, green: 0, blue: 105 }
    },
    'warm-look': {
        name: 'Тёплый Look',
        redChannel: { red: 120, green: 10, blue: 0 },
        greenChannel: { red: 0, green: 100, blue: 0 },
        blueChannel: { red: 0, green: -10, blue: 90 }
    },
    'cool-look': {
        name: 'Холодный Look',
        redChannel: { red: 90, green: 0, blue: 0 },
        greenChannel: { red: 0, green: 100, blue: 10 },
        blueChannel: { red: 0, green: 0, blue: 120 }
    },
    'bw-red-filter': {
        name: 'Ч/Б (Красный фильтр)',
        redChannel: { red: 60, green: 30, blue: 10 },
        greenChannel: { red: 60, green: 30, blue: 10 },
        blueChannel: { red: 60, green: 30, blue: 10 }
    },
    'bw-green-filter': {
        name: 'Ч/Б (Зелёный фильтр)',
        redChannel: { red: 20, green: 60, blue: 20 },
        greenChannel: { red: 20, green: 60, blue: 20 },
        blueChannel: { red: 20, green: 60, blue: 20 }
    },
    'bw-blue-filter': {
        name: 'Ч/Б (Синий фильтр)',
        redChannel: { red: 10, green: 30, blue: 60 },
        greenChannel: { red: 10, green: 30, blue: 60 },
        blueChannel: { red: 10, green: 30, blue: 60 }
    },
    'swap-rb': {
        name: 'Инверсия R↔B',
        redChannel: { red: 0, green: 0, blue: 100 },
        greenChannel: { red: 0, green: 100, blue: 0 },
        blueChannel: { red: 100, green: 0, blue: 0 }
    }
};
