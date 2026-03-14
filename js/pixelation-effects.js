/**
 * pixelation-effects.js — эффекты пикселизации и pixel art
 */

'use strict';

/**
 * Простая пикселизация (мозаика)
 * @param {ImageData} imageData
 * @param {number} blockSize - размер блока (1-50)
 * @returns {ImageData}
 */
function applyPixelation(imageData, blockSize) {
    if (blockSize <= 1) return imageData;

    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    for (let y = 0; y < height; y += blockSize) {
        for (let x = 0; x < width; x += blockSize) {
            let r = 0, g = 0, b = 0, a = 0, count = 0;

            for (let by = 0; by < blockSize && y + by < height; by++) {
                for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
                    const idx = ((y + by) * width + (x + bx)) * 4;
                    r += data[idx];
                    g += data[idx + 1];
                    b += data[idx + 2];
                    a += data[idx + 3];
                    count++;
                }
            }

            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);
            a = Math.round(a / count);

            for (let by = 0; by < blockSize && y + by < height; by++) {
                for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
                    const idx = ((y + by) * width + (x + bx)) * 4;
                    data[idx]     = r;
                    data[idx + 1] = g;
                    data[idx + 2] = b;
                    data[idx + 3] = a;
                }
            }
        }
    }

    return imageData;
}

/**
 * Pixel Art с улучшенным дизерингом
 * @param {ImageData} imageData
 * @param {number} blockSize - размер пикселя (1-50)
 * @param {number} colors - количество цветов (2-256)
 * @param {string} ditherMode - 'floyd-steinberg' | 'atkinson'
 * @returns {ImageData}
 */
function applyPixelArt(imageData, blockSize, colors, ditherMode) {
    colors = (colors === undefined) ? 16 : colors;
    ditherMode = ditherMode || 'floyd-steinberg';

    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    // Гамма-коррекция: линеаризация RGB перед обработкой
    const gamma = 2.2;
    const invGamma = 1 / gamma;

    // Создаём lookup-таблицы для гамма-коррекции (оптимизация)
    // gammaTable: sRGB → linear (применяем степень gamma=2.2 для линеаризации)
    const gammaTable = new Uint8Array(256);
    // invGammaTable: linear → sRGB (применяем степень invGamma=1/2.2 для обратного кодирования)
    const invGammaTable = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        gammaTable[i] = Math.round(Math.pow(i / 255, gamma) * 255);
        invGammaTable[i] = Math.round(Math.pow(i / 255, invGamma) * 255);
    }

    // Линеаризуем sRGB → linear (применяем gamma=2.2)
    for (let i = 0; i < data.length; i += 4) {
        data[i]     = gammaTable[data[i]];
        data[i + 1] = gammaTable[data[i + 1]];
        data[i + 2] = gammaTable[data[i + 2]];
    }

    // Квантизация цветов с перцептивным округлением
    const levels = Math.max(2, Math.min(256, colors));
    const step = 255 / (levels - 1);

    // СНАЧАЛА дизеринг, ПОТОМ пикселизация
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            const oldR = data[idx];
            const oldG = data[idx + 1];
            const oldB = data[idx + 2];

            // Перцептивная квантизация (одно округление)
            const newR = Math.round(oldR / step) * step;
            const newG = Math.round(oldG / step) * step;
            const newB = Math.round(oldB / step) * step;

            data[idx]     = Math.min(255, Math.max(0, newR));
            data[idx + 1] = Math.min(255, Math.max(0, newG));
            data[idx + 2] = Math.min(255, Math.max(0, newB));

            const errorR = oldR - newR;
            const errorG = oldG - newG;
            const errorB = oldB - newB;

            // Выбор алгоритма дизеринга
            if (ditherMode === 'atkinson') {
                // Atkinson dithering (1/8 на 6 соседей, более мягкий)
                distributeError(data, width, height, x + 1, y,     errorR, errorG, errorB, 1 / 8);
                distributeError(data, width, height, x + 2, y,     errorR, errorG, errorB, 1 / 8);
                distributeError(data, width, height, x - 1, y + 1, errorR, errorG, errorB, 1 / 8);
                distributeError(data, width, height, x,     y + 1, errorR, errorG, errorB, 1 / 8);
                distributeError(data, width, height, x + 1, y + 1, errorR, errorG, errorB, 1 / 8);
                distributeError(data, width, height, x,     y + 2, errorR, errorG, errorB, 1 / 8);
            } else {
                // Floyd-Steinberg dithering (классический)
                distributeError(data, width, height, x + 1, y,     errorR, errorG, errorB, 7 / 16);
                distributeError(data, width, height, x - 1, y + 1, errorR, errorG, errorB, 3 / 16);
                distributeError(data, width, height, x,     y + 1, errorR, errorG, errorB, 5 / 16);
                distributeError(data, width, height, x + 1, y + 1, errorR, errorG, errorB, 1 / 16);
            }
        }
    }

    // Обратное кодирование: linear → sRGB (применяем invGamma=1/2.2)
    for (let i = 0; i < data.length; i += 4) {
        const r = Math.min(255, Math.max(0, data[i]));
        const g = Math.min(255, Math.max(0, data[i + 1]));
        const b = Math.min(255, Math.max(0, data[i + 2]));

        data[i]     = invGammaTable[r];
        data[i + 1] = invGammaTable[g];
        data[i + 2] = invGammaTable[b];
    }

    // ПОСЛЕ дизеринга применяем пикселизацию
    if (blockSize > 1) {
        applyPixelation(imageData, blockSize);
    }

    return imageData;
}

/**
 * Распределить ошибку дизеринга на соседний пиксель
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @param {number} x
 * @param {number} y
 * @param {number} errR
 * @param {number} errG
 * @param {number} errB
 * @param {number} factor
 */
function distributeError(data, width, height, x, y, errR, errG, errB, factor) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;

    const idx = (y * width + x) * 4;
    data[idx]     = data[idx]     + errR * factor;
    data[idx + 1] = data[idx + 1] + errG * factor;
    data[idx + 2] = data[idx + 2] + errB * factor;
    // Clamp будет выполнен на следующей итерации квантизации
}

/**
 * Ретро-палитра (8-bit, 16-bit стиль)
 * @param {ImageData} imageData
 * @param {string} palette - 'gameboy' | 'nes' | 'c64'
 * @returns {ImageData}
 */
function applyRetroPalette(imageData, palette) {
    palette = palette || 'gameboy';

    var palettes = {
        gameboy: [
            [15, 56, 15],
            [48, 98, 48],
            [139, 172, 15],
            [155, 188, 15]
        ],
        nes: [
            [0, 0, 0],
            [255, 255, 255],
            [252, 116, 96],
            [36, 24, 140],
            [0, 120, 248],
            [0, 176, 68],
            [252, 252, 0],
            [216, 40, 0]
        ],
        c64: [
            [0, 0, 0],
            [255, 255, 255],
            [136, 0, 0],
            [170, 255, 238],
            [204, 68, 204],
            [0, 204, 85],
            [0, 0, 170],
            [238, 238, 119]
        ]
    };

    var colors = palettes[palette] || palettes.gameboy;
    var data = imageData.data;

    for (var i = 0; i < data.length; i += 4) {
        var r = data[i];
        var g = data[i + 1];
        var b = data[i + 2];

        var minDist = Infinity;
        var closest = colors[0];

        for (var c = 0; c < colors.length; c++) {
            var color = colors[c];
            var dr = r - color[0];
            var dg = g - color[1];
            var db = b - color[2];
            var dist = dr * dr + dg * dg + db * db;
            if (dist < minDist) {
                minDist = dist;
                closest = color;
            }
        }

        data[i]     = closest[0];
        data[i + 1] = closest[1];
        data[i + 2] = closest[2];
    }

    return imageData;
}

/**
 * Clamp helper для пиксельных значений (0-255)
 * @param {number} v
 * @returns {number}
 */
function pixelClamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
}
