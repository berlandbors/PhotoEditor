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
 * Pixel Art с дизерингом (Floyd-Steinberg)
 * @param {ImageData} imageData
 * @param {number} blockSize - размер пикселя
 * @param {number} colors - количество цветов (2-256)
 * @returns {ImageData}
 */
function applyPixelArt(imageData, blockSize, colors) {
    colors = (colors === undefined) ? 16 : colors;

    applyPixelation(imageData, blockSize);

    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const levels = Math.max(2, Math.min(256, colors));
    const step = 255 / (levels - 1);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            const oldR = data[idx];
            const oldG = data[idx + 1];
            const oldB = data[idx + 2];

            const newR = Math.min(255, Math.round(Math.round(oldR / step) * step));
            const newG = Math.min(255, Math.round(Math.round(oldG / step) * step));
            const newB = Math.min(255, Math.round(Math.round(oldB / step) * step));

            data[idx]     = newR;
            data[idx + 1] = newG;
            data[idx + 2] = newB;

            const errorR = oldR - newR;
            const errorG = oldG - newG;
            const errorB = oldB - newB;

            distributeError(data, width, height, x + 1, y,     errorR, errorG, errorB, 7 / 16);
            distributeError(data, width, height, x - 1, y + 1, errorR, errorG, errorB, 3 / 16);
            distributeError(data, width, height, x,     y + 1, errorR, errorG, errorB, 5 / 16);
            distributeError(data, width, height, x + 1, y + 1, errorR, errorG, errorB, 1 / 16);
        }
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
    data[idx]     = pixelClamp(data[idx]     + errR * factor);
    data[idx + 1] = pixelClamp(data[idx + 1] + errG * factor);
    data[idx + 2] = pixelClamp(data[idx + 2] + errB * factor);
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
