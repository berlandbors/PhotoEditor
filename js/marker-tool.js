/**
 * marker-tool.js — инструмент маркера для удаления фона
 *
 * Позволяет пользователю отмечать:
 *   - 🟢 зелёным маркером: области, которые нужно СОХРАНИТЬ (foreground)
 *   - 🔴 красным маркером: области, которые нужно УДАЛИТЬ (background)
 *
 * После нанесения маркеров пользователь нажимает "Применить удаление фона",
 * алгоритм анализирует отмеченные пиксели и удаляет фон путём создания
 * альфа-маски на основе цветового сходства с образцами.
 */

'use strict';

// Количество пикселей, обрабатываемых за один асинхронный шаг
var CHUNK_SIZE = 50000;

// Максимальное евклидово расстояние в RGB-пространстве: sqrt(255² + 255² + 255²)
var MAX_RGB_DISTANCE_SQ = 195075; // 255² + 255² + 255²

var markerState = {
    active: false,          // Активен ли инструмент
    isDrawing: false,       // Идёт ли сейчас рисование маркером
    markerType: 'foreground', // 'foreground' (зелёный) | 'background' (красный)
    brushSize: 15,          // Размер кисти маркера (px в пространстве изображения)
    featherRadius: 20,      // Радиус растушёвки краёв при удалении фона (px)
    threshold: 30,          // Порог цветового сходства (0–100)
    lastX: 0,
    lastY: 0,
    // Offscreen canvas для маркеров (в пространстве изображения)
    markerCanvas: null,
    markerCtx: null,
    markerLayerIndex: -1,   // Индекс слоя, для которого созданы маркеры
    // Хранение пикселей маркеров для анализа
    fgSamples: [],          // [{r,g,b}, …] — образцы переднего плана
    bgSamples: [],          // [{r,g,b}, …] — образцы фона
    // Счётчики пикселей маркеров
    fgPixelCount: 0,
    bgPixelCount: 0
};

// ─────────────────────────────────────────
// Инициализация и активация
// ─────────────────────────────────────────

/**
 * Активировать инструмент маркера
 */
function activateMarkerTool() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.image) {
        showHint('Выберите слой с изображением для использования маркера');
        return;
    }

    markerState.active = true;

    // Создать или обновить offscreen canvas для маркеров
    _initMarkerCanvas();

    // Изменить курсор
    canvas.style.cursor = 'crosshair';
    canvas.classList.add('marker-active');

    // Подписаться на события мыши
    canvas.addEventListener('mousedown', _startMarking);
    canvas.addEventListener('mousemove', _continueMarking);
    canvas.addEventListener('mouseup', _stopMarking);
    canvas.addEventListener('mouseleave', _stopMarking);

    // Подписаться на события касания
    canvas.addEventListener('touchstart', _startMarking, { passive: false });
    canvas.addEventListener('touchmove', _continueMarking, { passive: false });
    canvas.addEventListener('touchend', _stopMarking);
    canvas.addEventListener('touchcancel', _stopMarking);

    _updateToggleButton(true);
    showHint('Маркер активирован. Выберите тип маркера и рисуйте на изображении');
}

/**
 * Деактивировать инструмент маркера
 */
function deactivateMarkerTool() {
    markerState.active = false;
    markerState.isDrawing = false;

    canvas.style.cursor = '';
    canvas.classList.remove('marker-active');

    canvas.removeEventListener('mousedown', _startMarking);
    canvas.removeEventListener('mousemove', _continueMarking);
    canvas.removeEventListener('mouseup', _stopMarking);
    canvas.removeEventListener('mouseleave', _stopMarking);

    canvas.removeEventListener('touchstart', _startMarking);
    canvas.removeEventListener('touchmove', _continueMarking);
    canvas.removeEventListener('touchend', _stopMarking);
    canvas.removeEventListener('touchcancel', _stopMarking);

    render();

    _updateToggleButton(false);
    showHint('Маркер выключен');
}

/**
 * Переключить инструмент маркера (вкл/выкл)
 */
function toggleMarkerTool() {
    if (markerState.active) {
        deactivateMarkerTool();
    } else {
        activateMarkerTool();
    }
}

// ─────────────────────────────────────────
// Рисование маркеров
// ─────────────────────────────────────────

/**
 * Начать рисование маркером (mousedown / touchstart)
 */
function _startMarking(e) {
    if (!markerState.active) return;
    e.preventDefault();
    e.stopPropagation();

    markerState.isDrawing = true;

    var coords = _getMarkerCoords(e);
    markerState.lastX = coords.x;
    markerState.lastY = coords.y;

    _drawMarkerAtCanvasPoint(coords.x, coords.y);
    _renderWithMarkers(coords.x, coords.y);
}

/**
 * Продолжить рисование маркером (mousemove / touchmove)
 */
function _continueMarking(e) {
    if (!markerState.active) return;

    var coords = _getMarkerCoords(e);

    if (!markerState.isDrawing) {
        // Только показываем курсор
        _renderWithMarkers(coords.x, coords.y);
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Интерполируем линию между предыдущей и текущей точкой
    _interpolateMarker(markerState.lastX, markerState.lastY, coords.x, coords.y);

    markerState.lastX = coords.x;
    markerState.lastY = coords.y;

    _renderWithMarkers(coords.x, coords.y);
}

/**
 * Остановить рисование маркером (mouseup / mouseleave / touchend)
 */
function _stopMarking(e) {
    if (markerState.isDrawing) {
        markerState.isDrawing = false;
        _updateMarkerPixelCount();
        render();
    }
}

/**
 * Интерполяция — плавная линия маркера между двумя точками canvas
 */
function _interpolateMarker(x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var distance = Math.sqrt(dx * dx + dy * dy);
    // Шаг 1px для плавности
    var steps = Math.max(1, Math.ceil(distance));

    for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        _drawMarkerAtCanvasPoint(x1 + dx * t, y1 + dy * t);
    }
}

/**
 * Нарисовать маркер в точке canvas (координаты canvas, учитывая масштаб слоя)
 */
function _drawMarkerAtCanvasPoint(cx, cy) {
    var layer = layers[activeLayerIndex];
    if (!layer || !markerState.markerCanvas) return;

    // Преобразовать координаты canvas → пространство изображения
    var imgX = Math.round((cx - layer.x) / layer.scale);
    var imgY = Math.round((cy - layer.y) / layer.scale);

    _drawMarkerCircle(imgX, imgY);
}

/**
 * Нарисовать круг маркера в пространстве изображения
 */
function _drawMarkerCircle(imgX, imgY) {
    var mc = markerState.markerCanvas;
    var mctx = markerState.markerCtx;
    if (!mc) return;

    var radius = markerState.brushSize / 2;
    var isFg = (markerState.markerType === 'foreground');

    mctx.save();
    // Полупрозрачный маркер: зелёный для FG, красный для BG
    mctx.globalCompositeOperation = 'source-over';
    mctx.fillStyle = isFg
        ? 'rgba(0, 220, 80, 0.55)'
        : 'rgba(220, 40, 40, 0.55)';
    mctx.beginPath();
    mctx.arc(imgX, imgY, radius, 0, Math.PI * 2);
    mctx.fill();
    mctx.restore();
}

// ─────────────────────────────────────────
// Очистка маркеров
// ─────────────────────────────────────────

/**
 * Очистить все маркеры (без применения к слою)
 */
function clearMarkers() {
    if (markerState.markerCanvas) {
        markerState.markerCtx.clearRect(
            0, 0,
            markerState.markerCanvas.width,
            markerState.markerCanvas.height
        );
    }
    markerState.fgSamples = [];
    markerState.bgSamples = [];
    markerState.fgPixelCount = 0;
    markerState.bgPixelCount = 0;
    _updatePixelCountDisplay();

    if (markerState.active) {
        render();
    }
    showHint('Маркеры очищены');
}

// ─────────────────────────────────────────
// Применение удаления фона
// ─────────────────────────────────────────

/**
 * Применить удаление фона на основе отмеченных областей.
 * Анализирует пиксели под маркерами, создаёт альфа-маску и применяет к слою.
 */
function applyMarkerBackgroundRemoval() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.image) {
        showHint('Выберите слой с изображением');
        return;
    }
    if (!markerState.markerCanvas) {
        showHint('Сначала активируйте инструмент маркера');
        return;
    }

    var mctx = markerState.markerCtx;
    var mc = markerState.markerCanvas;
    var markerData = mctx.getImageData(0, 0, mc.width, mc.height);

    // Рендерим изображение слоя во временный canvas для анализа
    var imgW = layer.image.naturalWidth || layer.image.width;
    var imgH = layer.image.naturalHeight || layer.image.height;

    if (!imgW || !imgH) {
        showHint('Изображение слоя не готово');
        return;
    }

    // Предупреждение для очень больших изображений (>4 мегапикселей)
    if (imgW * imgH > 4000000) {
        var proceed = confirm('Обработка может занять 10-20 секунд. Продолжить?');
        if (!proceed) return;
    }

    var tempCanvas = document.createElement('canvas');
    var tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = imgW;
    tempCanvas.height = imgH;
    tempCtx.drawImage(layer.image, 0, 0);
    var imageData = tempCtx.getImageData(0, 0, imgW, imgH);

    // Собираем образцы цветов из отмеченных областей
    var fgSamples = [];
    var bgSamples = [];

    var md = markerData.data;
    var id = imageData.data;

    for (var i = 0; i < md.length; i += 4) {
        var mR = md[i];
        var mG = md[i + 1];
        var mB = md[i + 2];
        var mA = md[i + 3];

        if (mA < 30) continue; // Непомеченный пиксель

        // Координаты в изображении
        var pixelIndex = i / 4;
        var imgAlpha = id[i + 3];
        if (imgAlpha === 0) continue; // Уже прозрачный

        var r = id[i];
        var g = id[i + 1];
        var b = id[i + 2];

        // Зелёный (FG) или красный (BG) канал определяет тип маркера
        if (mG > mR && mG > mB) {
            // Зелёный маркер → foreground
            fgSamples.push([r, g, b]);
        } else if (mR > mG && mR > mB) {
            // Красный маркер → background
            bgSamples.push([r, g, b]);
        }
    }

    if (fgSamples.length === 0 && bgSamples.length === 0) {
        showHint('Нанесите маркеры на изображение перед применением');
        return;
    }

    if (fgSamples.length === 0) {
        showHint('Нанесите зелёный маркер на объект, который нужно сохранить');
        return;
    }

    if (bgSamples.length === 0) {
        showHint('Нанесите красный маркер на фон, который нужно удалить');
        return;
    }

    // Ограничим выборку для производительности (максимум 2000 образцов каждого типа)
    fgSamples = _downsampleArray(fgSamples, 2000);
    bgSamples = _downsampleArray(bgSamples, 2000);

    showHint('⏳ Начало обработки...');

    // Применить алгоритм удаления фона асинхронно
    _computeAlphaMaskAsync(imageData, fgSamples, bgSamples, imgW, imgH, function(resultData) {
        // Применить растушёвку краёв
        var feather = markerState.featherRadius;
        if (feather > 0) {
            _blurAlphaChannel(resultData.data, imgW, imgH, feather);
        }

        tempCtx.putImageData(resultData, 0, 0);

        // Применить результат к слою
        var dataURL = tempCanvas.toDataURL('image/png');
        var newImg = new Image();
        newImg.onload = function() {
            layer.image = newImg;
            render();
            showHint('✅ Фон удалён! Обработано ' + (resultData.data.length / 4).toLocaleString() + ' пикселей');
        };
        newImg.src = dataURL;

        // Очистить маркеры после применения
        clearMarkers();
    });
}

/**
 * Асинхронно вычислить альфа-маску, разбивая обработку на chunks по CHUNK_SIZE пикселей.
 * Это предотвращает блокировку главного потока браузера.
 * По окончании вызывает callback(resultData).
 *
 * Используется взвешенный KNN-подход: для каждого пикселя находим
 * минимальное расстояние до ближайшего FG и BG образца.
 * Alpha = fg_weight / (fg_weight + bg_weight)
 * где weight = 1 / (distance^2 + epsilon)
 */
function _computeAlphaMaskAsync(imageData, fgSamples, bgSamples, width, height, callback) {
    var result = new ImageData(
        new Uint8ClampedArray(imageData.data),
        width, height
    );
    var data = result.data;
    var threshold = markerState.threshold / 100; // 0.0–1.0
    var epsilon = 1.0; // Избежать деления на ноль
    var totalPixels = width * height;

    // Кэш для уникальных цветов: ключ = упакованный RGB-цвет, значение = alpha
    var cache = new Map();

    function processChunk(startPixel) {
        var endPixel = Math.min(startPixel + CHUNK_SIZE, totalPixels);

        for (var p = startPixel; p < endPixel; p++) {
            var i = p * 4;
            if (data[i + 3] === 0) continue; // Уже прозрачный

            var r = data[i];
            var g = data[i + 1];
            var b = data[i + 2];

            // Упаковать RGB в число для кэша
            var key = (r << 16) | (g << 8) | b;
            var cached = cache.get(key);
            if (cached !== undefined) {
                data[i + 3] = Math.min(data[i + 3], cached);
                continue;
            }

            // Найти минимальное расстояние до ближайшего FG и BG образца
            var minFgDistSq = _minColorDistanceSq(r, g, b, fgSamples);
            var minBgDistSq = _minColorDistanceSq(r, g, b, bgSamples);

            // Вес: чем ближе к образцу, тем больше вес
            var fgWeight = 1.0 / (minFgDistSq + epsilon);
            var bgWeight = 1.0 / (minBgDistSq + epsilon);

            var totalWeight = fgWeight + bgWeight;
            var fgRatio = fgWeight / totalWeight; // 0.0 = точно BG, 1.0 = точно FG

            // Применить порог для чёткости границ
            var alpha;
            if (fgRatio > 0.5 + threshold * 0.4) {
                alpha = 255; // Чётко FG — полностью сохранить
            } else if (fgRatio < 0.5 - threshold * 0.4) {
                alpha = 0;   // Чётко BG — полностью удалить
            } else {
                // Переходная зона — плавное затухание
                var t = (fgRatio - (0.5 - threshold * 0.4)) / (threshold * 0.8);
                t = Math.max(0, Math.min(1, t));
                // Сглаживание (smoothstep)
                t = t * t * (3 - 2 * t);
                alpha = Math.round(255 * t);
            }

            cache.set(key, alpha);
            data[i + 3] = Math.min(data[i + 3], alpha);
        }

        var progress = Math.round((endPixel / totalPixels) * 100);
        showHint('⏳ Обработка... ' + progress + '%');

        if (endPixel < totalPixels) {
            setTimeout(function() { processChunk(endPixel); }, 0);
        } else {
            callback(result);
        }
    }

    processChunk(0);
}

/**
 * Вычислить альфа-маску для каждого пикселя изображения на основе
 * цветового сходства с образцами FG и BG (синхронная версия, оставлена для совместимости).
 *
 * Используется взвешенный KNN-подход: для каждого пикселя находим
 * минимальное расстояние до ближайшего FG и BG образца.
 * Alpha = fg_weight / (fg_weight + bg_weight)
 * где weight = 1 / (distance^2 + epsilon)
 */
function _computeAlphaMask(imageData, fgSamples, bgSamples, width, height) {
    var result = new ImageData(
        new Uint8ClampedArray(imageData.data),
        width, height
    );
    var data = result.data;
    var threshold = markerState.threshold / 100; // 0.0–1.0

    var epsilon = 1.0; // Избежать деления на ноль

    for (var i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue; // Уже прозрачный

        var r = data[i];
        var g = data[i + 1];
        var b = data[i + 2];

        // Найти минимальное расстояние до ближайшего FG образца
        var minFgDistSq = _minColorDistanceSq(r, g, b, fgSamples);
        // Найти минимальное расстояние до ближайшего BG образца
        var minBgDistSq = _minColorDistanceSq(r, g, b, bgSamples);

        // Вес: чем ближе к образцу, тем больше вес
        var fgWeight = 1.0 / (minFgDistSq + epsilon);
        var bgWeight = 1.0 / (minBgDistSq + epsilon);

        var totalWeight = fgWeight + bgWeight;
        var fgRatio = fgWeight / totalWeight; // 0.0 = точно BG, 1.0 = точно FG

        // Применить порог для чёткости границ
        var alpha;
        if (fgRatio > 0.5 + threshold * 0.4) {
            alpha = 255; // Чётко FG — полностью сохранить
        } else if (fgRatio < 0.5 - threshold * 0.4) {
            alpha = 0;   // Чётко BG — полностью удалить
        } else {
            // Переходная зона — плавное затухание
            var t = (fgRatio - (0.5 - threshold * 0.4)) / (threshold * 0.8);
            t = Math.max(0, Math.min(1, t));
            // Сглаживание (smoothstep)
            t = t * t * (3 - 2 * t);
            alpha = Math.round(255 * t);
        }

        data[i + 3] = Math.min(data[i + 3], alpha);
    }

    return result;
}

/**
 * Найти минимальное квадратичное евклидово расстояние от цвета (r,g,b) до массива образцов.
 * Возвращает квадрат расстояния (без sqrt) для использования в весовой формуле.
 * Ранний выход при идеальном совпадении (distSq === 0).
 */
function _minColorDistanceSq(r, g, b, samples) {
    var minDistSq = Infinity;
    for (var j = 0; j < samples.length; j++) {
        var s = samples[j];
        var dr = r - s[0];
        var dg = g - s[1];
        var db = b - s[2];
        var distSq = dr * dr + dg * dg + db * db;
        if (distSq === 0) return 0; // Идеальное совпадение — ранний выход
        if (distSq < minDistSq) minDistSq = distSq;
    }
    return minDistSq === Infinity ? MAX_RGB_DISTANCE_SQ : minDistSq;
}

/**
 * Размытие альфа-канала (Gaussian blur только для альфа) для растушёвки краёв
 */
function _blurAlphaChannel(data, width, height, radius) {
    if (radius < 1) return;

    var r = Math.ceil(radius);
    var sigma = radius / 3;
    var kernelSize = r * 2 + 1;
    var kernel = new Float32Array(kernelSize);
    var sum = 0;
    for (var k = 0; k < kernelSize; k++) {
        var x = k - r;
        kernel[k] = Math.exp(-(x * x) / (2 * sigma * sigma));
        sum += kernel[k];
    }
    for (var k = 0; k < kernelSize; k++) kernel[k] /= sum;

    var tempAlpha = new Uint8ClampedArray(width * height);

    // Горизонтальный проход
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var acc = 0, wSum = 0;
            for (var k = 0; k < kernelSize; k++) {
                var sx = x + k - r;
                if (sx >= 0 && sx < width) {
                    acc += data[(y * width + sx) * 4 + 3] * kernel[k];
                    wSum += kernel[k];
                }
            }
            tempAlpha[y * width + x] = Math.round(acc / wSum);
        }
    }

    // Вертикальный проход
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var acc = 0, wSum = 0;
            for (var k = 0; k < kernelSize; k++) {
                var sy = y + k - r;
                if (sy >= 0 && sy < height) {
                    acc += tempAlpha[sy * width + x] * kernel[k];
                    wSum += kernel[k];
                }
            }
            data[(y * width + x) * 4 + 3] = Math.round(acc / wSum);
        }
    }
}

// ─────────────────────────────────────────
// Рендеринг с наложением маркеров
// ─────────────────────────────────────────

/**
 * Перерисовать сцену и наложить маркеры + курсор поверх
 */
function _renderWithMarkers(cx, cy) {
    render();

    if (!markerState.active || !markerState.markerCanvas) return;

    var layer = layers[activeLayerIndex];
    if (!layer) return;

    var ctx2d = canvas.getContext('2d');

    // Наложить markerCanvas поверх canvas с учётом трансформации слоя
    ctx2d.save();
    ctx2d.translate(layer.x, layer.y);
    ctx2d.scale(layer.scale, layer.scale);
    ctx2d.drawImage(markerState.markerCanvas, 0, 0);
    ctx2d.restore();

    // Нарисовать курсор кисти
    _drawMarkerCursor(cx, cy, ctx2d, layer);
}

/**
 * Нарисовать курсор кисти маркера поверх canvas
 */
function _drawMarkerCursor(cx, cy, ctx2d, layer) {
    var scale = (layer && layer.scale) ? layer.scale : 1;
    var cursorRadius = Math.max(2, (markerState.brushSize / 2) * scale);
    var isFg = (markerState.markerType === 'foreground');

    ctx2d.save();
    // Внешняя окружность
    ctx2d.strokeStyle = isFg ? 'rgba(0, 220, 80, 0.9)' : 'rgba(220, 40, 40, 0.9)';
    ctx2d.lineWidth = 1.5;
    ctx2d.setLineDash([4, 4]);
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, cursorRadius, 0, Math.PI * 2);
    ctx2d.stroke();
    // Точка в центре
    ctx2d.setLineDash([]);
    ctx2d.fillStyle = isFg ? 'rgba(0, 220, 80, 0.9)' : 'rgba(220, 40, 40, 0.9)';
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.restore();
}

// ─────────────────────────────────────────
// Вспомогательные функции
// ─────────────────────────────────────────

/**
 * Инициализировать (или обновить) offscreen canvas для маркеров
 */
function _initMarkerCanvas() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.image) return;

    var imgW = layer.image.naturalWidth || layer.image.width;
    var imgH = layer.image.naturalHeight || layer.image.height;
    if (!imgW || !imgH) return;

    // Пересоздать если слой сменился или canvas не создан
    if (markerState.markerLayerIndex !== activeLayerIndex || !markerState.markerCanvas) {
        // Сохранить старые данные маркеров при смене слоя — нет, сбрасываем
        var mc = document.createElement('canvas');
        mc.width = imgW;
        mc.height = imgH;
        var mctx = mc.getContext('2d');
        markerState.markerCanvas = mc;
        markerState.markerCtx = mctx;
        markerState.markerLayerIndex = activeLayerIndex;
        markerState.fgPixelCount = 0;
        markerState.bgPixelCount = 0;
        _updatePixelCountDisplay();
    }
}

/**
 * Получить координаты события (мышь или тач) относительно canvas
 */
function _getMarkerCoords(e) {
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
 * Обновить счётчик пикселей маркеров (выполняется после каждого штриха)
 */
function _updateMarkerPixelCount() {
    if (!markerState.markerCanvas) return;

    var mc = markerState.markerCanvas;
    var mctx = markerState.markerCtx;
    var md = mctx.getImageData(0, 0, mc.width, mc.height).data;

    var fg = 0, bg = 0;
    for (var i = 0; i < md.length; i += 4) {
        if (md[i + 3] < 30) continue;
        if (md[i + 1] > md[i] && md[i + 1] > md[i + 2]) {
            fg++;
        } else if (md[i] > md[i + 1] && md[i] > md[i + 2]) {
            bg++;
        }
    }
    markerState.fgPixelCount = fg;
    markerState.bgPixelCount = bg;
    _updatePixelCountDisplay();
}

/**
 * Обновить отображение счётчиков пикселей в UI
 */
function _updatePixelCountDisplay() {
    var fgEl = document.getElementById('markerFgCount');
    var bgEl = document.getElementById('markerBgCount');
    if (fgEl) fgEl.textContent = markerState.fgPixelCount;
    if (bgEl) bgEl.textContent = markerState.bgPixelCount;
}

/**
 * Обновить кнопку активации маркера
 */
function _updateToggleButton(active) {
    var btn = document.getElementById('toggleMarker');
    if (!btn) return;
    if (active) {
        btn.textContent = '✖ Деактивировать маркер';
        btn.classList.remove('primary');
        btn.classList.add('danger');
    } else {
        btn.textContent = '✓ Активировать маркер';
        btn.classList.remove('danger');
        btn.classList.add('primary');
    }
}

/**
 * Уменьшить выборку массива до максимального размера (равномерно)
 */
function _downsampleArray(arr, maxSize) {
    if (arr.length <= maxSize) return arr;
    var result = [];
    var step = arr.length / maxSize;
    for (var i = 0; i < maxSize; i++) {
        result.push(arr[Math.floor(i * step)]);
    }
    return result;
}

// ─────────────────────────────────────────
// Инициализация UI-контролов маркера
// ─────────────────────────────────────────

/**
 * Инициализировать слайдеры и события для UI инструмента маркера.
 * Вызывается из initUIControls() в ui-controls.js.
 */
function initMarkerControls() {
    // Размер кисти
    var sizeSlider = document.getElementById('markerBrushSize');
    if (sizeSlider) {
        sizeSlider.addEventListener('input', function(e) {
            markerState.brushSize = parseInt(e.target.value);
            var val = document.getElementById('markerBrushSizeVal');
            if (val) val.textContent = markerState.brushSize + 'px';
        });
    }

    // Растушёвка краёв
    var featherSlider = document.getElementById('markerFeather');
    if (featherSlider) {
        featherSlider.addEventListener('input', function(e) {
            markerState.featherRadius = parseInt(e.target.value);
            var val = document.getElementById('markerFeatherVal');
            if (val) val.textContent = markerState.featherRadius + 'px';
        });
    }

    // Порог точности
    var thresholdSlider = document.getElementById('markerThreshold');
    if (thresholdSlider) {
        thresholdSlider.addEventListener('input', function(e) {
            markerState.threshold = parseInt(e.target.value);
            var val = document.getElementById('markerThresholdVal');
            if (val) val.textContent = markerState.threshold;
        });
    }

    // Режим маркера (переключатель FG/BG)
    var fgBtn = document.getElementById('markerFgBtn');
    var bgBtn = document.getElementById('markerBgBtn');
    if (fgBtn) {
        fgBtn.addEventListener('click', function() {
            markerState.markerType = 'foreground';
            fgBtn.classList.add('active');
            if (bgBtn) bgBtn.classList.remove('active');
        });
    }
    if (bgBtn) {
        bgBtn.addEventListener('click', function() {
            markerState.markerType = 'background';
            bgBtn.classList.add('active');
            if (fgBtn) fgBtn.classList.remove('active');
        });
    }
}
