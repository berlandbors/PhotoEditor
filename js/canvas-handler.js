// Canvas handler - rendering layers, applying pixel filters, and drag interactions

// ===== ОРИЕНТАЦИЯ ИЗОБРАЖЕНИЯ =====
const ORIENTATION_LABELS = {
    'auto': 'Авто',
    'landscape': 'Альбомная',
    'portrait': 'Книжная'
    // 'square' is an internal-only value used to skip rotation for square images
};

/**
 * Определить текущую ориентацию изображения
 * @param {HTMLImageElement|HTMLCanvasElement} img
 * @returns {'landscape'|'portrait'|'square'}
 */
function getImageOrientation(img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w > h) return 'landscape';
    if (h > w) return 'portrait';
    return 'square';
}

/**
 * Повернуть изображение на 90° для получения нужной ориентации
 * @param {HTMLImageElement} img
 * @param {'auto'|'landscape'|'portrait'} targetOrientation
 * @returns {HTMLImageElement|HTMLCanvasElement}
 */
function rotateImageForOrientation(img, targetOrientation) {
    if (targetOrientation === 'auto') return img;

    const currentOrientation = getImageOrientation(img);

    // Квадратные изображения не поворачиваем
    if (currentOrientation === 'square') return img;

    // Если ориентация уже совпадает, поворот не нужен
    if (currentOrientation === targetOrientation) return img;

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    // Создаём временный canvas для поворота на 90° по часовой стрелке
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // Меняем ширину и высоту местами
    tempCanvas.width = h;
    tempCanvas.height = w;

    tempCtx.translate(h / 2, w / 2);
    tempCtx.rotate(Math.PI / 2);
    tempCtx.drawImage(img, -w / 2, -h / 2);

    return tempCanvas;
}

/**
 * Получить изображение с применённой ориентацией
 * @param {Object} layer
 * @returns {HTMLImageElement|HTMLCanvasElement|null}
 */
function getOrientedImage(layer) {
    if (!layer.image) return null;
    return rotateImageForOrientation(layer.image, layer.orientation || 'auto');
}

// ===== ПРИМЕНЕНИЕ ФИЛЬТРОВ =====
function applyFiltersToImage(layer, imageOverride) {
    const img = imageOverride || layer.image;
    if (!img) return img;
    
    // Создаём временный canvas для применения фильтров
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    
    // Рисуем оригинал
    tempCtx.drawImage(img, 0, 0);
    
    // Получаем данные изображения
    let imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    let data = imageData.data;

    // Применяем цветовую маску перед остальными фильтрами
    if (layer.colorMask) {
        imageData = applyColorMask(
            imageData,
            layer.colorMask.range,
            layer.colorMask.adjustments,
            layer.colorMask.tolerance
        );
        data = imageData.data;
    }

    // Применяем удаление по цвету (неразрушающее)
    if (layer.colorRemoval) {
        const cr = layer.colorRemoval;
        if (cr.smart) {
            imageData = removeBackgroundSmart(imageData, {
                targetColor: cr.targetColor,
                tolerance: cr.tolerance,
                feather: cr.feather,
                strength: cr.strength / 100,
                edgeProtection: cr.edgeProtection,
                foregroundBias: cr.foregroundBias
            });
        } else {
            imageData = removeBackgroundByColor(imageData, {
                targetColor: cr.targetColor,
                tolerance: cr.tolerance,
                feather: cr.feather,
                strength: cr.strength / 100
            });
        }
        data = imageData.data;

        // Для режимов "replace" и "desaturate" дополнительный проход по пикселям
        if (cr.mode === 'replace' || cr.mode === 'desaturate') {
            const targetColor = cr.targetColor;
            const tolerance = cr.tolerance;
            const strength = cr.strength / 100;
            const replacementColor = cr.replacementColor || { r: 255, g: 255, b: 255 };

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                const distance = Math.sqrt(
                    Math.pow(r - targetColor.r, 2) +
                    Math.pow(g - targetColor.g, 2) +
                    Math.pow(b - targetColor.b, 2)
                );

                if (distance < tolerance * 4.41) { // 4.41 ≈ √(255²×3) / 100: normalises tolerance 0-100 to full RGB distance range
                    // Restore alpha (was reduced by removeBackgroundByColor) and apply colour change
                    data[i + 3] = 255;
                    if (cr.mode === 'replace') {
                        data[i]     = Math.round(r + (replacementColor.r - r) * strength);
                        data[i + 1] = Math.round(g + (replacementColor.g - g) * strength);
                        data[i + 2] = Math.round(b + (replacementColor.b - b) * strength);
                    } else {
                        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                        data[i]     = Math.round(r + (gray - r) * strength);
                        data[i + 1] = Math.round(g + (gray - g) * strength);
                        data[i + 2] = Math.round(b + (gray - b) * strength);
                    }
                }
            }
        }
    }

    // Применяем удаление по яркости (неразрушающее)
    if (layer.luminanceRemoval && layer.luminanceRemoval.type) {
        const lr = layer.luminanceRemoval;
        imageData = removeLuminanceRange(imageData, lr.type, lr.threshold, lr.feather, lr.strength / 100);
        data = imageData.data;
    }

    // Применяем Channel Mixer
    if (layer.channelMixer) {
        imageData = applyChannelMixer(imageData, layer.channelMixer);
        data = imageData.data;
    }

    // Применяем Levels
    if (layer.levels) {
        imageData = applyLevels(imageData, layer.levels);
        data = imageData.data;
    }

    // Применяем фильтры
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];
        
        // Яркость
        if (layer.brightness !== 0) {
            const bright = layer.brightness * 2.55;
            r += bright;
            g += bright;
            b += bright;
        }
        
        // Контраст
        if (layer.contrast !== 0) {
            const factor = (259 * (layer.contrast + 255)) / (255 * (259 - layer.contrast));
            r = factor * (r - 128) + 128;
            g = factor * (g - 128) + 128;
            b = factor * (b - 128) + 128;
        }
        
        // Насыщенность
        if (layer.saturation !== 0) {
            const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
            const satFactor = 1 + (layer.saturation / 100);
            r = gray + (r - gray) * satFactor;
            g = gray + (g - gray) * satFactor;
            b = gray + (b - gray) * satFactor;
        }
        
        // Температура (теплые/холодные тона)
        if (layer.temperature !== 0) {
            const temp = layer.temperature / 100;
            r += temp * 50;
            b -= temp * 50;
        }
        
        // Оттенок (hue shift)
        if (layer.hue !== 0) {
            // Конвертируем RGB в HSL и обратно с изменением H
            const hsl = rgbToHsl(r, g, b);
            hsl[0] = (hsl[0] + layer.hue / 360) % 1;
            const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
            r = rgb[0];
            g = rgb[1];
            b = rgb[2];
        }
        
        // HDR эффект
        if (layer.hdr > 0) {
            const hdrFactor = layer.hdr / 100;
            const avg = (r + g + b) / 3;
            if (avg > 128) {
                r = r + (255 - r) * hdrFactor * 0.3;
                g = g + (255 - g) * hdrFactor * 0.3;
                b = b + (255 - b) * hdrFactor * 0.3;
            } else {
                r = r * (1 - hdrFactor * 0.3);
                g = g * (1 - hdrFactor * 0.3);
                b = b * (1 - hdrFactor * 0.3);
            }
        }
        
        // Ограничиваем значения
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
    }
    
    // Зерно пленки
    if (layer.grain > 0) {
        const grainAmount = layer.grain / 100;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * grainAmount * 50;
            data[i] += noise;
            data[i + 1] += noise;
            data[i + 2] += noise;
        }
    }

    // Применить резкость ПОСЛЕ всех фильтров
    if (layer.sharpness > 0) {
        imageData = applySharpen(imageData, layer.sharpness);
        data = imageData.data;
    }
    
    tempCtx.putImageData(imageData, 0, 0);
    
    // Виньетка-прозрачность (делает края прозрачными) — попиксельная обработка
    const vtConfig = getVignetteConfig(layer, 'Transparency');
    if (vtConfig.intensity > 0) {
        applyTransparencyVignette(tempCtx, tempCanvas.width, tempCanvas.height, vtConfig);
    }

    return tempCanvas;
}

/**
 * Применить эффект резкости (Unsharp Mask)
 * @param {ImageData} imageData
 * @param {number} amount - сила резкости (0-100)
 * @returns {ImageData}
 */
function applySharpen(imageData, amount) {
    if (amount <= 0) return imageData;

    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const output = new Uint8ClampedArray(data.length);

    // Копировать альфа-канал без изменений
    for (let i = 0; i < data.length; i += 4) {
        output[i + 3] = data[i + 3];
    }

    // Unsharp Mask: изображение + (изображение - размытие) * amount
    const weight = amount / 100; // 0-1
    const kernel = [-weight, -weight, -weight, -weight, 1 + 8 * weight, -weight, -weight, -weight, -weight];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let r = 0, g = 0, b = 0;
            let kernelIndex = 0;

            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = ((y + ky) * width + (x + kx)) * 4;
                    const k = kernel[kernelIndex++];
                    r += data[idx] * k;
                    g += data[idx + 1] * k;
                    b += data[idx + 2] * k;
                }
            }

            const outIdx = (y * width + x) * 4;
            output[outIdx] = Math.max(0, Math.min(255, r));
            output[outIdx + 1] = Math.max(0, Math.min(255, g));
            output[outIdx + 2] = Math.max(0, Math.min(255, b));
        }
    }

    // Скопировать края без изменений
    for (let x = 0; x < width; x++) {
        // Верхний край
        let idx = x * 4;
        output[idx] = data[idx];
        output[idx + 1] = data[idx + 1];
        output[idx + 2] = data[idx + 2];

        // Нижний край
        idx = ((height - 1) * width + x) * 4;
        output[idx] = data[idx];
        output[idx + 1] = data[idx + 1];
        output[idx + 2] = data[idx + 2];
    }

    for (let y = 0; y < height; y++) {
        // Левый край
        let idx = (y * width) * 4;
        output[idx] = data[idx];
        output[idx + 1] = data[idx + 1];
        output[idx + 2] = data[idx + 2];

        // Правый край
        idx = (y * width + width - 1) * 4;
        output[idx] = data[idx];
        output[idx + 1] = data[idx + 1];
        output[idx + 2] = data[idx + 2];
    }

    imageData.data.set(output);
    return imageData;
}

// Вспомогательные функции для конвертации цветов
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
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
    return [h, s, l];
}

function hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [r * 255, g * 255, b * 255];
}

// ===== РЕНДЕРИНГ С ФИЛЬТРАМИ =====

// Кэш паттерна шахматной доски для визуализации прозрачности
let checkerboardPattern = null;
let checkerboardSize = { width: 0, height: 0 };

function drawCheckerboard() {
    const size = 20;
    // Пересоздать паттерн при изменении размера холста
    if (!checkerboardPattern || checkerboardSize.width !== canvas.width || checkerboardSize.height !== canvas.height) {
        const offscreen = document.createElement('canvas');
        offscreen.width = size * 2;
        offscreen.height = size * 2;
        const offCtx = offscreen.getContext('2d');
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, size * 2, size * 2);
        offCtx.fillStyle = '#cccccc';
        offCtx.fillRect(0, 0, size, size);
        offCtx.fillRect(size, size, size, size);
        checkerboardPattern = ctx.createPattern(offscreen, 'repeat');
        checkerboardSize = { width: canvas.width, height: canvas.height };
    }
    ctx.fillStyle = checkerboardPattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Нарисовать checkerboard для визуализации прозрачности
    drawCheckerboard();

    // Track whether any content has been drawn (needed for canvas blending)
    let canvasHasContent = false;

    // Отрисовываем слои в порядке от последнего к первому (снизу вверх)
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];

        // Пропускаем невидимые слои или слои без изображения
        if (!layer.visible || !layer.image) continue;

        // Если слой использует попиксельное смешивание и есть что смешивать —
        // применяем попиксельный алгоритм поверх текущего состояния canvas
        if (layer.blendMode.startsWith('canvas-') && canvasHasContent) {
            const currentState = document.createElement('canvas');
            currentState.width = canvas.width;
            currentState.height = canvas.height;
            currentState.getContext('2d').drawImage(canvas, 0, 0);
            applyCanvasBlendingToState(currentState, layer);
        } else {
            drawLayer(layer);
        }

        canvasHasContent = true;
    }

    updateCanvasOverlay();
}

/**
 * Отрисовать слой на отдельный временный canvas того же размера, что и основной.
 * Применяются все трансформации и фильтры, но режим наложения — source-over.
 * @param {object} layer
 * @returns {HTMLCanvasElement}
 */
function createTempCanvas(layer) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    if (!layer.image) return tempCanvas;

    // Используем изображение с применённой ориентацией
    const orientedImage = getOrientedImage(layer);
    if (!orientedImage) return tempCanvas;

    tempCtx.save();
    tempCtx.globalAlpha = 1;
    tempCtx.globalCompositeOperation = 'source-over';

    const width = orientedImage.width * layer.scale;
    const height = orientedImage.height * layer.scale;

    // Трансформации
    tempCtx.translate(layer.x + width / 2, layer.y + height / 2);
    tempCtx.rotate(layer.rotation * Math.PI / 180);
    if (layer.flipX) tempCtx.scale(-1, 1);
    tempCtx.translate(-(layer.x + width / 2), -(layer.y + height / 2));

    // Применяем пиксельные фильтры к ориентированному изображению
    const filteredImage = applyFiltersToImage(layer, orientedImage);

    // CSS фильтр для размытия
    if (layer.blur > 0) {
        tempCtx.filter = `blur(${layer.blur}px)`;
    }

    tempCtx.drawImage(filteredImage, layer.x, layer.y, width, height);
    tempCtx.restore();
    tempCtx.filter = 'none';

    return tempCanvas;
}

/**
 * Применить попиксельное смешивание двух слоёв и отрисовать результат на основном canvas.
 * @param {object} layer1 — нижний слой
 * @param {object} layer2 — верхний слой (содержит canvas-режим смешивания)
 */
function applyCanvasBlending(layer1, layer2) {
    // Извлекаем имя алгоритма: 'canvas-average' → 'average'
    const mode = layer2.blendMode.replace('canvas-', '');

    // Рендерим каждый слой на отдельный временный canvas
    const tempCanvas1 = createTempCanvas(layer1);
    const tempCanvas2 = createTempCanvas(layer2);

    // Применяем попиксельный алгоритм из blending.js
    const resultCanvas = window.BlendingEngine.blendImages(
        tempCanvas1, tempCanvas2, mode, layer2.opacity
    );

    // Отрисовываем результат на основном canvas
    ctx.drawImage(resultCanvas, 0, 0);
}

/**
 * Применить попиксельное смешивание слоя с текущим состоянием canvas.
 * @param {HTMLCanvasElement} stateCanvas — текущее состояние
 * @param {object} layer — верхний слой (содержит canvas-режим смешивания)
 */
function applyCanvasBlendingToState(stateCanvas, layer) {
    const mode = layer.blendMode.replace('canvas-', '');
    const tempCanvas = createTempCanvas(layer);

    const resultCanvas = window.BlendingEngine.blendImages(
        stateCanvas, tempCanvas, mode, layer.opacity
    );

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(resultCanvas, 0, 0);
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ВИНЬЕТОК =====

const VIGNETTE_DEFAULT_SHARPNESS = 50;

/**
 * Значения по умолчанию для каждого типа виньетки.
 */
const VIGNETTE_DEFAULTS = {
    Darken:       { intensity: 0, innerRadius: 0,  outerRadius: 100, centerX: 50, centerY: 50, sharpness: 50, falloffCurve: 'quadratic', shape: 'ellipse' },
    Lighten:      { intensity: 0, innerRadius: 0,  outerRadius: 100, centerX: 50, centerY: 50, sharpness: 50, falloffCurve: 'quadratic', shape: 'ellipse' },
    Transparency: { intensity: 0, innerRadius: 30, outerRadius: 100, centerX: 50, centerY: 50, sharpness: 70, falloffCurve: 'cubic',     shape: 'ellipse' }
};

/**
 * Возвращает объект конфига виньетки, поддерживая обратную совместимость
 * (старый формат: число; новый: объект с полями).
 * @param {object} layer
 * @param {'Darken'|'Lighten'|'Transparency'} type
 * @returns {object}
 */
function getVignetteConfig(layer, type) {
    const key = `vignette${type}`;
    const val = layer[key];
    const defaults = VIGNETTE_DEFAULTS[type];
    if (!val) return Object.assign({}, defaults);
    if (typeof val === 'number') return Object.assign({}, defaults, { intensity: val });
    return Object.assign({}, defaults, val);
}

/**
 * Вычисляет кривую затухания для нормированного значения t (0..1).
 * @param {number} t
 * @param {string} curve
 * @returns {number}
 */
function applyFalloffCurve(t, curve) {
    switch (curve) {
        case 'linear':    return t;
        case 'cubic':     return t * t * t;
        case 'sine':      return Math.sin(t * Math.PI / 2);
        case 'quadratic':
        default:          return t * t;
    }
}

/**
 * Применяет виньетку-затемнение или виньетку-осветление (градиентная отрисовка).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} lx - left x of layer on canvas
 * @param {number} ly - top y of layer on canvas
 * @param {number} width
 * @param {number} height
 * @param {object} config - vignette config object
 * @param {'Darken'|'Lighten'} type
 */
function applyGradientVignette(ctx, lx, ly, width, height, config, type) {
    if (!config || config.intensity <= 0) return;

    const strength = config.intensity / 100;
    const shape = config.shape || 'ellipse';

    const cx = lx + (config.centerX / 100) * width;
    const cy = ly + (config.centerY / 100) * height;

    const r = type === 'Darken' ? [0, 0, 0] : [255, 255, 255];

    if (shape === 'rectangle') {
        _applyRectVignette(ctx, lx, ly, width, height, cx, cy, config, r[0], r[1], r[2], strength);
        return;
    }

    // circle or ellipse — radial gradient
    let rx, ry;
    if (shape === 'circle') {
        rx = ry = Math.min(width, height) / 2;
    } else {
        rx = width / 2;
        ry = height / 2;
    }
    const outerR = Math.sqrt(rx * rx + ry * ry) * (config.outerRadius / 100);
    const innerR = outerR * (config.innerRadius / 100);

    // Sharpness: 0 → transition from 20% to 100% of outer; 100 → from 90% to 100%
    const sharpness = (config.sharpness || 50) / 100;
    const innerStop = (0.2 + sharpness * 0.7) * (innerR > 0 ? innerR / outerR : 1);
    const gradInner = Math.max(0, Math.min(outerR - 1, innerR));

    const gradient = ctx.createRadialGradient(cx, cy, gradInner, cx, cy, outerR);
    gradient.addColorStop(0, `rgba(${r[0]},${r[1]},${r[2]},0)`);
    gradient.addColorStop(Math.min(innerStop, 0.99), `rgba(${r[0]},${r[1]},${r[2]},0)`);
    gradient.addColorStop(1, `rgba(${r[0]},${r[1]},${r[2]},${strength})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(lx, ly, width, height);
}

/**
 * Прямоугольная виньетка — 4 линейных градиента от краёв.
 */
function _applyRectVignette(ctx, lx, ly, width, height, cx, cy, config, r, g, b, strength) {
    const outerRF = config.outerRadius / 100;
    const sharpness = (config.sharpness || 50) / 100;

    // Border size relative to each half-dimension
    const bw = Math.min(width  * outerRF * (1 - sharpness * 0.6), width  / 2);
    const bh = Math.min(height * outerRF * (1 - sharpness * 0.6), height / 2);

    ctx.save();
    const c0 = `rgba(${r},${g},${b},${strength})`;
    const cT = `rgba(${r},${g},${b},0)`;

    // Top
    const tg = ctx.createLinearGradient(0, ly, 0, ly + bh);
    tg.addColorStop(0, c0); tg.addColorStop(1, cT);
    ctx.fillStyle = tg; ctx.fillRect(lx, ly, width, bh);

    // Bottom
    const bg = ctx.createLinearGradient(0, ly + height - bh, 0, ly + height);
    bg.addColorStop(0, cT); bg.addColorStop(1, c0);
    ctx.fillStyle = bg; ctx.fillRect(lx, ly + height - bh, width, bh);

    // Left
    const lg = ctx.createLinearGradient(lx, 0, lx + bw, 0);
    lg.addColorStop(0, c0); lg.addColorStop(1, cT);
    ctx.fillStyle = lg; ctx.fillRect(lx, ly, bw, height);

    // Right
    const rg = ctx.createLinearGradient(lx + width - bw, 0, lx + width, 0);
    rg.addColorStop(0, cT); rg.addColorStop(1, c0);
    ctx.fillStyle = rg; ctx.fillRect(lx + width - bw, ly, bw, height);

    ctx.restore();
}

/**
 * Применяет виньетку-прозрачность попиксельно к контексту tempCtx.
 * @param {CanvasRenderingContext2D} tempCtx
 * @param {number} w
 * @param {number} h
 * @param {object} config
 */
function applyTransparencyVignette(tempCtx, w, h, config) {
    const shape = config.shape || 'ellipse';
    const cx = (config.centerX / 100) * w;
    const cy = (config.centerY / 100) * h;
    const strength = config.intensity / 100;
    const sharpness = (config.sharpness || 50) / 100;

    // outerRadius defines where effect reaches max (as fraction of half max-dimension)
    const maxDim = Math.max(w, h) / 2;
    const outerR = maxDim * (config.outerRadius / 100);
    const innerR = outerR * (config.innerRadius / 100);
    const range = Math.max(outerR - innerR, 1);

    let alphaData = tempCtx.getImageData(0, 0, w, h);
    const aPixels = alphaData.data;

    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            let dist;
            if (shape === 'circle') {
                const r = Math.min(w, h) / 2;
                dist = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy)) / (r / maxDim);
            } else if (shape === 'rectangle') {
                // Chebyshev distance normalized to maxDim
                const rx = w / 2, ry = h / 2;
                dist = Math.max(Math.abs(px - cx) / (rx / maxDim), Math.abs(py - cy) / (ry / maxDim));
            } else {
                // ellipse
                const rx = w / 2, ry = h / 2;
                const nx = (px - cx) / rx;
                const ny = (py - cy) / ry;
                dist = Math.sqrt(nx * nx + ny * ny) * maxDim;
            }

            if (dist > innerR) {
                const t = Math.min(1, (dist - innerR) / range);
                const curved = applyFalloffCurve(t, config.falloffCurve);
                const alphaFactor = 1 - curved * strength;
                const idx = (py * w + px) * 4;
                aPixels[idx + 3] = Math.max(0, Math.round(aPixels[idx + 3] * alphaFactor));
            }
        }
    }
    tempCtx.putImageData(alphaData, 0, 0);
}

function drawLayer(layer) {
    ctx.save();
    
    // Применяем режим наложения и прозрачность
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode;
    
    // Используем изображение с применённой ориентацией
    const orientedImage = getOrientedImage(layer);
    if (!orientedImage) {
        ctx.restore();
        return;
    }

    const width = orientedImage.width * layer.scale;
    const height = orientedImage.height * layer.scale;
    
    // Трансформации
    ctx.translate(layer.x + width / 2, layer.y + height / 2);
    ctx.rotate(layer.rotation * Math.PI / 180);
    if (layer.flipX) ctx.scale(-1, 1);
    ctx.translate(-(layer.x + width / 2), -(layer.y + height / 2));
    
    // Применяем фильтры к ориентированному изображению
    const filteredImage = applyFiltersToImage(layer, orientedImage);
    
    // CSS фильтры для blur
    if (layer.blur > 0) {
        ctx.filter = `blur(${layer.blur}px)`;
    }
    
    // Рисуем изображение с фильтрами
    ctx.drawImage(filteredImage, layer.x, layer.y, width, height);
    
    // Виньетирование (обратная совместимость: layer.vignette → vignetteDarken.intensity)
    const darkenConfig  = getVignetteConfig(layer, 'Darken');
    const lightenConfig = getVignetteConfig(layer, 'Lighten');
    // Also support legacy layer.vignette
    if ((layer.vignette || 0) > 0 && darkenConfig.intensity === 0) {
        darkenConfig.intensity = layer.vignette;
    }

    if (darkenConfig.intensity > 0) {
        applyGradientVignette(ctx, layer.x, layer.y, width, height, darkenConfig, 'Darken');
    }
    if (lightenConfig.intensity > 0) {
        applyGradientVignette(ctx, layer.x, layer.y, width, height, lightenConfig, 'Lighten');
    }
    
    ctx.restore();
    ctx.filter = 'none';
}

// ===== ПЕРЕТАСКИВАНИЕ СЛОЯ НА CANVAS =====
function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    return {
        x: x * (canvas.width / rect.width),
        y: y * (canvas.height / rect.height)
    };
}

function startDrag(e) {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex] || !layers[activeLayerIndex].image) return;
    if (layers[activeLayerIndex].locked) return;
    if (e.touches && e.touches.length > 1) return;
    // Не перетаскивать слой, если активен ластик
    if (typeof eraserState !== 'undefined' && eraserState.active) return;
    e.preventDefault();
    
    const coords = getCoords(e);
    isDragging = true;
    const layer = layers[activeLayerIndex];
    dragStartX = coords.x - layer.x;
    dragStartY = coords.y - layer.y;
}

function drag(e) {
    if (isDragging) {
        e.preventDefault();
        const coords = getCoords(e);
        
        layers[activeLayerIndex].x = coords.x - dragStartX;
        layers[activeLayerIndex].y = coords.y - dragStartY;
        
        updateControls();
        render();
    }
}

function endDrag() {
    isDragging = false;
}

// Регистрация обработчиков canvas — вызывается из app.js после определения глобальных переменных
function initCanvasHandlers() {
    canvas.addEventListener('mousedown', startDrag);
    canvas.addEventListener('touchstart', startDrag);
    canvas.addEventListener('mousemove', drag);
    canvas.addEventListener('touchmove', drag);
    canvas.addEventListener('mouseup', endDrag);
    canvas.addEventListener('touchend', endDrag);
    canvas.addEventListener('mouseleave', endDrag);
}

// ===== ОРИЕНТАЦИЯ ХОЛСТА =====

function setCanvasOrientation(orientation) {
    canvasOrientation = orientation;
    document.querySelectorAll('.canvas-orientation-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.orientation === orientation);
    });
    updateCanvasSize();
    render();
}

function updateCanvasSize() {
    if (canvasOrientation === 'auto') {
        const dims = calculateAutoCanvasSize();
        canvas.width = dims.width;
        canvas.height = dims.height;
    } else {
        const size = CANVAS_SIZES[canvasOrientation];
        canvas.width = size.width;
        canvas.height = size.height;
    }
}

function calculateAutoCanvasSize() {
    let maxW = 1400, maxH = 900;
    layers.forEach(l => {
        if (l.image) {
            maxW = Math.max(maxW, l.x + l.image.width * l.scale + 100);
            maxH = Math.max(maxH, l.y + l.image.height * l.scale + 100);
        }
    });
    return { width: Math.min(maxW, 3000), height: Math.min(maxH, 3000) };
}
