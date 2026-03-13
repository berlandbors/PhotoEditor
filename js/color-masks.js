/**
 * color-masks.js — работа с цветовыми масками для селективной коррекции
 */

'use strict';

// Предустановленные цветовые диапазоны
const COLOR_RANGES = {
    red: { hueMin: 345, hueMax: 15, name: 'Красные' },
    orange: { hueMin: 15, hueMax: 45, name: 'Оранжевые' },
    yellow: { hueMin: 45, hueMax: 75, name: 'Жёлтые' },
    green: { hueMin: 75, hueMax: 165, name: 'Зелёные' },
    cyan: { hueMin: 165, hueMax: 195, name: 'Голубые' },
    blue: { hueMin: 195, hueMax: 255, name: 'Синие' },
    magenta: { hueMin: 255, hueMax: 315, name: 'Пурпурные' },
    pink: { hueMin: 315, hueMax: 345, name: 'Розовые' }
};

// Допуск по умолчанию для цветового диапазона
const DEFAULT_TOLERANCE = 20;

// Коэффициент плавного спада яркости на границах диапазона (30% снижение)
const EDGE_FALLOFF_FACTOR = 0.3;

/**
 * Конвертировать RGB в HSL
 * @param {number} r (0-255)
 * @param {number} g (0-255)
 * @param {number} b (0-255)
 * @returns {Array} [h (0-360), s (0-100), l (0-100)]
 */
function rgbToHSL(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return [h * 360, s * 100, l * 100];
}

/**
 * Проверить, попадает ли цвет в заданный диапазон
 * @param {number} hue (0-360)
 * @param {string} colorRange - ключ из COLOR_RANGES
 * @param {number} tolerance - допуск (0-100)
 * @returns {number} степень попадания (0-1)
 */
function isInColorRange(hue, colorRange, tolerance) {
    if (tolerance === undefined) tolerance = DEFAULT_TOLERANCE;
    const range = COLOR_RANGES[colorRange];
    if (!range) return 0;

    let hueMin = range.hueMin;
    let hueMax = range.hueMax;
    const toleranceValue = tolerance;

    hueMin = (hueMin - toleranceValue + 360) % 360;
    hueMax = (hueMax + toleranceValue) % 360;

    // Обработка перехода через 0° (красный диапазон)
    if (hueMin > hueMax) {
        return (hue >= hueMin || hue <= hueMax) ? 1 : 0;
    }

    // Плавный переход на границах
    if (hue >= hueMin && hue <= hueMax) {
        const center = (hueMin + hueMax) / 2;
        const distance = Math.abs(hue - center);
        const maxDistance = (hueMax - hueMin) / 2;
        return 1 - (distance / maxDistance) * EDGE_FALLOFF_FACTOR; // Плавный спад к краям
    }

    return 0;
}

/**
 * Применить цветовую маску к изображению
 * @param {ImageData} imageData
 * @param {string} colorRange - ключ из COLOR_RANGES
 * @param {Object} adjustments - корректировки { brightness, saturation, hue }
 * @param {number} tolerance - допуск диапазона (0-100)
 * @returns {ImageData}
 */
function applyColorMask(imageData, colorRange, adjustments, tolerance) {
    if (tolerance === undefined) tolerance = DEFAULT_TOLERANCE;
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Конвертируем в HSL
        const hsl = rgbToHSL(r, g, b);
        const h = hsl[0];
        const s = hsl[1];
        const l = hsl[2];

        // Проверяем попадание в диапазон
        const mask = isInColorRange(h, colorRange, tolerance);

        if (mask > 0) {
            // Применяем корректировки с учётом силы маски
            let newH = h;
            let newS = s;
            let newL = l;

            // Изменение оттенка
            if (adjustments.hue !== undefined) {
                newH = (h + adjustments.hue * mask + 360) % 360;
            }

            // Изменение насыщенности
            if (adjustments.saturation !== undefined) {
                newS = Math.max(0, Math.min(100, s + adjustments.saturation * mask));
            }

            // Изменение яркости
            if (adjustments.brightness !== undefined) {
                newL = Math.max(0, Math.min(100, l + adjustments.brightness * mask));
            }

            // Конвертируем обратно в RGB
            const rgb = hslToRGB(newH, newS, newL);

            data[i] = rgb[0];
            data[i + 1] = rgb[1];
            data[i + 2] = rgb[2];
        }
    }

    return imageData;
}

/**
 * Конвертировать HSL обратно в RGB
 * @param {number} h (0-360)
 * @param {number} s (0-100)
 * @param {number} l (0-100)
 * @returns {Array} [r, g, b] (0-255)
 */
function hslToRGB(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;

    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = function(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;

        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255)
    ];
}
