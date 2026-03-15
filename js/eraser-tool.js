/**
 * eraser-tool.js — интерактивный инструмент ластика
 */

'use strict';

var eraserState = {
    active: false,           // Активен ли инструмент
    isErasing: false,        // Идёт ли сейчас рисование
    brushSize: 20,           // Размер кисти (px)
    brushHardness: 0,        // Жёсткость (0-100, 0=мягкая, 100=жёсткая)
    brushOpacity: 100,       // Прозрачность кисти (10-100%)
    mode: 'erase',           // 'erase' | 'restore' | 'smart' | 'refine'
    featherMode: 'cosine',   // 'cosine' | 'quadratic' | 'linear' | 'cubic'
    featherRadius: 2.5,      // Множитель радиуса для расширенной растушевки (1.0-5.0)
    smartEdgeDetection: true,      // Включить защиту от растекания через края
    smartEdgeSensitivity: 30,      // Чувствительность краёв (1-100, чем выше - тем строже)
    smartRespectAlpha: true,       // Учитывать прозрачность
    smartGradientTolerance: true,  // Плавное затухание вместо жёсткого порога
    refineMode: 'blur',            // 'blur' | 'feather' | 'smooth' | 'contrast'
    refineStrength: 50,            // Сила обработки (1-100%)
    refineRadius: 5,               // Радиус воздействия (1-20px)
    refinePreserveColor: true,     // Сохранять цвет, изменять только альфа-канал
    lastX: 0,
    lastY: 0,
    originalImageData: null, // Резервная копия для восстановления
    editCanvas: null,        // Постоянный canvas для синхронного редактирования
    editCtx: null,           // Контекст editCanvas
    editLayerIndex: -1,      // Индекс слоя, к которому привязан editCanvas
    history: [],             // История изменений
    historyIndex: -1,
    maxHistory: 20
};

/**
 * Инициализировать (или обновить) editCanvas из текущего layer.image
 */
function initEditCanvas() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.image) return false;

    // Пересоздаём canvas если слой сменился или ещё не создан
    if (eraserState.editLayerIndex !== activeLayerIndex || !eraserState.editCanvas) {
        var imgW = layer.image.naturalWidth || layer.image.width;
        var imgH = layer.image.naturalHeight || layer.image.height;
        if (!imgW || !imgH) {
            showHint('Изображение слоя не готово, попробуйте ещё раз');
            return false;
        }

        var ec = document.createElement('canvas');
        var ectx = ec.getContext('2d');
        ec.width = imgW;
        ec.height = imgH;
        ectx.drawImage(layer.image, 0, 0);
        eraserState.editCanvas = ec;
        eraserState.editCtx = ectx;
        eraserState.editLayerIndex = activeLayerIndex;
        console.log('[Eraser] initEditCanvas created:', imgW, 'x', imgH, 'for layer', activeLayerIndex);
    }
    return true;
}

/**
 * Активировать инструмент ластика
 */
function activateEraser() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.image) {
        showHint('Выберите слой с изображением для использования ластика');
        return;
    }

    console.log('[Eraser] Activating eraser for layer', activeLayerIndex);
    eraserState.active = true;

    // Сохранить оригинал активного слоя
    var tempCanvas = document.createElement('canvas');
    var tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.image.naturalWidth || layer.image.width;
    tempCanvas.height = layer.image.naturalHeight || layer.image.height;
    tempCtx.drawImage(layer.image, 0, 0);
    eraserState.originalImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    // Сбросить editCanvas — он будет инициализирован при первом штрихе
    eraserState.editCanvas = null;
    eraserState.editCtx = null;
    eraserState.editLayerIndex = -1;
    eraserState.history = [];
    eraserState.historyIndex = -1;

    // Изменить курсор
    canvas.style.cursor = 'none';
    canvas.classList.add('eraser-active');

    // Подписаться на события мыши
    canvas.addEventListener('mousedown', startErasing);
    canvas.addEventListener('mousemove', continueErasing);
    canvas.addEventListener('mouseup', stopErasing);
    canvas.addEventListener('mouseleave', stopErasing);

    // Подписаться на события тача
    canvas.addEventListener('touchstart', startErasing, { passive: false });
    canvas.addEventListener('touchmove', continueErasing, { passive: false });
    canvas.addEventListener('touchend', stopErasing);
    canvas.addEventListener('touchcancel', stopErasing);

    console.log('[Eraser] Eraser activated, originalImageData saved:', tempCanvas.width, 'x', tempCanvas.height);
    showHint('Ластик активирован. ЛКМ/Тап — стереть, ПКМ — восстановить');
}

/**
 * Деактивировать ластик
 */
function deactivateEraser() {
    eraserState.active = false;
    eraserState.isErasing = false;

    canvas.style.cursor = '';
    canvas.classList.remove('eraser-active');

    // Отписаться от событий мыши
    canvas.removeEventListener('mousedown', startErasing);
    canvas.removeEventListener('mousemove', continueErasing);
    canvas.removeEventListener('mouseup', stopErasing);
    canvas.removeEventListener('mouseleave', stopErasing);

    // Отписаться от событий тача
    canvas.removeEventListener('touchstart', startErasing);
    canvas.removeEventListener('touchmove', continueErasing);
    canvas.removeEventListener('touchend', stopErasing);
    canvas.removeEventListener('touchcancel', stopErasing);

    // Перерисовать без курсора кисти
    render();

    console.log('[Eraser] Eraser deactivated');
    showHint('Ластик выключен');
}

/**
 * Начать стирание (mousedown)
 */
function startErasing(e) {
    if (!eraserState.active) return;

    e.preventDefault();
    e.stopPropagation(); // Предотвратить конфликт с перетаскиванием слоя
    eraserState.isErasing = true;

    // ПКМ = восстановление
    if (e.button === 2) {
        eraserState.mode = 'restore';
    } else {
        eraserState.mode = document.getElementById('eraserMode').value;
    }

    var coords = getEraserCoords(e);
    var x = coords.x;
    var y = coords.y;

    eraserState.lastX = x;
    eraserState.lastY = y;

    // Инициализировать editCanvas перед первым штрихом
    if (!initEditCanvas()) {
        eraserState.isErasing = false;
        return;
    }

    // Сохранить состояние в историю
    saveEraserHistory();

    // Если умный ластик — удалить похожие цвета
    if (eraserState.mode === 'smart') {
        applySmartErase(x, y);
    } else if (eraserState.mode === 'refine') {
        applyEdgeRefine(x, y);
    } else {
        applyErase(x, y);
    }
}

/**
 * Продолжить стирание (mousemove)
 */
function continueErasing(e) {
    if (!eraserState.active) return;

    var coords = getEraserCoords(e);
    var x = coords.x;
    var y = coords.y;

    if (!eraserState.isErasing) {
        // Только показываем курсор, не стираем
        drawBrushCursor(x, y);
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Сначала применяем стирание, затем отображаем результат с курсором
    interpolateErase(eraserState.lastX, eraserState.lastY, x, y);

    eraserState.lastX = x;
    eraserState.lastY = y;

    // Показать обновлённое состояние и курсор кисти
    drawBrushCursor(x, y);
}

/**
 * Остановить стирание (mouseup / mouseleave)
 */
function stopErasing(e) {
    if (eraserState.isErasing) {
        eraserState.isErasing = false;
        commitEraseToLayer();
    }
}

/**
 * Интерполяция — плавная линия между двумя точками
 */
function interpolateErase(x1, y1, x2, y2) {
    var distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    var steps = Math.max(1, Math.ceil(distance / 2)); // Шаг 2px

    for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        var x = x1 + (x2 - x1) * t;
        var y = y1 + (y2 - y1) * t;
        if (eraserState.mode === 'refine') {
            applyEdgeRefine(x, y);
        } else {
            applyErase(x, y);
        }
    }
}

/**
 * Применить стирание/восстановление в точке (x, y)
 * Работает напрямую с eraserState.editCanvas (синхронно, без race condition)
 */
function applyErase(x, y) {
    var layer = layers[activeLayerIndex];
    if (!layer || !eraserState.editCanvas || eraserState.editLayerIndex !== activeLayerIndex) return;

    // Получить координаты в системе слоя
    var layerX = Math.round((x - layer.x) / layer.scale);
    var layerY = Math.round((y - layer.y) / layer.scale);

    var ec = eraserState.editCanvas;
    var ectx = eraserState.editCtx;

    var brushRadius = eraserState.brushSize / 2;
    if (brushRadius <= 0) return;
    var hardness = eraserState.brushHardness / 100;
    var opacity = eraserState.brushOpacity / 100;

    // Расширенный радиус для плавной растушевки
    var effectiveRadius = brushRadius * eraserState.featherRadius;
    var margin = Math.ceil(effectiveRadius) + 1;
    var x1 = Math.max(0, layerX - margin);
    var y1 = Math.max(0, layerY - margin);
    var x2 = Math.min(ec.width, layerX + margin + 1);
    var y2 = Math.min(ec.height, layerY + margin + 1);
    var localW = x2 - x1;
    var localH = y2 - y1;
    if (localW <= 0 || localH <= 0) return;

    var imageData = ectx.getImageData(x1, y1, localW, localH);
    var data = imageData.data;

    var origData = (eraserState.mode === 'restore' && eraserState.originalImageData)
        ? eraserState.originalImageData.data : null;

    var dyInt, dxInt;
    for (dyInt = Math.ceil(-effectiveRadius); dyInt <= Math.floor(effectiveRadius); dyInt++) {
        for (dxInt = Math.ceil(-effectiveRadius); dxInt <= Math.floor(effectiveRadius); dxInt++) {
            var px = layerX + dxInt;
            var py = layerY + dyInt;

            if (px < x1 || px >= x2 || py < y1 || py >= y2) continue;

            var distance = Math.sqrt(dxInt * dxInt + dyInt * dyInt);
            if (distance > effectiveRadius) continue;

            // Вычислить силу стирания (с учётом мягкости и плавной кривой)
            // hardness=0 → мягкая кисть (плавная растушёвка), hardness=1 → жёсткая
            var strength = 1;
            var normalizedDistance = distance / brushRadius; // 0..featherRadius (typically 1.2)

            if (hardness < 1) {
                if (normalizedDistance <= hardness) {
                    // Жёсткая зона: полная сила
                    strength = 1;
                } else {
                    // Мягкая зона: плавное затухание с выбранной кривой
                    var maxDist = eraserState.featherRadius; // Максимальное расстояние для растушевки
                    if (normalizedDistance < maxDist) {
                        var t = (normalizedDistance - hardness) / (maxDist - hardness);
                        // Применить сглаживание для более широкого диапазона
                        // Показатель < 1 расширяет зону мягкого перехода (0.7 — экспериментально подобранное значение)
                        t = Math.pow(t, 0.7);
                        strength = calculateFeatherStrength(t, eraserState.featherMode);
                    } else {
                        strength = 0;
                    }
                }
            } else {
                // Полностью жёсткая кисть
                strength = 1;
            }

            strength *= opacity;

            // Индекс в локальной области
            var localPx = px - x1;
            var localPy = py - y1;
            var idx = (localPy * localW + localPx) * 4;

            if (origData) {
                // Восстановить из оригинала
                var origIdx = (py * ec.width + px) * 4;
                data[idx]     = eraserLerp(data[idx],     origData[origIdx],     strength);
                data[idx + 1] = eraserLerp(data[idx + 1], origData[origIdx + 1], strength);
                data[idx + 2] = eraserLerp(data[idx + 2], origData[origIdx + 2], strength);
                data[idx + 3] = eraserLerp(data[idx + 3], origData[origIdx + 3], strength);
            } else {
                // Стирание — плавное затухание альфа-канала
                data[idx + 3] = Math.round(data[idx + 3] * (1 - strength));
            }
        }
    }

    ectx.putImageData(imageData, x1, y1);
}

/**
 * Вычислить силу края (градиент яркости) между двумя пикселями
 */
function calculateEdgeStrength(data, idx1, idx2) {
    var lum1 = 0.299 * data[idx1] + 0.587 * data[idx1 + 1] + 0.114 * data[idx1 + 2];
    var lum2 = 0.299 * data[idx2] + 0.587 * data[idx2 + 1] + 0.114 * data[idx2 + 2];
    var lumDiff = Math.abs(lum1 - lum2);
    var colorDiff = Math.sqrt(
        Math.pow(data[idx1] - data[idx2], 2) +
        Math.pow(data[idx1 + 1] - data[idx2 + 1], 2) +
        Math.pow(data[idx1 + 2] - data[idx2 + 2], 2)
    );
    var alphaDiff = Math.abs(data[idx1 + 3] - data[idx2 + 3]);
    return Math.max(lumDiff, colorDiff / 3, alphaDiff);
}

/**
 * Проверить, есть ли край между двумя пикселями
 */
function isEdgeBetween(data, width, x1, y1, x2, y2, sensitivity) {
    var idx1 = (y1 * width + x1) * 4;
    var idx2 = (y2 * width + x2) * 4;
    var edgeStrength = calculateEdgeStrength(data, idx1, idx2);
    // sensitivity 1-100 -> threshold 100-10 (scale 0.9 maps full range to 10..100)
    var threshold = 100 - sensitivity * 0.9;
    return edgeStrength > threshold;
}

/**
 * Применить Gaussian Blur к альфа-каналу в области
 */
function applyAlphaBlur(data, width, height, radius) {
    var output = new Uint8ClampedArray(data.length);
    for (var i = 0; i < data.length; i += 4) {
        output[i]     = data[i];
        output[i + 1] = data[i + 1];
        output[i + 2] = data[i + 2];
        output[i + 3] = data[i + 3];
    }

    var kernelSize = radius * 2 + 1;
    var sigma = radius / 3; // Стандартное правило: sigma ≈ radius/3 для гауссового ядра
    var kernel = [];
    var sum = 0;
    for (var ki = 0; ki < kernelSize; ki++) {
        var kx = ki - radius;
        var val = Math.exp(-(kx * kx) / (2 * sigma * sigma));
        kernel.push(val);
        sum += val;
    }
    for (var ki = 0; ki < kernel.length; ki++) {
        kernel[ki] /= sum;
    }

    var tempAlpha = new Uint8ClampedArray(width * height);
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var alphaSum = 0;
            var weightSum = 0;
            for (var k = 0; k < kernelSize; k++) {
                var sx = x + k - radius;
                if (sx >= 0 && sx < width) {
                    alphaSum += data[(y * width + sx) * 4 + 3] * kernel[k];
                    weightSum += kernel[k];
                }
            }
            tempAlpha[y * width + x] = Math.round(alphaSum / weightSum);
        }
    }

    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var alphaSum = 0;
            var weightSum = 0;
            for (var k = 0; k < kernelSize; k++) {
                var sy = y + k - radius;
                if (sy >= 0 && sy < height) {
                    alphaSum += tempAlpha[sy * width + x] * kernel[k];
                    weightSum += kernel[k];
                }
            }
            output[(y * width + x) * 4 + 3] = Math.round(alphaSum / weightSum);
        }
    }

    return output;
}

/**
 * Применить растушёвку к краям прозрачности
 */
function applyAlphaFeather(data, width, height, radius, strength) {
    var output = new Uint8ClampedArray(data);
    var strengthFactor = strength / 100;

    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var idx = (y * width + x) * 4;
            var alpha = data[idx + 3];

            if (alpha > 10 && alpha < 245) {
                var alphaSum = 0;
                var count = 0;

                for (var dy = -radius; dy <= radius; dy++) {
                    for (var dx = -radius; dx <= radius; dx++) {
                        var nx = x + dx;
                        var ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            var dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist <= radius) {
                                alphaSum += data[(ny * width + nx) * 4 + 3];
                                count++;
                            }
                        }
                    }
                }

                var avgAlpha = alphaSum / count;
                var newAlpha = alpha + (avgAlpha - alpha) * strengthFactor;
                var edgeFactor = 1 - Math.abs(alpha - 128) / 128;
                newAlpha = alpha + (newAlpha - alpha) * edgeFactor;
                output[idx + 3] = Math.round(Math.max(0, Math.min(255, newAlpha)));
            }
        }
    }

    return output;
}

/**
 * Применить сглаживание к альфа-каналу
 */
function applyAlphaSmooth(data, width, height, strength) {
    var output = new Uint8ClampedArray(data);
    var strengthFactor = strength / 100;

    for (var y = 1; y < height - 1; y++) {
        for (var x = 1; x < width - 1; x++) {
            var idx = (y * width + x) * 4 + 3;
            var alpha = data[idx];

            if (alpha > 10 && alpha < 245) {
                var top    = data[((y - 1) * width + x) * 4 + 3];
                var bottom = data[((y + 1) * width + x) * 4 + 3];
                var left   = data[(y * width + (x - 1)) * 4 + 3];
                var right  = data[(y * width + (x + 1)) * 4 + 3];
                var smoothed = (top + bottom + left + right + alpha * 4) / 8;
                var newAlpha = alpha + (smoothed - alpha) * strengthFactor;
                output[idx] = Math.round(Math.max(0, Math.min(255, newAlpha)));
            }
        }
    }

    return output;
}

/**
 * Изменить контрастность краёв
 */
function applyAlphaContrast(data, width, height, strength) {
    var output = new Uint8ClampedArray(data);
    var contrastFactor = (strength - 50) / 50; // -1..+1

    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var idx = (y * width + x) * 4 + 3;
            var alpha = data[idx];

            if (alpha > 0 && alpha < 255) {
                var normalized = (alpha / 255) * 2 - 1;
                var contrasted;
                if (contrastFactor > 0) {
                    contrasted = Math.sign(normalized) * Math.pow(Math.abs(normalized), 1 - contrastFactor * 0.5);
                } else {
                    contrasted = Math.sign(normalized) * Math.pow(Math.abs(normalized), 1 + Math.abs(contrastFactor) * 0.5);
                }
                var newAlpha = ((contrasted + 1) / 2) * 255;
                output[idx] = Math.round(Math.max(0, Math.min(255, newAlpha)));
            }
        }
    }

    return output;
}

/**
 * Умное стирание (удаление похожих цветов)
 * Работает с editCanvas синхронно.
 */
function applySmartErase(x, y) {
    var layer = layers[activeLayerIndex];
    if (!layer || !eraserState.editCanvas || eraserState.editLayerIndex !== activeLayerIndex) return;

    var layerX = Math.round((x - layer.x) / layer.scale);
    var layerY = Math.round((y - layer.y) / layer.scale);

    var ec = eraserState.editCanvas;
    var ectx = eraserState.editCtx;

    // Толерантность из UI
    var tolerance = parseInt(document.getElementById('smartEraseTolerance').value);

    // Удалить похожие цвета в радиусе кисти
    var brushRadius = eraserState.brushSize / 2;
    if (brushRadius <= 0) return;
    var hardness = eraserState.brushHardness / 100;
    var opacity = eraserState.brushOpacity / 100;

    // Расширенный радиус для плавной растушевки
    var effectiveRadius = brushRadius * eraserState.featherRadius;
    var margin = Math.ceil(effectiveRadius) + 1;
    var x1 = Math.max(0, layerX - margin);
    var y1 = Math.max(0, layerY - margin);
    var x2 = Math.min(ec.width, layerX + margin + 1);
    var y2 = Math.min(ec.height, layerY + margin + 1);
    var localW = x2 - x1;
    var localH = y2 - y1;
    if (localW <= 0 || localH <= 0) return;

    var imageData = ectx.getImageData(x1, y1, localW, localH);
    var data = imageData.data;

    // Получить цвет в точке клика из локальной области
    var clampedX = Math.min(Math.max(layerX, x1), x2 - 1);
    var clampedY = Math.min(Math.max(layerY, y1), y2 - 1);
    var startIdx = ((clampedY - y1) * localW + (clampedX - x1)) * 4;
    var targetR = data[startIdx];
    var targetG = data[startIdx + 1];
    var targetB = data[startIdx + 2];

    var effectiveRadiusCeil = Math.ceil(effectiveRadius);

    // Центральная точка в локальных координатах
    var centerLocalX = clampedX - x1;
    var centerLocalY = clampedY - y1;

    for (var dy = -effectiveRadiusCeil; dy <= effectiveRadiusCeil; dy++) {
        for (var dx = -effectiveRadiusCeil; dx <= effectiveRadiusCeil; dx++) {
            var px = layerX + dx;
            var py = layerY + dy;

            if (px < x1 || px >= x2 || py < y1 || py >= y2) continue;

            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > effectiveRadius) continue;

            var localPx = px - x1;
            var localPy = py - y1;
            var i = (localPy * localW + localPx) * 4;

            // Проверка на край между центром и текущим пикселем (если включено)
            if (eraserState.smartEdgeDetection && dist > 1) {
                var steps = Math.max(2, Math.floor(dist / 2)); // sample every ~2px along the path
                var hasEdge = false;

                for (var step = 1; step <= steps; step++) {
                    var frac = step / steps;
                    var checkX = Math.round(centerLocalX + (localPx - centerLocalX) * frac);
                    var checkY = Math.round(centerLocalY + (localPy - centerLocalY) * frac);
                    var prevX = Math.round(centerLocalX + (localPx - centerLocalX) * (frac - 1 / steps));
                    var prevY = Math.round(centerLocalY + (localPy - centerLocalY) * (frac - 1 / steps));

                    if (isEdgeBetween(data, localW, prevX, prevY, checkX, checkY, eraserState.smartEdgeSensitivity)) {
                        hasEdge = true;
                        break;
                    }
                }

                if (hasEdge) continue;
            }

            // Вычислить цветовую разницу
            var colorDist = Math.sqrt(
                Math.pow(data[i] - targetR, 2) +
                Math.pow(data[i + 1] - targetG, 2) +
                Math.pow(data[i + 2] - targetB, 2)
            );

            // Учитывать альфа-канал (если включено)
            if (eraserState.smartRespectAlpha) {
                var targetAlpha = data[startIdx + 3];
                var alphaDiff = Math.abs(data[i + 3] - targetAlpha);
                // Alpha differences weighted at 0.5 (half of RGB distance) to avoid over-penalising semi-transparent pixels
                colorDist += alphaDiff * 0.5;
            }

            if (colorDist <= tolerance) {
                // Растушёвка по краям кисти с улучшенными кривыми
                var strength = 1;
                var normalizedDist = dist / brushRadius; // 0..featherRadius (typically 1.2)

                if (hardness < 1) {
                    if (normalizedDist <= hardness) {
                        strength = 1;
                    } else {
                        var maxDist = eraserState.featherRadius;
                        if (normalizedDist < maxDist) {
                            var t = (normalizedDist - hardness) / (maxDist - hardness);
                            // Применить сглаживание для более широкого диапазона
                            t = Math.pow(t, 0.7);
                            strength = calculateFeatherStrength(t, eraserState.featherMode);
                        } else {
                            strength = 0;
                        }
                    }
                } else {
                    strength = 1;
                }
                strength *= opacity;

                // Плавное затухание силы стирания в зависимости от colorDist
                if (eraserState.smartGradientTolerance) {
                    strength *= (1 - colorDist / tolerance);
                }

                data[i + 3] = Math.round(data[i + 3] * (1 - strength));
            }
        }
    }

    ectx.putImageData(imageData, x1, y1);
}

/**
 * Применить обработку краёв (Refine Mode)
 * Динамически изменяет края прозрачности без дополнительного стирания
 */
function applyEdgeRefine(x, y) {
    var layer = layers[activeLayerIndex];
    if (!layer || !eraserState.editCanvas || eraserState.editLayerIndex !== activeLayerIndex) return;

    var layerX = Math.round((x - layer.x) / layer.scale);
    var layerY = Math.round((y - layer.y) / layer.scale);

    var ec = eraserState.editCanvas;
    var ectx = eraserState.editCtx;

    var brushRadius = eraserState.brushSize / 2;
    if (brushRadius <= 0) return;

    var processRadius = Math.max(brushRadius, eraserState.refineRadius * 2);
    var margin = Math.ceil(processRadius) + eraserState.refineRadius + 5;
    var x1 = Math.max(0, layerX - margin);
    var y1 = Math.max(0, layerY - margin);
    var x2 = Math.min(ec.width, layerX + margin + 1);
    var y2 = Math.min(ec.height, layerY + margin + 1);
    var localW = x2 - x1;
    var localH = y2 - y1;
    if (localW <= 0 || localH <= 0) return;

    var imageData = ectx.getImageData(x1, y1, localW, localH);
    var data = imageData.data;

    var mask = new Uint8ClampedArray(localW * localH);
    var centerLocalX = layerX - x1;
    var centerLocalY = layerY - y1;

    for (var ly = 0; ly < localH; ly++) {
        for (var lx = 0; lx < localW; lx++) {
            var dx = lx - centerLocalX;
            var dy = ly - centerLocalY;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= brushRadius) {
                var mstrength = 1;
                if (dist > brushRadius * 0.5) {
                    var mt = (dist - brushRadius * 0.5) / (brushRadius * 0.5);
                    mstrength = 1 - (mt * mt);
                }
                mask[ly * localW + lx] = Math.round(mstrength * 255);
            }
        }
    }

    var processedData;
    switch (eraserState.refineMode) {
        case 'blur':
            processedData = applyAlphaBlur(data, localW, localH, eraserState.refineRadius);
            break;
        case 'feather':
            processedData = applyAlphaFeather(data, localW, localH, eraserState.refineRadius, eraserState.refineStrength);
            break;
        case 'smooth':
            processedData = applyAlphaSmooth(data, localW, localH, eraserState.refineStrength);
            break;
        case 'contrast':
            processedData = applyAlphaContrast(data, localW, localH, eraserState.refineStrength);
            break;
        default:
            processedData = data;
    }

    var strengthFactor = eraserState.refineStrength / 100;
    for (var ly = 0; ly < localH; ly++) {
        for (var lx = 0; lx < localW; lx++) {
            var idx = (ly * localW + lx) * 4;
            var maskValue = mask[ly * localW + lx] / 255;
            if (maskValue > 0) {
                if (eraserState.refinePreserveColor) {
                    var originalAlpha = data[idx + 3];
                    var processedAlpha = processedData[idx + 3];
                    var blendedAlpha = originalAlpha + (processedAlpha - originalAlpha) * maskValue * strengthFactor;
                    data[idx + 3] = Math.round(Math.max(0, Math.min(255, blendedAlpha)));
                } else {
                    for (var c = 0; c < 4; c++) {
                        var original = data[idx + c];
                        var processed = processedData[idx + c];
                        var blended = original + (processed - original) * maskValue * strengthFactor;
                        data[idx + c] = Math.round(Math.max(0, Math.min(255, blended)));
                    }
                }
            }
        }
    }

    ectx.putImageData(imageData, x1, y1);
}

/**
 * Сохранить текущее состояние в историю
 * Использует editCanvas (если доступен) или layer.image.
 */
function saveEraserHistory() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.image) return;

    var src;
    if (eraserState.editCanvas && eraserState.editLayerIndex === activeLayerIndex) {
        src = eraserState.editCanvas.toDataURL('image/png');
    } else {
        var tempCanvas = document.createElement('canvas');
        var tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = layer.image.naturalWidth || layer.image.width;
        tempCanvas.height = layer.image.naturalHeight || layer.image.height;
        tempCtx.drawImage(layer.image, 0, 0);
        src = tempCanvas.toDataURL('image/png');
    }

    // Удалить все состояния после текущего индекса
    eraserState.history = eraserState.history.slice(0, eraserState.historyIndex + 1);

    // Добавить новое состояние
    eraserState.history.push(src);

    // Ограничить размер истории
    if (eraserState.history.length > eraserState.maxHistory) {
        eraserState.history.shift();
    } else {
        eraserState.historyIndex++;
    }
}

/**
 * Отменить последнее действие ластика (Undo)
 */
function undoEraser() {
    if (eraserState.historyIndex > 0) {
        eraserState.historyIndex--;
        // Сбросить editCanvas — он будет пересоздан из восстановленного layer.image
        eraserState.editCanvas = null;
        eraserState.editCtx = null;
        eraserState.editLayerIndex = -1;
        restoreFromHistory();
        showHint('Отменено');
    }
}

/**
 * Повторить отменённое действие (Redo)
 */
function redoEraser() {
    if (eraserState.historyIndex < eraserState.history.length - 1) {
        eraserState.historyIndex++;
        // Сбросить editCanvas — он будет пересоздан из восстановленного layer.image
        eraserState.editCanvas = null;
        eraserState.editCtx = null;
        eraserState.editLayerIndex = -1;
        restoreFromHistory();
        showHint('Повторено');
    }
}

/**
 * Восстановить изображение из истории
 */
function restoreFromHistory() {
    var layer = layers[activeLayerIndex];
    if (!layer) return;

    var snapshot = eraserState.history[eraserState.historyIndex];
    if (snapshot) {
        var img = new Image();
        img.onload = function() {
            layer.image = img;
            render();
        };
        img.src = snapshot;
    }
}

/**
 * Применить изменения к слою (сохранить финальное состояние из editCanvas)
 */
function commitEraseToLayer() {
    var layer = layers[activeLayerIndex];
    if (!layer || !eraserState.editCanvas || eraserState.editLayerIndex !== activeLayerIndex) {
        render();
        return;
    }

    var dataURL = eraserState.editCanvas.toDataURL('image/png');
    var newImg = new Image();
    newImg.onload = function() {
        layer.image = newImg;
        // Сбросить editCanvas — следующий штрих создаст его заново из обновлённого layer.image
        eraserState.editCanvas = null;
        eraserState.editCtx = null;
        eraserState.editLayerIndex = -1;
        render();
    };
    newImg.src = dataURL;
}

/**
 * Отобразить курсор-кисть поверх холста.
 * Во время активного стирания рендерит слой из editCanvas для быстрого превью.
 */
function drawBrushCursor(x, y) {
    if (!eraserState.active) return;

    // Если идёт стирание, рендерим с editCanvas как источником слоя
    if (eraserState.isErasing && eraserState.editCanvas &&
            eraserState.editLayerIndex === activeLayerIndex) {
        var layer = layers[activeLayerIndex];
        var savedImage = layer ? layer.image : null;
        if (layer && savedImage) {
            layer.image = eraserState.editCanvas;
            render();
            layer.image = savedImage;
        } else {
            render();
        }
    } else {
        render();
    }

    // Вычислить радиус курсора с учётом масштаба слоя
    var layer = layers[activeLayerIndex];
    var scale = (layer && layer.scale) ? layer.scale : 1;
    var brushRadius = eraserState.brushSize / 2;
    var cursorRadius = Math.max(1, brushRadius * scale);
    var featherCursorRadius = Math.max(1, brushRadius * eraserState.featherRadius * scale);

    var ctx2d = canvas.getContext('2d');
    ctx2d.save();
    var cursorColor = eraserState.mode === 'restore' ? 'rgba(0,220,100,0.9)' :
                      eraserState.mode === 'refine'  ? 'rgba(100,200,255,0.9)' :
                      'rgba(255,255,255,0.9)';

    // Внешняя окружность расширенной зоны растушевки (пунктир)
    if (eraserState.featherRadius > 1.0) {
        ctx2d.strokeStyle = eraserState.mode === 'restore' ? 'rgba(0,220,100,0.5)' :
                            eraserState.mode === 'refine'  ? 'rgba(100,200,255,0.5)' :
                            'rgba(255,255,255,0.5)';
        ctx2d.lineWidth = 1;
        ctx2d.setLineDash([2, 4]);
        ctx2d.beginPath();
        ctx2d.arc(x, y, featherCursorRadius, 0, Math.PI * 2);
        ctx2d.stroke();
    }

    // Основная окружность (полный размер кисти)
    ctx2d.strokeStyle = cursorColor;
    ctx2d.lineWidth = 1.5;
    ctx2d.setLineDash([4, 4]);
    ctx2d.beginPath();
    ctx2d.arc(x, y, cursorRadius, 0, Math.PI * 2);
    ctx2d.stroke();
    // Внутренняя окружность (зона жёсткости, только при промежуточной жёсткости)
    var hardness = eraserState.brushHardness / 100;
    if (hardness > 0 && hardness < 1) {
        ctx2d.strokeStyle = eraserState.mode === 'restore' ? 'rgba(0,220,100,0.4)' :
                            eraserState.mode === 'refine'  ? 'rgba(100,200,255,0.4)' :
                            'rgba(255,255,255,0.4)';
        ctx2d.lineWidth = 1;
        ctx2d.setLineDash([2, 2]);
        ctx2d.beginPath();
        ctx2d.arc(x, y, Math.max(1, cursorRadius * hardness), 0, Math.PI * 2);
        ctx2d.stroke();
    }
    // Точка в центре
    ctx2d.setLineDash([]);
    ctx2d.fillStyle = cursorColor;
    ctx2d.beginPath();
    ctx2d.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.restore();
}

/**
 * Получить координаты события (мышь или тач) относительно canvas
 */
function getEraserCoords(e) {
    var rect = canvas.getBoundingClientRect();
    var touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    var clientX = e.clientX !== undefined ? e.clientX : (touch ? touch.clientX : 0);
    var clientY = e.clientY !== undefined ? e.clientY : (touch ? touch.clientY : 0);
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

/**
 * Линейная интерполяция
 */
function eraserLerp(a, b, t) {
    return Math.round(a + (b - a) * t);
}

/**
 * Вычислить силу растушевки на основе расстояния и выбранного режима
 * @param {number} t - нормализованное расстояние (0..1)
 * @param {string} mode - режим кривой ('cosine' | 'quadratic' | 'linear' | 'cubic')
 * @returns {number} - сила от 0 до 1
 */
function calculateFeatherStrength(t, mode) {
    switch (mode) {
        case 'cosine':
            // Самое плавное затухание (как в Photoshop)
            // Дополнительное сглаживание Hermite перед косинусом даёт ещё более мягкий
            // начало и конец перехода (S-образная кривая → косинусное затухание)
            t = t * t * (3 - 2 * t); // Hermite interpolation
            return (Math.cos(t * Math.PI) + 1) / 2;
        case 'quadratic':
            // Среднее затухание
            return 1 - (t * t);
        case 'linear':
            // Линейное затухание
            return 1 - t;
        case 'cubic':
        default:
            // Исходное кубическое затухание
            return 1 - (t * t * t);
    }
}

/**
 * Инициализировать обработчики событий ластика
 * Вызывается из initUIControls() после загрузки всех скриптов
 */
function initEraserTool() {
    // Запретить контекстное меню при ПКМ на canvas когда ластик активен
    canvas.addEventListener('contextmenu', function(e) {
        if (eraserState.active) {
            e.preventDefault();
        }
    });

    // Обработчики для контролов растушёвки
    var featherSlider = document.getElementById('eraserFeather');
    if (featherSlider) {
        featherSlider.addEventListener('input', function(e) {
            eraserState.featherRadius = parseFloat(e.target.value);
            document.getElementById('eraserFeatherVal').textContent = eraserState.featherRadius.toFixed(1) + 'x';
        });
    }

    var featherModeSelect = document.getElementById('eraserFeatherMode');
    if (featherModeSelect) {
        featherModeSelect.addEventListener('change', function(e) {
            eraserState.featherMode = e.target.value;
        });
    }

    // Обработчики для умного стирания
    var smartEdgeCheckbox = document.getElementById('smartEdgeDetection');
    if (smartEdgeCheckbox) {
        smartEdgeCheckbox.addEventListener('change', function(e) {
            eraserState.smartEdgeDetection = e.target.checked;
            var sensitivityGroup = document.getElementById('smartEdgeSensitivityGroup');
            if (sensitivityGroup) {
                sensitivityGroup.style.display = e.target.checked ? 'block' : 'none';
            }
        });
    }

    var smartEdgeSensitivitySlider = document.getElementById('smartEdgeSensitivity');
    if (smartEdgeSensitivitySlider) {
        smartEdgeSensitivitySlider.addEventListener('input', function(e) {
            eraserState.smartEdgeSensitivity = parseInt(e.target.value);
            document.getElementById('smartEdgeSensitivityVal').textContent = eraserState.smartEdgeSensitivity;
        });
    }

    var smartRespectAlphaCheckbox = document.getElementById('smartRespectAlpha');
    if (smartRespectAlphaCheckbox) {
        smartRespectAlphaCheckbox.addEventListener('change', function(e) {
            eraserState.smartRespectAlpha = e.target.checked;
        });
    }

    var smartGradientToleranceCheckbox = document.getElementById('smartGradientTolerance');
    if (smartGradientToleranceCheckbox) {
        smartGradientToleranceCheckbox.addEventListener('change', function(e) {
            eraserState.smartGradientTolerance = e.target.checked;
        });
    }

    // Обработчики для режима обработки краёв
    var refineModeSelect = document.getElementById('refineMode');
    if (refineModeSelect) {
        refineModeSelect.addEventListener('change', function(e) {
            eraserState.refineMode = e.target.value;
        });
    }

    var refineStrengthSlider = document.getElementById('refineStrength');
    if (refineStrengthSlider) {
        refineStrengthSlider.addEventListener('input', function(e) {
            eraserState.refineStrength = parseInt(e.target.value);
            document.getElementById('refineStrengthVal').textContent = eraserState.refineStrength + '%';
        });
    }

    var refineRadiusSlider = document.getElementById('refineRadius');
    if (refineRadiusSlider) {
        refineRadiusSlider.addEventListener('input', function(e) {
            eraserState.refineRadius = parseInt(e.target.value);
            document.getElementById('refineRadiusVal').textContent = eraserState.refineRadius + 'px';
        });
    }

    var refinePreserveColorCheckbox = document.getElementById('refinePreserveColor');
    if (refinePreserveColorCheckbox) {
        refinePreserveColorCheckbox.addEventListener('change', function(e) {
            eraserState.refinePreserveColor = e.target.checked;
        });
    }
}

// Горячие клавиши для ластика
document.addEventListener('keydown', function(e) {
    if (!eraserState.active) return;

    // Ctrl+Z — отмена
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoEraser();
    }

    // Ctrl+Shift+Z — повтор
    if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        redoEraser();
    }

    // [ — уменьшить кисть
    if (e.key === '[') {
        eraserState.brushSize = Math.max(1, eraserState.brushSize - 5);
        document.getElementById('eraserSize').value = eraserState.brushSize;
        document.getElementById('eraserSizeVal').textContent = eraserState.brushSize + 'px';
    }

    // ] — увеличить кисть
    if (e.key === ']') {
        eraserState.brushSize = Math.min(200, eraserState.brushSize + 5);
        document.getElementById('eraserSize').value = eraserState.brushSize;
        document.getElementById('eraserSizeVal').textContent = eraserState.brushSize + 'px';
    }

    // E — переключить режим стирание/восстановление
    if (e.key === 'e' || e.key === 'E') {
        var modeSelect = document.getElementById('eraserMode');
        modeSelect.value = modeSelect.value === 'erase' ? 'restore' : 'erase';
        var smartGroup = document.getElementById('smartEraseGroup');
        if (smartGroup) {
            smartGroup.style.display = modeSelect.value === 'smart' ? 'block' : 'none';
        }
    }
});
