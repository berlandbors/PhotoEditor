/**
 * background-removal.js — удаление фона и цветовых каналов
 */

'use strict';

// Шаг квантования цвета при группировке пикселей краёв
const COLOR_GROUPING_FACTOR = 10;

// Минимальное значение feather, при котором применяется дополнительное гауссово размытие
const MIN_FEATHER_FOR_BLUR = 2;

// Коэффициент перевода feather в радиус гауссового размытия
const FEATHER_TO_BLUR_RATIO = 8;

/**
 * Конвертировать RGB в HSL (hue в градусах 0-360)
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {[number, number, number]} [h(0-360), s(0-100), l(0-100)]
 */
function rgbToHSL(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;

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
 * Удалить фон по цветовому диапазону (Chroma Key)
 * @param {ImageData} imageData
 * @param {Object} options - { targetColor: {r,g,b}, tolerance, feather }
 * @returns {ImageData}
 */
function removeBackgroundByColor(imageData, options) {
    const data = imageData.data;
    const targetColor = options.targetColor || { r: 0, g: 255, b: 0 };
    const tolerance = options.tolerance || 30;
    const feather = options.feather || 0;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Евклидово расстояние до целевого цвета
        const distance = Math.sqrt(
            Math.pow(r - targetColor.r, 2) +
            Math.pow(g - targetColor.g, 2) +
            Math.pow(b - targetColor.b, 2)
        );

        // Если близко к целевому цвету
        if (distance < tolerance) {
            // Плавный переход (feather) с нелинейной интерполяцией (smoothstep)
            if (feather > 0 && distance > tolerance - feather) {
                const t = (distance - (tolerance - feather)) / feather;
                // Smoothstep: 3*t^2 - 2*t^3 для более естественного перехода
                const smoothT = t * t * (3 - 2 * t);
                data[i + 3] = Math.round(255 * smoothT);
            } else {
                data[i + 3] = 0; // Полностью прозрачный
            }
        }
    }

    // Гауссово размытие альфа-канала для дополнительного смягчения краёв
    if (feather > MIN_FEATHER_FOR_BLUR) {
        const blurRadius = Math.max(1, Math.round(feather / FEATHER_TO_BLUR_RATIO));
        applyGaussianBlurToAlpha(imageData, blurRadius);
    }

    return imageData;
}

/**
 * Применить гауссово размытие к альфа-каналу (для мягких краёв)
 * @param {ImageData} imageData
 * @param {number} radius - радиус размытия (1-10)
 * @returns {ImageData}
 */
function applyGaussianBlurToAlpha(imageData, radius) {
    radius = Math.max(1, Math.round(radius));
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    // Построить ядро Гаусса
    const kernelSize = radius * 2 + 1;
    const sigma = radius / 2;
    const kernel = new Float32Array(kernelSize);
    let kernelSum = 0;
    for (let i = 0; i < kernelSize; i++) {
        const x = i - radius;
        kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
        kernelSum += kernel[i];
    }
    for (let i = 0; i < kernelSize; i++) kernel[i] /= kernelSum;

    // Временный буфер для альфа-канала
    const alphaIn = new Float32Array(width * height);
    const alphaH = new Float32Array(width * height); // после горизонтального прохода

    // Извлечь альфа в буфер
    for (let i = 0; i < width * height; i++) {
        alphaIn[i] = data[i * 4 + 3];
    }

    // Горизонтальный проход
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let val = 0;
            for (let k = 0; k < kernelSize; k++) {
                const sx = Math.min(Math.max(x + k - radius, 0), width - 1);
                val += alphaIn[y * width + sx] * kernel[k];
            }
            alphaH[y * width + x] = val;
        }
    }

    // Вертикальный проход и запись в imageData
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            let val = 0;
            for (let k = 0; k < kernelSize; k++) {
                const sy = Math.min(Math.max(y + k - radius, 0), height - 1);
                val += alphaH[sy * width + x] * kernel[k];
            }
            data[(y * width + x) * 4 + 3] = Math.round(val);
        }
    }

    return imageData;
}

/**
 * Удалить определённый цветовой канал
 * @param {ImageData} imageData
 * @param {string} channel - 'red', 'green', 'blue', 'yellow', 'orange', 'cyan', 'magenta', 'pink'
 * @param {string} mode - 'transparent' | 'replace' | 'desaturate'
 * @param {Object} options - { tolerance, replacementColor }
 */
function removeColorChannel(imageData, channel, mode, options) {
    options = options || {};
    const data = imageData.data;
    const tolerance = options.tolerance || 20;
    const replacementColor = options.replacementColor || { r: 255, g: 255, b: 255 };

    // HSL диапазоны для каждого канала (hue в градусах)
    const channelRanges = {
        red:     { min: 345, max: 15 },
        orange:  { min: 15,  max: 45 },
        yellow:  { min: 45,  max: 75 },
        green:   { min: 75,  max: 165 },
        cyan:    { min: 165, max: 195 },
        blue:    { min: 195, max: 255 },
        magenta: { min: 255, max: 315 },
        pink:    { min: 315, max: 345 }
    };

    const range = channelRanges[channel];
    if (!range) return imageData;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Конвертировать в HSL
        const hsl = rgbToHSL(r, g, b);
        const h = hsl[0];
        const s = hsl[1];

        // Проверить попадание в диапазон
        let inRange = false;
        if (range.min > range.max) {
            // Переход через 0° (красный/розовый)
            inRange = (h >= range.min - tolerance || h <= range.max + tolerance);
        } else {
            inRange = (h >= range.min - tolerance && h <= range.max + tolerance);
        }

        // Применить обработку только к насыщенным цветам
        if (inRange && s > 15) {
            switch (mode) {
                case 'transparent':
                    data[i + 3] = 0;
                    break;

                case 'replace':
                    data[i]     = replacementColor.r;
                    data[i + 1] = replacementColor.g;
                    data[i + 2] = replacementColor.b;
                    break;

                case 'desaturate': {
                    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                    data[i]     = gray;
                    data[i + 1] = gray;
                    data[i + 2] = gray;
                    break;
                }
            }
        }
    }

    return imageData;
}

/**
 * Удалить тени или блики
 * @param {ImageData} imageData
 * @param {string} type - 'shadows' | 'highlights'
 * @param {number} threshold - порог яркости (0-255)
 * @param {number} feather - размытие краёв (0-100)
 */
function removeLuminanceRange(imageData, type, threshold, feather) {
    threshold = threshold || 50;
    feather = feather || 0;
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        if (type === 'shadows') {
            if (luminance < threshold) {
                if (feather > 0 && luminance > threshold - feather) {
                    const t = (luminance - (threshold - feather)) / feather;
                    const smoothT = t * t * (3 - 2 * t);
                    data[i + 3] = Math.round(data[i + 3] * smoothT);
                } else {
                    data[i + 3] = 0;
                }
            }
        } else if (type === 'highlights') {
            const invThreshold = 255 - threshold;
            if (luminance > invThreshold) {
                if (feather > 0 && luminance < invThreshold + feather) {
                    const t = (luminance - invThreshold) / feather;
                    const smoothT = t * t * (3 - 2 * t);
                    data[i + 3] = Math.round(data[i + 3] * (1 - smoothT));
                } else {
                    data[i + 3] = 0;
                }
            }
        }
    }

    // Гауссово размытие альфа-канала для смягчения краёв
    if (feather > MIN_FEATHER_FOR_BLUR) {
        const blurRadius = Math.max(1, Math.round(feather / FEATHER_TO_BLUR_RATIO));
        applyGaussianBlurToAlpha(imageData, blurRadius);
    }

    return imageData;
}

/**
 * Edge Detection (алгоритм Sobel)
 * @param {ImageData} imageData
 * @returns {Uint8ClampedArray} - карта границ
 */
function detectEdges(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const edges = new Uint8ClampedArray(width * height);

    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let gx = 0, gy = 0;

            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = ((y + ky) * width + (x + kx)) * 4;
                    const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

                    const kernelIdx = (ky + 1) * 3 + (kx + 1);
                    gx += gray * sobelX[kernelIdx];
                    gy += gray * sobelY[kernelIdx];
                }
            }

            const magnitude = Math.sqrt(gx * gx + gy * gy);
            edges[y * width + x] = magnitude > 128 ? 255 : 0;
        }
    }

    return edges;
}

/**
 * Найти доминирующий цвет фона (анализ краёв изображения)
 * @param {ImageData} imageData
 * @returns {{r: number, g: number, b: number}}
 */
function findDominantBackgroundColor(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    const colorCounts = {};

    // Собрать цвета с краёв (top, bottom, left, right)
    const edgePixels = [];

    // Верхний и нижний края
    for (let x = 0; x < width; x++) {
        edgePixels.push(x); // Верх
        edgePixels.push((height - 1) * width + x); // Низ
    }

    // Левый и правый края
    for (let y = 0; y < height; y++) {
        edgePixels.push(y * width); // Лево
        edgePixels.push(y * width + width - 1); // Право
    }

    edgePixels.forEach(function(idx) {
        const i = idx * 4;
        // Округлить до COLOR_GROUPING_FACTOR для группировки похожих цветов
        const r = Math.round(data[i] / COLOR_GROUPING_FACTOR) * COLOR_GROUPING_FACTOR;
        const g = Math.round(data[i + 1] / COLOR_GROUPING_FACTOR) * COLOR_GROUPING_FACTOR;
        const b = Math.round(data[i + 2] / COLOR_GROUPING_FACTOR) * COLOR_GROUPING_FACTOR;
        const key = r + ',' + g + ',' + b;
        colorCounts[key] = (colorCounts[key] || 0) + 1;
    });

    // Найти самый частый
    let maxCount = 0;
    let dominantColor = { r: 255, g: 255, b: 255 };

    Object.keys(colorCounts).forEach(function(key) {
        const count = colorCounts[key];
        if (count > maxCount) {
            maxCount = count;
            const parts = key.split(',');
            dominantColor = {
                r: parseInt(parts[0], 10),
                g: parseInt(parts[1], 10),
                b: parseInt(parts[2], 10)
            };
        }
    });

    return dominantColor;
}

/**
 * Автоматическое удаление фона (комбинация методов)
 * @param {ImageData} imageData
 * @param {Object} options - { tolerance, feather }
 */
function autoRemoveBackground(imageData, options) {
    options = options || {};

    // 1. Найти цвет фона
    const backgroundColor = findDominantBackgroundColor(imageData);

    // 2. Удалить фон по цвету
    return removeBackgroundByColor(imageData, {
        targetColor: backgroundColor,
        tolerance: options.tolerance || 40,
        feather: options.feather || 10
    });
}
