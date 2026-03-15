/**
 * background-removal.js — продвинутое удаление фона и цветовых каналов
 *
 * Возможности:
 * - Chroma Key (RGB и YUV режимы)
 * - Удаление по цветовым каналам (HSL)
 * - Удаление теней/бликов
 * - Автоопределение фона (k-means кластеризация)
 * - Удаление по маске/краям
 * - Кэширование и оптимизация производительности
 *
 * @version 2.0.0
 * @author PhotoEditor Team
 */

'use strict';

// Конфигурация алгоритмов удаления фона
const CONFIG = {
    // Квантование цвета при группировке
    COLOR_GROUPING_FACTOR: 10,

    // Параметры размытия краёв
    MIN_FEATHER_FOR_BLUR: 2,
    FEATHER_TO_BLUR_RATIO: 8,

    // Детекция краёв (Sobel)
    EDGE_DETECTION_THRESHOLD: 128,

    // Удаление цветовых каналов
    MIN_SATURATION_FOR_COLOR_REMOVAL: 15,

    // Значения по умолчанию
    DEFAULT_CHROMA_TOLERANCE: 30,
    DEFAULT_AUTO_TOLERANCE: 40,
    DEFAULT_FEATHER: 10,

    // Кэширование
    HSL_CACHE_LIMIT: 50000,

    // k-means кластеризация
    KMEANS_MAX_ITERATIONS: 10,
    KMEANS_CONVERGENCE_THRESHOLD: 1
};

// Обратная совместимость
const COLOR_GROUPING_FACTOR = CONFIG.COLOR_GROUPING_FACTOR;
const MIN_FEATHER_FOR_BLUR = CONFIG.MIN_FEATHER_FOR_BLUR;
const FEATHER_TO_BLUR_RATIO = CONFIG.FEATHER_TO_BLUR_RATIO;

// Кэш для RGB→HSL преобразований (ограничен HSL_CACHE_LIMIT записями для экономии памяти)
let hslCache = {};
let hslCacheSize = 0;

/**
 * Очистить кэш RGB→HSL (вызывать при переключении изображений)
 */
function clearHSLCache() {
    hslCache = {};
    hslCacheSize = 0;
}

/**
 * Конвертировать RGB в HSL (hue в градусах 0-360)
 * @param {number} r - Красный (0-255)
 * @param {number} g - Зелёный (0-255)
 * @param {number} b - Синий (0-255)
 * @returns {[number, number, number]} [h(0-360), s(0-100), l(0-100)]
 */
function rgbToHSL(r, g, b) {
    // Создать ключ (pack RGB в 24-bit integer)
    const key = (r << 16) | (g << 8) | b;

    // Проверить кэш
    if (hslCache[key]) {
        return hslCache[key];
    }

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

    const result = [h * 360, s * 100, l * 100];

    // Сохранить в кэш (с лимитом памяти)
    if (hslCacheSize < CONFIG.HSL_CACHE_LIMIT) {
        hslCache[key] = result;
        hslCacheSize++;
    }

    return result;
}

/**
 * Конвертировать RGB в YUV (для точного chroma keying)
 * @param {number} r - Красный (0-255)
 * @param {number} g - Зелёный (0-255)
 * @param {number} b - Синий (0-255)
 * @returns {[number, number, number]} [Y(0-255), U(-127..127), V(-127..127)]
 */
function rgbToYUV(r, g, b) {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const u = (b - y) * 0.565;
    const v = (r - y) * 0.713;
    return [y, u, v];
}

/**
 * Удалить фон по цветовому диапазону (Chroma Key)
 * @param {ImageData} imageData - Данные изображения (будет изменён in-place!)
 * @param {Object} options - Параметры удаления фона
 * @param {{r: number, g: number, b: number}} [options.targetColor={r:0,g:255,b:0}] - Целевой цвет RGB (каждый канал 0-255)
 * @param {number} [options.tolerance=30] - Допуск цветового расстояния (0-441, где 441 ≈ sqrt(3×255²))
 * @param {number} [options.feather=0] - Размытие краёв прозрачности (0-100 пикселей)
 * @param {number} [options.strength=1] - Сила эффекта (0.0-1.0, где 1.0 = полное удаление)
 * @param {boolean} [options.useYUV=false] - Использовать YUV-алгоритм для улучшенной точности
 * @param {Function} [onProgress] - Колбэк прогресса: onProgress(progressPercent: 0-1)
 * @returns {ImageData} Модифицированный объект imageData
 * @throws {Error} Если imageData невалидна или параметры вне диапазона
 */
function removeBackgroundByColor(imageData, options, onProgress) {
    // Валидация
    if (!imageData || !imageData.data) {
        throw new Error('Invalid ImageData object');
    }

    // Если включен режим YUV, использовать улучшенный алгоритм
    if (options && options.useYUV) {
        return removeBackgroundByColorYUV(imageData, options, onProgress);
    }

    const data = imageData.data;
    const targetColor = (options && options.targetColor) || { r: 0, g: 255, b: 0 };

    // Проверить диапазон RGB
    ['r', 'g', 'b'].forEach(function(channel) {
        if (targetColor[channel] < 0 || targetColor[channel] > 255) {
            throw new Error('targetColor.' + channel + ' must be in range 0-255');
        }
    });

    // Ограничить параметры
    const tolerance = Math.max(0, Math.min(441, (options && options.tolerance) || CONFIG.DEFAULT_CHROMA_TOLERANCE));
    const feather = Math.max(0, Math.min(100, (options && options.feather) || 0));
    const strength = Math.max(0, Math.min(1, (options && options.strength !== undefined) ? options.strength : 1));

    const totalPixels = data.length / 4;
    const progressUpdateInterval = Math.max(1, Math.floor(totalPixels / 100));
    let processedPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const originalAlpha = data[i + 3];

        // Евклидово расстояние до целевого цвета
        const distance = Math.sqrt(
            Math.pow(r - targetColor.r, 2) +
            Math.pow(g - targetColor.g, 2) +
            Math.pow(b - targetColor.b, 2)
        );

        // Если близко к целевому цвету
        if (distance < tolerance) {
            let targetAlpha;
            // Плавный переход (feather) с нелинейной интерполяцией (smoothstep)
            if (feather > 0 && distance > tolerance - feather) {
                const t = (distance - (tolerance - feather)) / feather;
                // Smoothstep: 3*t^2 - 2*t^3 для более естественного перехода
                const smoothT = t * t * (3 - 2 * t);
                targetAlpha = Math.round(255 * smoothT);
            } else {
                targetAlpha = 0; // Полностью прозрачный
            }
            // Интерполируем с учётом силы эффекта
            data[i + 3] = Math.round(originalAlpha + (targetAlpha - originalAlpha) * strength);
        }

        processedPixels++;

        // Обновить прогресс
        if (onProgress && processedPixels % progressUpdateInterval === 0) {
            onProgress(processedPixels / totalPixels);
        }
    }

    // Гауссово размытие альфа-канала для дополнительного смягчения краёв
    if (feather > MIN_FEATHER_FOR_BLUR) {
        const blurRadius = Math.max(1, Math.round(feather / FEATHER_TO_BLUR_RATIO));
        applyGaussianBlurToAlpha(imageData, blurRadius);
    }

    if (onProgress) onProgress(1.0);

    return imageData;
}

/**
 * Удалить фон по цветовому диапазону с использованием YUV (улучшенная точность)
 * @param {ImageData} imageData - Данные изображения (будет изменён in-place!)
 * @param {Object} options - { targetColor: {r,g,b}, tolerance, feather, strength }
 * @param {Function} [onProgress] - Колбэк прогресса: onProgress(progressPercent: 0-1)
 * @returns {ImageData}
 * @throws {Error} Если imageData невалидна
 */
function removeBackgroundByColorYUV(imageData, options, onProgress) {
    if (!imageData || !imageData.data) {
        throw new Error('Invalid ImageData object');
    }

    const data = imageData.data;
    const targetColor = (options && options.targetColor) || { r: 0, g: 255, b: 0 };
    const tolerance = Math.max(0, Math.min(180, (options && options.tolerance) || CONFIG.DEFAULT_CHROMA_TOLERANCE)); // YUV: max ≈ 180
    const feather = Math.max(0, Math.min(100, (options && options.feather) || 0));
    const strength = Math.max(0, Math.min(1, (options && options.strength !== undefined) ? options.strength : 1));

    // Конвертировать целевой цвет в YUV
    const targetYUV = rgbToYUV(targetColor.r, targetColor.g, targetColor.b);

    const totalPixels = data.length / 4;
    const progressUpdateInterval = Math.max(1, Math.floor(totalPixels / 100));
    let processedPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const originalAlpha = data[i + 3];

        // Конвертировать пиксель в YUV
        const pixelYUV = rgbToYUV(r, g, b);

        // Расстояние только по цветности (U, V), игнорируя яркость (Y)
        const chromaDistance = Math.sqrt(
            Math.pow(pixelYUV[1] - targetYUV[1], 2) +
            Math.pow(pixelYUV[2] - targetYUV[2], 2)
        );

        // Если близко к целевому цвету
        if (chromaDistance < tolerance) {
            let targetAlpha;
            // Плавный переход (feather)
            if (feather > 0 && chromaDistance > tolerance - feather) {
                const t = (chromaDistance - (tolerance - feather)) / feather;
                const smoothT = t * t * (3 - 2 * t);
                targetAlpha = Math.round(255 * smoothT);
            } else {
                targetAlpha = 0;
            }
            data[i + 3] = Math.round(originalAlpha + (targetAlpha - originalAlpha) * strength);
        }

        processedPixels++;

        // Обновить прогресс
        if (onProgress && processedPixels % progressUpdateInterval === 0) {
            onProgress(processedPixels / totalPixels);
        }
    }

    // Гауссово размытие альфа-канала
    if (feather > MIN_FEATHER_FOR_BLUR) {
        const blurRadius = Math.max(1, Math.round(feather / FEATHER_TO_BLUR_RATIO));
        applyGaussianBlurToAlpha(imageData, blurRadius);
    }

    if (onProgress) onProgress(1.0);

    return imageData;
}

/**
 * Применить гауссово размытие к альфа-каналу (для мягких краёв)
 * @param {ImageData} imageData - Данные изображения (будет изменён in-place!)
 * @param {number} radius - радиус размытия (1-10)
 * @returns {ImageData}
 * @throws {Error} Если imageData невалидна
 */
function applyGaussianBlurToAlpha(imageData, radius) {
    if (!imageData || !imageData.data) {
        throw new Error('Invalid ImageData object');
    }
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
 * @param {ImageData} imageData - Данные изображения (будет изменён in-place!)
 * @param {string} channel - 'red', 'green', 'blue', 'yellow', 'orange', 'cyan', 'magenta', 'pink'
 * @param {string} mode - 'transparent' | 'replace' | 'desaturate'
 * @param {Object} options - { tolerance, replacementColor, strength }
 * @returns {ImageData}
 * @throws {Error} Если imageData невалидна или channel неизвестен
 */
function removeColorChannel(imageData, channel, mode, options) {
    if (!imageData || !imageData.data) {
        throw new Error('Invalid ImageData object');
    }
    options = options || {};
    const data = imageData.data;
    const tolerance = Math.max(0, options.tolerance || 20);
    const replacementColor = options.replacementColor || { r: 255, g: 255, b: 255 };
    const strength = Math.max(0, Math.min(1, options.strength !== undefined ? options.strength : 1));

    // Режим точного цвета: сравнение по евклидову расстоянию в RGB
    if (options.targetColor) {
        const targetColor = options.targetColor;
        // tolerance (0-50) масштабируется к RGB-расстоянию (0-220.5):
        // макс. RGB-расстояние = sqrt(3 * 255^2) ≈ 441; коэффициент 4.41 даёт диапазон [0, ~220] при tolerance [0, 50]
        const threshold = tolerance * 4.41;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const distance = Math.sqrt(
                Math.pow(r - targetColor.r, 2) +
                Math.pow(g - targetColor.g, 2) +
                Math.pow(b - targetColor.b, 2)
            );

            if (distance < threshold) {
                switch (mode) {
                    case 'transparent':
                        data[i + 3] = Math.round(data[i + 3] * (1 - strength));
                        break;

                    case 'replace':
                        data[i]     = Math.round(r + (replacementColor.r - r) * strength);
                        data[i + 1] = Math.round(g + (replacementColor.g - g) * strength);
                        data[i + 2] = Math.round(b + (replacementColor.b - b) * strength);
                        break;

                    case 'desaturate': {
                        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                        data[i]     = Math.round(r + (gray - r) * strength);
                        data[i + 1] = Math.round(g + (gray - g) * strength);
                        data[i + 2] = Math.round(b + (gray - b) * strength);
                        break;
                    }
                }
            }
        }

        return imageData;
    }

    // HSL диапазоны для каждого канала (hue в градусах)
    const channelRanges = {
        red:     { min: 345, max: 15 },
        orange:  { min: 15,  max: 35 },
        yellow:  { min: 35,  max: 65 },
        green:   { min: 65,  max: 165 },
        cyan:    { min: 165, max: 195 },
        blue:    { min: 195, max: 265 },
        magenta: { min: 265, max: 315 },
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
        if (inRange && s > CONFIG.MIN_SATURATION_FOR_COLOR_REMOVAL) {
            switch (mode) {
                case 'transparent':
                    data[i + 3] = Math.round(data[i + 3] * (1 - strength));
                    break;

                case 'replace':
                    data[i]     = Math.round(r + (replacementColor.r - r) * strength);
                    data[i + 1] = Math.round(g + (replacementColor.g - g) * strength);
                    data[i + 2] = Math.round(b + (replacementColor.b - b) * strength);
                    break;

                case 'desaturate': {
                    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                    data[i]     = Math.round(r + (gray - r) * strength);
                    data[i + 1] = Math.round(g + (gray - g) * strength);
                    data[i + 2] = Math.round(b + (gray - b) * strength);
                    break;
                }
            }
        }
    }

    return imageData;
}

/**
 * Удалить тени или блики
 * @param {ImageData} imageData - Данные изображения (будет изменён in-place!)
 * @param {string} type - 'shadows' | 'highlights'
 * @param {number} threshold - порог яркости (0-255)
 * @param {number} feather - размытие краёв (0-100)
 * @param {number} strength - сила эффекта (0.0-1.0)
 * @returns {ImageData}
 * @throws {Error} Если imageData невалидна
 */
function removeLuminanceRange(imageData, type, threshold, feather, strength) {
    if (!imageData || !imageData.data) {
        throw new Error('Invalid ImageData object');
    }
    threshold = Math.max(0, Math.min(255, threshold || 50));
    feather = Math.max(0, Math.min(100, feather || 0));
    strength = Math.max(0, Math.min(1, strength !== undefined ? strength : 1));
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const originalAlpha = data[i + 3];

        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        if (type === 'shadows') {
            if (luminance < threshold) {
                let targetAlpha;
                if (feather > 0 && luminance > threshold - feather) {
                    const t = (luminance - (threshold - feather)) / feather;
                    const smoothT = t * t * (3 - 2 * t);
                    targetAlpha = Math.round(originalAlpha * smoothT);
                } else {
                    targetAlpha = 0;
                }
                data[i + 3] = Math.round(originalAlpha + (targetAlpha - originalAlpha) * strength);
            }
        } else if (type === 'highlights') {
            const invThreshold = 255 - threshold;
            if (luminance > invThreshold) {
                let targetAlpha;
                if (feather > 0 && luminance < invThreshold + feather) {
                    const t = (luminance - invThreshold) / feather;
                    const smoothT = t * t * (3 - 2 * t);
                    targetAlpha = Math.round(originalAlpha * (1 - smoothT));
                } else {
                    targetAlpha = 0;
                }
                data[i + 3] = Math.round(originalAlpha + (targetAlpha - originalAlpha) * strength);
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
 * @returns {Uint8ClampedArray} - карта границ (255 = граница, 0 = фон)
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
            edges[y * width + x] = magnitude > CONFIG.EDGE_DETECTION_THRESHOLD ? 255 : 0;
        }
    }

    return edges;
}

/**
 * Найти доминирующий цвет фона используя k-means кластеризацию
 * @param {ImageData} imageData
 * @param {number} [numClusters=3] - Количество кластеров для поиска
 * @returns {{r: number, g: number, b: number}}
 */
function findDominantBackgroundColor(imageData, numClusters) {
    numClusters = numClusters || 3;
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // Собрать цвета с краёв (top, bottom, left, right)
    const edgeColors = [];

    // Верхний и нижний края
    for (let x = 0; x < width; x++) {
        edgeColors.push([data[x * 4], data[x * 4 + 1], data[x * 4 + 2]]); // Верх
        const bottomIdx = ((height - 1) * width + x) * 4;
        edgeColors.push([data[bottomIdx], data[bottomIdx + 1], data[bottomIdx + 2]]); // Низ
    }

    // Левый и правый края
    for (let y = 0; y < height; y++) {
        const leftIdx = y * width * 4;
        edgeColors.push([data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]]); // Лево
        const rightIdx = (y * width + width - 1) * 4;
        edgeColors.push([data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]]); // Право
    }

    // k-means кластеризация
    const clusters = kMeansClustering(edgeColors, numClusters, CONFIG.KMEANS_MAX_ITERATIONS);

    // Если кластеры пустые, вернуть белый
    if (clusters.length === 0) {
        return { r: 255, g: 255, b: 255 };
    }

    // Найти самый большой кластер
    let largestCluster = clusters[0];
    for (let i = 1; i < clusters.length; i++) {
        if (clusters[i].size > largestCluster.size) {
            largestCluster = clusters[i];
        }
    }

    return {
        r: Math.round(largestCluster.centroid[0]),
        g: Math.round(largestCluster.centroid[1]),
        b: Math.round(largestCluster.centroid[2])
    };
}

/**
 * k-means кластеризация для массива RGB цветов
 * @param {Array<[number,number,number]>} colors - Массив [r,g,b]
 * @param {number} k - Количество кластеров
 * @param {number} maxIterations - Максимум итераций
 * @returns {Array<{centroid: [number,number,number], size: number}>}
 */
function kMeansClustering(colors, k, maxIterations) {
    if (colors.length < k) k = colors.length;
    if (k === 0) return [];

    // Инициализация: выбрать k случайных центроидов
    const centroids = [];
    for (let i = 0; i < k; i++) {
        const randomIndex = Math.floor(Math.random() * colors.length);
        centroids.push(colors[randomIndex].slice()); // Copy
    }

    let clusters = [];

    // Итерации k-means
    for (let iter = 0; iter < maxIterations; iter++) {
        // Создать пустые кластеры
        clusters = [];
        for (let i = 0; i < k; i++) {
            clusters.push({ centroid: centroids[i], colors: [], size: 0 });
        }

        // Назначить каждый цвет к ближайшему центроиду
        for (let i = 0; i < colors.length; i++) {
            const color = colors[i];
            let minDist = Infinity;
            let closestCluster = 0;

            for (let j = 0; j < k; j++) {
                const dist = Math.sqrt(
                    Math.pow(color[0] - centroids[j][0], 2) +
                    Math.pow(color[1] - centroids[j][1], 2) +
                    Math.pow(color[2] - centroids[j][2], 2)
                );

                if (dist < minDist) {
                    minDist = dist;
                    closestCluster = j;
                }
            }

            clusters[closestCluster].colors.push(color);
            clusters[closestCluster].size++;
        }

        // Пересчитать центроиды
        let converged = true;
        for (let i = 0; i < k; i++) {
            if (clusters[i].colors.length === 0) continue;

            let sumR = 0, sumG = 0, sumB = 0;
            for (let j = 0; j < clusters[i].colors.length; j++) {
                sumR += clusters[i].colors[j][0];
                sumG += clusters[i].colors[j][1];
                sumB += clusters[i].colors[j][2];
            }

            const newCentroid = [
                sumR / clusters[i].colors.length,
                sumG / clusters[i].colors.length,
                sumB / clusters[i].colors.length
            ];

            // Проверить сходимость
            if (Math.abs(newCentroid[0] - centroids[i][0]) > CONFIG.KMEANS_CONVERGENCE_THRESHOLD ||
                Math.abs(newCentroid[1] - centroids[i][1]) > CONFIG.KMEANS_CONVERGENCE_THRESHOLD ||
                Math.abs(newCentroid[2] - centroids[i][2]) > CONFIG.KMEANS_CONVERGENCE_THRESHOLD) {
                converged = false;
            }

            centroids[i] = newCentroid;
            clusters[i].centroid = newCentroid;
        }

        // Выйти, если сошлось
        if (converged) break;
    }

    return clusters;
}

/**
 * Автоматическое удаление фона (комбинация методов)
 * @param {ImageData} imageData
 * @param {Object} options - { tolerance, feather, strength }
 * @returns {ImageData}
 */
function autoRemoveBackground(imageData, options) {
    options = options || {};

    // 1. Найти цвет фона
    const backgroundColor = findDominantBackgroundColor(imageData);

    // 2. Удалить фон по цвету
    return removeBackgroundByColor(imageData, {
        targetColor: backgroundColor,
        tolerance: options.tolerance || CONFIG.DEFAULT_AUTO_TOLERANCE,
        feather: options.feather || CONFIG.DEFAULT_FEATHER,
        strength: options.strength !== undefined ? options.strength : 1
    });
}

/**
 * Удалить фон используя бинарную маску
 * @param {ImageData} imageData - Изображение для обработки
 * @param {Uint8ClampedArray} mask - Маска (255 = сохранить, 0 = удалить)
 * @param {number} [feather=5] - Размытие краёв маски (0-50)
 * @returns {ImageData}
 * @throws {Error} Если imageData невалидна или размер маски не совпадает с изображением
 */
function removeBackgroundByMask(imageData, mask, feather) {
    if (!imageData || !imageData.data) {
        throw new Error('Invalid ImageData object');
    }
    if (!mask || mask.length !== imageData.width * imageData.height) {
        throw new Error('Mask size must match image dimensions');
    }

    feather = Math.max(0, Math.min(50, feather !== undefined ? feather : 5));
    const data = imageData.data;

    // Применить маску к альфа-каналу
    for (let i = 0; i < mask.length; i++) {
        const alpha = mask[i]; // 0 или 255
        data[i * 4 + 3] = Math.round(data[i * 4 + 3] * (alpha / 255));
    }

    // Размыть края
    if (feather > 0) {
        const blurRadius = Math.max(1, Math.round(feather / FEATHER_TO_BLUR_RATIO));
        applyGaussianBlurToAlpha(imageData, blurRadius);
    }

    return imageData;
}

/**
 * Автоматическое удаление фона с использованием детекции краёв
 * @param {ImageData} imageData
 * @param {Object} options - { edgeThreshold, invertMask, feather }
 * @returns {ImageData}
 */
function autoRemoveBackgroundByEdges(imageData, options) {
    options = options || {};
    const invertMask = options.invertMask || false;
    const feather = options.feather !== undefined ? options.feather : CONFIG.DEFAULT_FEATHER;

    // Детектировать края
    const edgeMask = detectEdges(imageData);

    // Инвертировать маску если нужно (удалить края вместо фона)
    if (invertMask) {
        for (let i = 0; i < edgeMask.length; i++) {
            edgeMask[i] = 255 - edgeMask[i];
        }
    }

    // Применить маску
    return removeBackgroundByMask(imageData, edgeMask, feather);
}

// ===== УМНОЕ УДАЛЕНИЕ ФОНА (Multi-Pass Intelligent Removal) =====

/**
 * Умное удаление фона с учётом переднего/заднего плана.
 * Использует Sobel edge detection, оценку переднего плана, контекстный анализ,
 * генерацию trimap и alpha matting для точного результата.
 *
 * @param {ImageData} imageData
 * @param {Object} options - {
 *   targetColor: {r,g,b},
 *   tolerance: number (0-100),
 *   feather: number (0-100),
 *   strength: number (0.0-1.0),
 *   edgeProtection: number (0-100),
 *   foregroundBias: number (0-100)
 * }
 * @param {Function} [onProgress] - callback(0.0-1.0)
 * @returns {ImageData}
 */
function removeBackgroundSmart(imageData, options, onProgress) {
    if (!imageData || !imageData.data) {
        throw new Error('Invalid ImageData object');
    }

    options = options || {};
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const totalPixels = width * height;

    const targetColor = options.targetColor || { r: 0, g: 255, b: 0 };
    const tolerance = Math.max(0, Math.min(100, options.tolerance || 30));
    const feather = Math.max(0, Math.min(100, options.feather || 10));
    const strength = Math.max(0, Math.min(1, options.strength !== undefined ? options.strength : 1));
    const edgeProtection = Math.max(0, Math.min(100, options.edgeProtection || 50));
    const foregroundBias = Math.max(0, Math.min(100, options.foregroundBias || 50));

    if (onProgress) onProgress(0.0);

    // Шаг 1: Определение краёв (Sobel)
    const edgeMap = detectEdgesSobel(imageData);
    if (onProgress) onProgress(0.15);

    // Шаг 2: Оценка переднего плана
    const foregroundMap = estimateForeground(imageData, edgeMap, {
        centerBias: foregroundBias / 100
    });
    if (onProgress) onProgress(0.30);

    // Шаг 3: Контекстный анализ
    analyzeContext(imageData, targetColor, tolerance, edgeMap);
    if (onProgress) onProgress(0.50);

    // Шаг 4: Генерация trimap
    const trimap = generateTrimap(imageData, targetColor, tolerance, foregroundMap, edgeMap, {
        edgeProtection: edgeProtection / 100
    });
    if (onProgress) onProgress(0.70);

    // Шаг 5: Alpha matting
    const alphaMap = computeAlphaMatting(imageData, trimap, targetColor, tolerance, feather);
    if (onProgress) onProgress(0.85);

    // Шаг 6: Применить альфа-канал с учётом силы эффекта
    for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const originalAlpha = data[idx + 3];
        const computedAlpha = alphaMap[i];
        data[idx + 3] = Math.round(originalAlpha + (computedAlpha - originalAlpha) * strength);
    }

    if (onProgress) onProgress(1.0);

    return imageData;
}

/**
 * Определение краёв методом Sobel.
 * @param {ImageData} imageData
 * @returns {Uint8ClampedArray} карта краёв (0-255)
 */
function detectEdgesSobel(imageData) {
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

            edges[y * width + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
        }
    }

    return edges;
}

/**
 * Оценить вероятность переднего плана для каждого пикселя.
 * Центральные пиксели и пиксели с выраженными краями получают высокую вероятность.
 *
 * @param {ImageData} imageData
 * @param {Uint8ClampedArray} edgeMap
 * @param {Object} options - { centerBias: number (0.0-1.0) }
 * @returns {Float32Array} вероятность переднего плана (0.0-1.0)
 */
function estimateForeground(imageData, edgeMap, options) {
    const width = imageData.width;
    const height = imageData.height;
    const foregroundMap = new Float32Array(width * height);
    const centerBias = (options && options.centerBias !== undefined) ? options.centerBias : 0.5;

    const centerX = width / 2;
    const centerY = height / 2;
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const dx = x - centerX;
            const dy = y - centerY;
            const distFromCenter = Math.sqrt(dx * dx + dy * dy) / maxDist;
            const centerScore = 1.0 - distFromCenter;
            const edgeScore = edgeMap[idx] / 255.0;
            foregroundMap[idx] = centerScore * centerBias + edgeScore * (1 - centerBias);
        }
    }

    return foregroundMap;
}

/**
 * Контекстный анализ: для каждого пикселя оценивает долю соседей,
 * похожих на целевой цвет, с помощью окна 5×5.
 * Возвращает карту контекста (не используется напрямую после генерации trimap,
 * но влияет на edgeMap через вызывающий код).
 *
 * @param {ImageData} imageData
 * @param {Object} targetColor - {r, g, b}
 * @param {number} tolerance
 * @param {Uint8ClampedArray} edgeMap
 * @returns {Float32Array} контекстная карта (0.0-1.0)
 */
function analyzeContext(imageData, targetColor, tolerance, edgeMap) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const contextMap = new Float32Array(width * height);
    const kernelSize = 5;
    const halfKernel = Math.floor(kernelSize / 2);
    // 4.41 ≈ √(255²×3)/100 — нормализует допуск 0-100 в полный диапазон RGB-расстояния (0-441)
    const toleranceRgb = tolerance * 4.41;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const pixelIdx = idx * 4;

            const r = data[pixelIdx];
            const g = data[pixelIdx + 1];
            const b = data[pixelIdx + 2];

            const distance = Math.sqrt(
                (r - targetColor.r) * (r - targetColor.r) +
                (g - targetColor.g) * (g - targetColor.g) +
                (b - targetColor.b) * (b - targetColor.b)
            );

            let similarNeighbors = 0;
            let totalNeighbors = 0;

            for (let ky = -halfKernel; ky <= halfKernel; ky++) {
                for (let kx = -halfKernel; kx <= halfKernel; kx++) {
                    if (kx === 0 && ky === 0) continue;
                    const nx = x + kx;
                    const ny = y + ky;
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                    const nIdx = (ny * width + nx) * 4;
                    const nr = data[nIdx];
                    const ng = data[nIdx + 1];
                    const nb = data[nIdx + 2];

                    const nDist = Math.sqrt(
                        (nr - targetColor.r) * (nr - targetColor.r) +
                        (ng - targetColor.g) * (ng - targetColor.g) +
                        (nb - targetColor.b) * (nb - targetColor.b)
                    );

                    totalNeighbors++;
                    if (nDist < toleranceRgb) {
                        similarNeighbors++;
                    }
                }
            }

            const neighborRatio = totalNeighbors > 0 ? similarNeighbors / totalNeighbors : 0;
            const contextScore = toleranceRgb > 0
                ? (distance / toleranceRgb) * neighborRatio
                : 0;
            contextMap[idx] = Math.min(1.0, contextScore);
        }
    }

    return contextMap;
}

/**
 * Генерация trimap: foreground=1.0, background=0.0, неизвестно=0.5.
 *
 * @param {ImageData} imageData
 * @param {Object} targetColor - {r, g, b}
 * @param {number} tolerance
 * @param {Float32Array} foregroundMap
 * @param {Uint8ClampedArray} edgeMap
 * @param {Object} options - { edgeProtection: number (0.0-1.0) }
 * @returns {Float32Array}
 */
function generateTrimap(imageData, targetColor, tolerance, foregroundMap, edgeMap, options) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const trimap = new Float32Array(width * height);
    const edgeProtection = (options && options.edgeProtection !== undefined)
        ? options.edgeProtection
        : 0.5;
    // 4.41 ≈ √(255²×3)/100 — нормализует допуск 0-100 в полный диапазон RGB-расстояния (0-441)
    const toleranceRgb = tolerance * 4.41;

    // Чем выше edgeProtection (0-1), тем ниже порог → больше краёв защищается (меньше нужен)
    const edgeThreshold = 0.5 - edgeProtection * 0.4; // edgeProtection=0 → 0.5; edgeProtection=1 → 0.1

    for (let i = 0; i < width * height; i++) {
        const pixelIdx = i * 4;
        const r = data[pixelIdx];
        const g = data[pixelIdx + 1];
        const b = data[pixelIdx + 2];

        const distance = Math.sqrt(
            (r - targetColor.r) * (r - targetColor.r) +
            (g - targetColor.g) * (g - targetColor.g) +
            (b - targetColor.b) * (b - targetColor.b)
        );

        const normalizedDist = toleranceRgb > 0 ? distance / toleranceRgb : (distance > 0 ? 1 : 0);
        const foregroundProb = foregroundMap[i];
        const edgeIntensity = edgeMap[i] / 255.0;

        // Сильный край + высокая вероятность переднего плана → защитить
        if (edgeIntensity > edgeThreshold && foregroundProb > 0.3) {
            trimap[i] = 1.0;
        }
        // Далеко от целевого цвета → передний план
        else if (normalizedDist > 1.2) {
            trimap[i] = 1.0;
        }
        // Близко к целевому цвету и низкая вероятность переднего плана → фон
        else if (normalizedDist < 0.8 && foregroundProb < 0.3) {
            trimap[i] = 0.0;
        }
        // Неопределённая зона
        else {
            trimap[i] = 0.5;
        }
    }

    return trimap;
}

/**
 * Вычислить альфа-значения на основе trimap и расстояния до целевого цвета.
 *
 * @param {ImageData} imageData
 * @param {Float32Array} trimap
 * @param {Object} targetColor - {r, g, b}
 * @param {number} tolerance
 * @param {number} feather
 * @returns {Uint8ClampedArray} альфа-значения (0-255)
 */
function computeAlphaMatting(imageData, trimap, targetColor, tolerance, feather) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const alphaMap = new Uint8ClampedArray(width * height);
    const toleranceRgb = tolerance * 4.41;

    for (let i = 0; i < width * height; i++) {
        const pixelIdx = i * 4;
        const originalAlpha = data[pixelIdx + 3];

        if (trimap[i] >= 0.9) {
            // Передний план — оставить как есть
            alphaMap[i] = originalAlpha;
        } else if (trimap[i] <= 0.1) {
            // Фон — удалить
            alphaMap[i] = 0;
        } else {
            // Неопределённая зона — плавный переход
            const r = data[pixelIdx];
            const g = data[pixelIdx + 1];
            const b = data[pixelIdx + 2];

            const distance = Math.sqrt(
                (r - targetColor.r) * (r - targetColor.r) +
                (g - targetColor.g) * (g - targetColor.g) +
                (b - targetColor.b) * (b - targetColor.b)
            );

            const normalizedDist = toleranceRgb > 0
                ? distance / toleranceRgb
                : (distance > 0 ? 1 : 0);

            let alpha;
            if (feather > 0) {
                const t = Math.min(1.0, normalizedDist);
                // Smoothstep для мягких переходов
                const smoothT = t * t * (3 - 2 * t);
                alpha = Math.round(originalAlpha * smoothT);
            } else {
                alpha = normalizedDist < 1.0 ? 0 : originalAlpha;
            }

            alphaMap[i] = alpha;
        }
    }

    return alphaMap;
}

// Экспорт для тестирования (только в Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        rgbToHSL: rgbToHSL,
        rgbToYUV: rgbToYUV,
        clearHSLCache: clearHSLCache,
        removeBackgroundByColor: removeBackgroundByColor,
        removeBackgroundByColorYUV: removeBackgroundByColorYUV,
        removeColorChannel: removeColorChannel,
        removeLuminanceRange: removeLuminanceRange,
        applyGaussianBlurToAlpha: applyGaussianBlurToAlpha,
        detectEdges: detectEdges,
        findDominantBackgroundColor: findDominantBackgroundColor,
        kMeansClustering: kMeansClustering,
        autoRemoveBackground: autoRemoveBackground,
        removeBackgroundByMask: removeBackgroundByMask,
        autoRemoveBackgroundByEdges: autoRemoveBackgroundByEdges,
        removeBackgroundSmart: removeBackgroundSmart,
        detectEdgesSobel: detectEdgesSobel,
        estimateForeground: estimateForeground,
        analyzeContext: analyzeContext,
        generateTrimap: generateTrimap,
        computeAlphaMatting: computeAlphaMatting,
        CONFIG: CONFIG
    };
}
