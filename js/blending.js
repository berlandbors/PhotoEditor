/**
 * blending.js — алгоритмы попиксельного смешивания изображений через Canvas API
 *
 * Поддерживаемые режимы:
 *   Базовые:        average, additive, multiply, screen, overlay, difference
 *   Продвинутые:    lighten-only, darken-only, luminosity,
 *                   gradient-h, gradient-v, gradient-radial, gradient-conic, chroma-key
 *   Photoshop:      soft-light, color-burn, linear-burn, vivid-light, pin-light
 *   HSL-цветовые:   hue, saturation, color
 *   Математические: subtract, divide, exclusion
 *   Специальные:    grain-extract, grain-merge
 */

'use strict';

/* ─────────────── Вспомогательные утилиты ─────────────── */

/**
 * Зажать значение в диапазоне [0, 255]
 * @param {number} v
 * @returns {number}
 */
function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Яркость пикселя по формуле BT.601
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number} 0–255
 */
function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

/* ─────────────── Базовые алгоритмы ─────────────── */

/**
 * Average — усреднение цветов двух пикселей
 */
function blendAverage(r1, g1, b1, r2, g2, b2) {
    return {
        r: (r1 + r2) >> 1,
        g: (g1 + g2) >> 1,
        b: (b1 + b2) >> 1,
    };
}

/**
 * Additive — сложение с ограничением до 255
 */
function blendAdditive(r1, g1, b1, r2, g2, b2) {
    return {
        r: clamp(r1 + r2),
        g: clamp(g1 + g2),
        b: clamp(b1 + b2),
    };
}

/**
 * Multiply — умножение (нормализованное к [0, 255])
 */
function blendMultiply(r1, g1, b1, r2, g2, b2) {
    return {
        r: (r1 * r2) / 255 | 0,
        g: (g1 * g2) / 255 | 0,
        b: (b1 * b2) / 255 | 0,
    };
}

/**
 * Screen — осветление
 */
function blendScreen(r1, g1, b1, r2, g2, b2) {
    return {
        r: 255 - (((255 - r1) * (255 - r2)) / 255 | 0),
        g: 255 - (((255 - g1) * (255 - g2)) / 255 | 0),
        b: 255 - (((255 - b1) * (255 - b2)) / 255 | 0),
    };
}

/**
 * Overlay — наложение с контрастом (зависит от базового цвета)
 */
function blendOverlay(r1, g1, b1, r2, g2, b2) {
    return {
        r: r1 < 128
            ? (2 * r1 * r2) / 255 | 0
            : 255 - (2 * (255 - r1) * (255 - r2) / 255 | 0),
        g: g1 < 128
            ? (2 * g1 * g2) / 255 | 0
            : 255 - (2 * (255 - g1) * (255 - g2) / 255 | 0),
        b: b1 < 128
            ? (2 * b1 * b2) / 255 | 0
            : 255 - (2 * (255 - b1) * (255 - b2) / 255 | 0),
    };
}

/**
 * Difference — абсолютная разница
 */
function blendDifference(r1, g1, b1, r2, g2, b2) {
    return {
        r: Math.abs(r1 - r2),
        g: Math.abs(g1 - g2),
        b: Math.abs(b1 - b2),
    };
}

/* ─────────────── Продвинутые режимы ─────────────── */

/**
 * Lighten Only — выбирает более светлый пиксель покомпонентно
 */
function blendLightenOnly(r1, g1, b1, r2, g2, b2) {
    return {
        r: Math.max(r1, r2),
        g: Math.max(g1, g2),
        b: Math.max(b1, b2),
    };
}

/**
 * Darken Only — выбирает более тёмный пиксель покомпонентно
 */
function blendDarkenOnly(r1, g1, b1, r2, g2, b2) {
    return {
        r: Math.min(r1, r2),
        g: Math.min(g1, g2),
        b: Math.min(b1, b2),
    };
}

/**
 * Luminosity Blend — смешивание по яркости:
 * использует цвет первого изображения, но яркость второго.
 */
function blendLuminosity(r1, g1, b1, r2, g2, b2) {
    const lum1 = luminance(r1, g1, b1);
    const lum2 = luminance(r2, g2, b2);
    const delta = lum2 - lum1;
    return {
        r: clamp(r1 + delta),
        g: clamp(g1 + delta),
        b: clamp(b1 + delta),
    };
}

/* ─────────────── Градиентные маски ─────────────── */

/**
 * Gradient Horizontal — плавный переход слева (img1) направо (img2)
 * @param {number} x — координата пикселя
 * @param {number} w — ширина холста
 */
function blendGradientH(r1, g1, b1, r2, g2, b2, x, w) {
    const t = x / Math.max(w - 1, 1);
    const s = 1 - t;
    return {
        r: clamp(r1 * s + r2 * t),
        g: clamp(g1 * s + g2 * t),
        b: clamp(b1 * s + b2 * t),
    };
}

/**
 * Gradient Vertical — плавный переход сверху (img1) вниз (img2)
 * @param {number} y — координата пикселя
 * @param {number} h — высота холста
 */
function blendGradientV(r1, g1, b1, r2, g2, b2, y, h) {
    const t = y / Math.max(h - 1, 1);
    const s = 1 - t;
    return {
        r: clamp(r1 * s + r2 * t),
        g: clamp(g1 * s + g2 * t),
        b: clamp(b1 * s + b2 * t),
    };
}

/**
 * Gradient Radial — img1 в центре, img2 по краям
 * @param {number} x, y — координаты пикселя
 * @param {number} w, h — размеры холста
 */
function blendGradientRadial(r1, g1, b1, r2, g2, b2, x, y, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    const t = Math.min(dist / maxDist, 1);
    const s = 1 - t;
    return {
        r: clamp(r1 * s + r2 * t),
        g: clamp(g1 * s + g2 * t),
        b: clamp(b1 * s + b2 * t),
    };
}

/* ─────────────── Chroma Key ─────────────── */

/**
 * Chroma Key (Green Screen) — заменяет зелёный фон первого изображения вторым.
 * @param {object} options — { threshold: 80 }
 */
function blendChromaKey(r1, g1, b1, r2, g2, b2, options) {
    const threshold = (options && options.threshold) || 80;
    const isGreen = g1 > threshold && g1 > r1 * 1.2 && g1 > b1 * 1.2;
    return isGreen
        ? { r: r2, g: g2, b: b2 }
        : { r: r1, g: g1, b: b1 };
}

/* ─────────────── Photoshop-режимы ─────────────── */

/**
 * Soft Light — мягкое затемнение/осветление (алгоритм Photoshop)
 */
function blendSoftLight(r1, g1, b1, r2, g2, b2) {
    function softCh(base, top) {
        const b = base / 255;
        const t = top / 255;
        let r;
        if (t < 0.5) {
            r = 2 * b * t + b * b * (1 - 2 * t);
        } else {
            r = 2 * b * (1 - t) + Math.sqrt(b) * (2 * t - 1);
        }
        return clamp(r * 255 + 0.5 | 0);
    }
    return { r: softCh(r1, r2), g: softCh(g1, g2), b: softCh(b1, b2) };
}

/**
 * Color Burn — затемнение основы
 */
function blendColorBurn(r1, g1, b1, r2, g2, b2) {
    function burnCh(base, top) {
        if (top === 0) return 0;
        return clamp(255 - ((255 - base) * 255 / top + 0.5 | 0));
    }
    return { r: burnCh(r1, r2), g: burnCh(g1, g2), b: burnCh(b1, b2) };
}

/**
 * Linear Burn — линейное затемнение
 */
function blendLinearBurn(r1, g1, b1, r2, g2, b2) {
    return {
        r: clamp(r1 + r2 - 255),
        g: clamp(g1 + g2 - 255),
        b: clamp(b1 + b2 - 255),
    };
}

/**
 * Vivid Light — яркий свет (Color Burn + Color Dodge)
 */
function blendVividLight(r1, g1, b1, r2, g2, b2) {
    function vividCh(base, top) {
        if (top < 128) {
            // Color Burn with top * 2
            const t2 = top * 2;
            if (t2 === 0) return 0;
            return clamp(255 - ((255 - base) * 255 / t2 + 0.5 | 0));
        } else {
            // Color Dodge with (top - 128) * 2
            const t2 = (top - 128) * 2;
            if (t2 === 255) return 255;
            return clamp((base * 255 / (255 - t2)) + 0.5 | 0);
        }
    }
    return { r: vividCh(r1, r2), g: vividCh(g1, g2), b: vividCh(b1, b2) };
}

/**
 * Pin Light — точечный свет
 */
function blendPinLight(r1, g1, b1, r2, g2, b2) {
    function pinCh(base, top) {
        if (top < 128) {
            return Math.min(base, 2 * top);
        } else {
            return Math.max(base, 2 * (top - 128));
        }
    }
    return { r: pinCh(r1, r2), g: pinCh(g1, g2), b: pinCh(b1, b2) };
}

/* ─────────────── HSL-утилиты для цветовых режимов ─────────────── */

/**
 * Конвертация RGB [0–255] → HSL [h:0–360, s:0–1, l:0–1]
 */
function rgbToHsl(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
            case gn: h = ((bn - rn) / d + 2) / 6; break;
            default: h = ((rn - gn) / d + 4) / 6; break;
        }
    }
    return { h: h * 360, s, l };
}

/**
 * Конвертация HSL [h:0–360, s:0–1, l:0–1] → RGB [0–255]
 */
function hslToRgb(h, s, l) {
    const hue = h / 360;
    function hue2rgb(p, q, t) {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1/6) return p + (q - p) * 6 * tt;
        if (tt < 1/2) return q;
        if (tt < 2/3) return p + (q - p) * (2/3 - tt) * 6;
        return p;
    }
    if (s === 0) {
        const v = clamp(l * 255 + 0.5 | 0);
        return { r: v, g: v, b: v };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
        r: clamp(hue2rgb(p, q, hue + 1/3) * 255 + 0.5 | 0),
        g: clamp(hue2rgb(p, q, hue) * 255 + 0.5 | 0),
        b: clamp(hue2rgb(p, q, hue - 1/3) * 255 + 0.5 | 0),
    };
}

/* ─────────────── HSL-цветовые режимы ─────────────── */

/**
 * Hue — оттенок верхнего + насыщенность и яркость нижнего
 */
function blendHue(r1, g1, b1, r2, g2, b2) {
    const hsl1 = rgbToHsl(r1, g1, b1);
    const hsl2 = rgbToHsl(r2, g2, b2);
    return hslToRgb(hsl2.h, hsl1.s, hsl1.l);
}

/**
 * Saturation — насыщенность верхнего + оттенок и яркость нижнего
 */
function blendSaturation(r1, g1, b1, r2, g2, b2) {
    const hsl1 = rgbToHsl(r1, g1, b1);
    const hsl2 = rgbToHsl(r2, g2, b2);
    return hslToRgb(hsl1.h, hsl2.s, hsl1.l);
}

/**
 * Color — оттенок и насыщенность верхнего + яркость нижнего
 */
function blendColor(r1, g1, b1, r2, g2, b2) {
    const hsl1 = rgbToHsl(r1, g1, b1);
    const hsl2 = rgbToHsl(r2, g2, b2);
    return hslToRgb(hsl2.h, hsl2.s, hsl1.l);
}

/* ─────────────── Математические режимы ─────────────── */

/**
 * Subtract — вычитание с ограничением
 */
function blendSubtract(r1, g1, b1, r2, g2, b2) {
    return {
        r: clamp(r1 - r2),
        g: clamp(g1 - g2),
        b: clamp(b1 - b2),
    };
}

/**
 * Divide — деление
 */
function blendDivide(r1, g1, b1, r2, g2, b2) {
    function divCh(base, top) {
        if (top === 0) return 255;
        return clamp((base * 255 / top) + 0.5 | 0);
    }
    return { r: divCh(r1, r2), g: divCh(g1, g2), b: divCh(b1, b2) };
}

/**
 * Exclusion — исключение (мягкая версия Difference)
 */
function blendExclusion(r1, g1, b1, r2, g2, b2) {
    return {
        r: clamp(r1 + r2 - 2 * r1 * r2 / 255 + 0.5 | 0),
        g: clamp(g1 + g2 - 2 * g1 * g2 / 255 + 0.5 | 0),
        b: clamp(b1 + b2 - 2 * b1 * b2 / 255 + 0.5 | 0),
    };
}

/* ─────────────── Специализированные режимы ─────────────── */

/**
 * Grain Extract — извлечение зерна/текстуры
 */
function blendGrainExtract(r1, g1, b1, r2, g2, b2) {
    return {
        r: clamp(r1 - r2 + 128),
        g: clamp(g1 - g2 + 128),
        b: clamp(b1 - b2 + 128),
    };
}

/**
 * Grain Merge — слияние зерна (обратная к Grain Extract)
 */
function blendGrainMerge(r1, g1, b1, r2, g2, b2) {
    return {
        r: clamp(r1 + r2 - 128),
        g: clamp(g1 + g2 - 128),
        b: clamp(b1 + b2 - 128),
    };
}

/* ─────────────── Угловой градиент ─────────────── */

/**
 * Conic Gradient — угловой (конический) градиент
 * @param {number} x, y — координаты пикселя
 * @param {number} w, h — размеры холста
 */
function blendGradientConic(r1, g1, b1, r2, g2, b2, x, y, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const angle = Math.atan2(y - cy, x - cx);
    // Нормализуем угол к [0, 1]: atan2 возвращает [-π, π]
    const t = (angle + Math.PI) / (2 * Math.PI);
    const s = 1 - t;
    return {
        r: clamp(r1 * s + r2 * t),
        g: clamp(g1 * s + g2 * t),
        b: clamp(b1 * s + b2 * t),
    };
}

/* ─────────────── Главный диспетчер ─────────────── */

/**
 * Применить заданный режим смешивания к паре значений RGB одного пикселя.
 *
 * @param {string} mode
 * @param {number} r1, g1, b1 — каналы пикселя из первого изображения
 * @param {number} r2, g2, b2 — каналы пикселя из второго изображения
 * @param {object} pixelCtx   — контекст пикселя: { x, y, w, h, options }
 * @returns {{ r, g, b }}
 */
function applyBlendMode(mode, r1, g1, b1, r2, g2, b2, pixelCtx) {
    switch (mode) {
        case 'average':         return blendAverage(r1, g1, b1, r2, g2, b2);
        case 'additive':        return blendAdditive(r1, g1, b1, r2, g2, b2);
        case 'multiply':        return blendMultiply(r1, g1, b1, r2, g2, b2);
        case 'screen':          return blendScreen(r1, g1, b1, r2, g2, b2);
        case 'overlay':         return blendOverlay(r1, g1, b1, r2, g2, b2);
        case 'difference':      return blendDifference(r1, g1, b1, r2, g2, b2);
        case 'lighten-only':    return blendLightenOnly(r1, g1, b1, r2, g2, b2);
        case 'darken-only':     return blendDarkenOnly(r1, g1, b1, r2, g2, b2);
        case 'luminosity':      return blendLuminosity(r1, g1, b1, r2, g2, b2);
        case 'gradient-h':      return blendGradientH(r1, g1, b1, r2, g2, b2, pixelCtx.x, pixelCtx.w);
        case 'gradient-v':      return blendGradientV(r1, g1, b1, r2, g2, b2, pixelCtx.y, pixelCtx.h);
        case 'gradient-radial': return blendGradientRadial(r1, g1, b1, r2, g2, b2, pixelCtx.x, pixelCtx.y, pixelCtx.w, pixelCtx.h);
        case 'gradient-conic':  return blendGradientConic(r1, g1, b1, r2, g2, b2, pixelCtx.x, pixelCtx.y, pixelCtx.w, pixelCtx.h);
        case 'chroma-key':      return blendChromaKey(r1, g1, b1, r2, g2, b2, pixelCtx.options);
        // Photoshop режимы
        case 'soft-light':      return blendSoftLight(r1, g1, b1, r2, g2, b2);
        case 'color-burn':      return blendColorBurn(r1, g1, b1, r2, g2, b2);
        case 'linear-burn':     return blendLinearBurn(r1, g1, b1, r2, g2, b2);
        case 'vivid-light':     return blendVividLight(r1, g1, b1, r2, g2, b2);
        case 'pin-light':       return blendPinLight(r1, g1, b1, r2, g2, b2);
        // HSL-цветовые режимы
        case 'hue':             return blendHue(r1, g1, b1, r2, g2, b2);
        case 'saturation':      return blendSaturation(r1, g1, b1, r2, g2, b2);
        case 'color':           return blendColor(r1, g1, b1, r2, g2, b2);
        // Математические режимы
        case 'subtract':        return blendSubtract(r1, g1, b1, r2, g2, b2);
        case 'divide':          return blendDivide(r1, g1, b1, r2, g2, b2);
        case 'exclusion':       return blendExclusion(r1, g1, b1, r2, g2, b2);
        // Специализированные режимы
        case 'grain-extract':   return blendGrainExtract(r1, g1, b1, r2, g2, b2);
        case 'grain-merge':     return blendGrainMerge(r1, g1, b1, r2, g2, b2);
        default:                return blendAverage(r1, g1, b1, r2, g2, b2);
    }
}

/* ─────────────── Основная функция ─────────────── */

/**
 * Смешать два HTMLCanvasElement попиксельно.
 *
 * @param {HTMLCanvasElement} canvas1 — первое изображение (нижний слой)
 * @param {HTMLCanvasElement} canvas2 — второе изображение (верхний слой)
 * @param {string} mode               — режим смешивания из списка выше
 * @param {number} [opacity=1]        — прозрачность верхнего слоя (0.0–1.0)
 * @param {object} [opts]             — дополнительные параметры (например { threshold })
 * @returns {HTMLCanvasElement}       — холст с результатом
 */
function blendImages(canvas1, canvas2, mode, opacity, opts) {
    const W = canvas1.width;
    const H = canvas1.height;

    const offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = H;
    const c = offscreen.getContext('2d');

    // Считываем пиксели первого слоя
    c.drawImage(canvas1, 0, 0);
    const data1 = c.getImageData(0, 0, W, H).data;

    // Считываем пиксели второго слоя
    c.clearRect(0, 0, W, H);
    c.drawImage(canvas2, 0, 0);
    const data2 = c.getImageData(0, 0, W, H).data;

    // Создаём результирующий ImageData
    const result = c.createImageData(W, H);
    const out = result.data;

    // Прозрачность: интерполяция между слоем 1 и результатом смешивания
    const blendAmount = opacity !== undefined ? opacity : 1;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;

            const r1 = data1[i],     g1 = data1[i + 1], b1 = data1[i + 2];
            const r2 = data2[i],     g2 = data2[i + 1], b2 = data2[i + 2];

            const px = applyBlendMode(mode, r1, g1, b1, r2, g2, b2, {
                x, y, w: W, h: H, options: opts
            });

            // Если opacity < 1 — интерполируем между img1 и результатом
            out[i]     = clamp(r1 + (px.r - r1) * blendAmount);
            out[i + 1] = clamp(g1 + (px.g - g1) * blendAmount);
            out[i + 2] = clamp(b1 + (px.b - b1) * blendAmount);
            out[i + 3] = 255;
        }
    }

    c.putImageData(result, 0, 0);
    return offscreen;
}

/* ─────────────── Экспорт ─────────────── */

// Сделать функции доступными глобально (модуль без сборщика)
window.BlendingEngine = {
    blendImages,
    applyBlendMode,
};
