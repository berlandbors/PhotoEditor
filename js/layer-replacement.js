/**
 * layer-replacement.js
 * Инструмент замены элементов между слоями фотографий.
 * Поддерживает три режима:
 *   1. Content-Aware Replace (Умная замена)
 *   2. Mask Transfer (Перенос маски)
 *   3. Clone Stamp Between Layers (Штамп между слоями)
 */

/* ============================================================
   Утилиты
   ============================================================ */

/**
 * Возвращает ImageData активного/рабочего состояния указанного слоя.
 * @param {number} layerIndex - Индекс слоя в массиве layers.
 * @returns {ImageData|null}
 */
function lrGetLayerImageData(layerIndex) {
    if (layerIndex < 0 || layerIndex >= layers.length) return null;
    var layer = layers[layerIndex];
    if (!layer || !layer.image) return null;
    var tmpCanvas = createTempCanvas(layer);
    if (!tmpCanvas) return null;
    var tmpCtx = tmpCanvas.getContext('2d');
    return tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
}

/**
 * Применяет ImageData к canvas слоя, заменяя его содержимое.
 * @param {number} layerIndex
 * @param {ImageData} imageData
 */
function lrApplyToLayer(layerIndex, imageData) {
    if (layerIndex < 0 || layerIndex >= layers.length) return;
    var layer = layers[layerIndex];
    if (!layer) return;

    var offscreen = document.createElement('canvas');
    offscreen.width = imageData.width;
    offscreen.height = imageData.height;
    var offCtx = offscreen.getContext('2d');
    offCtx.putImageData(imageData, 0, 0);

    var img = new Image();
    img.onload = function () {
        layer.image = img;
        layer.originalImage = img;
        renderCanvas();
        rebuildLayersList();
    };
    img.src = offscreen.toDataURL('image/png');
}

/**
 * Масштабирует ImageData до новых размеров методом билинейной интерполяции.
 * @param {ImageData} src
 * @param {number} newWidth
 * @param {number} newHeight
 * @returns {ImageData}
 */
function lrResizeImageData(src, newWidth, newHeight) {
    var srcW = src.width;
    var srcH = src.height;
    var result = new ImageData(newWidth, newHeight);
    var srcData = src.data;
    var dstData = result.data;

    var xRatio = srcW / newWidth;
    var yRatio = srcH / newHeight;

    for (var dy = 0; dy < newHeight; dy++) {
        for (var dx = 0; dx < newWidth; dx++) {
            var srcX = dx * xRatio;
            var srcY = dy * yRatio;
            var x0 = Math.floor(srcX);
            var y0 = Math.floor(srcY);
            var x1 = Math.min(x0 + 1, srcW - 1);
            var y1 = Math.min(y0 + 1, srcH - 1);
            var xFrac = srcX - x0;
            var yFrac = srcY - y0;

            var dstIdx = (dy * newWidth + dx) * 4;
            for (var c = 0; c < 4; c++) {
                var tl = srcData[(y0 * srcW + x0) * 4 + c];
                var tr = srcData[(y0 * srcW + x1) * 4 + c];
                var bl = srcData[(y1 * srcW + x0) * 4 + c];
                var br = srcData[(y1 * srcW + x1) * 4 + c];
                dstData[dstIdx + c] = Math.round(
                    tl * (1 - xFrac) * (1 - yFrac) +
                    tr * xFrac * (1 - yFrac) +
                    bl * (1 - xFrac) * yFrac +
                    br * xFrac * yFrac
                );
            }
        }
    }
    return result;
}

/**
 * Применяет гауссово размытие к альфа-каналу ImageData (feathering краёв).
 * @param {ImageData} imageData - Изменяется "in place".
 * @param {number} radius
 */
function lrGaussianBlurAlpha(imageData, radius) {
    if (radius <= 0) return;
    var w = imageData.width;
    var h = imageData.height;
    var data = imageData.data;
    var sigma = radius / 2;
    var size = Math.ceil(radius) * 2 + 1;
    var kernel = [];
    var sum = 0;
    for (var i = 0; i < size; i++) {
        var x = i - Math.floor(size / 2);
        var val = Math.exp(-(x * x) / (2 * sigma * sigma));
        kernel.push(val);
        sum += val;
    }
    for (var j = 0; j < size; j++) kernel[j] /= sum;

    var tmp = new Float32Array(w * h);
    // Горизонтальный проход
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var acc = 0;
            for (var k = 0; k < size; k++) {
                var nx = x + k - Math.floor(size / 2);
                if (nx < 0) nx = 0;
                if (nx >= w) nx = w - 1;
                acc += (data[(y * w + nx) * 4 + 3] / 255) * kernel[k];
            }
            tmp[y * w + x] = acc;
        }
    }
    // Вертикальный проход
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var acc = 0;
            for (var k = 0; k < size; k++) {
                var ny = y + k - Math.floor(size / 2);
                if (ny < 0) ny = 0;
                if (ny >= h) ny = h - 1;
                acc += tmp[ny * w + x] * kernel[k];
            }
            data[(y * w + x) * 4 + 3] = Math.round(acc * 255);
        }
    }
}

/**
 * Смешивание двух пикселей (Porter-Duff alpha compositing).
 * @param {number[]} src - [r,g,b,a] 0-255
 * @param {number[]} dst - [r,g,b,a] 0-255
 * @param {number} alpha - Дополнительный коэффициент непрозрачности 0-1
 * @returns {number[]} [r,g,b,a]
 */
function lrAlphaBlend(src, dst, alpha) {
    var sa = (src[3] / 255) * alpha;
    var da = dst[3] / 255;
    var outA = sa + da * (1 - sa);
    if (outA === 0) return [0, 0, 0, 0];
    var r = Math.round((src[0] * sa + dst[0] * da * (1 - sa)) / outA);
    var g = Math.round((src[1] * sa + dst[1] * da * (1 - sa)) / outA);
    var b = Math.round((src[2] * sa + dst[2] * da * (1 - sa)) / outA);
    return [r, g, b, Math.round(outA * 255)];
}

/**
 * Находит bounding box ненулевых альфа-пикселей в ImageData.
 * @param {ImageData} imageData
 * @returns {{x:number, y:number, w:number, h:number}|null}
 */
function lrGetBoundingBox(imageData) {
    var data = imageData.data;
    var W = imageData.width;
    var H = imageData.height;
    // Pixels with alpha > ALPHA_THRESHOLD are considered part of the object
    var ALPHA_THRESHOLD = 10;
    var minX = W, minY = H, maxX = -1, maxY = -1;
    for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
            if (data[(y * W + x) * 4 + 3] > ALPHA_THRESHOLD) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Возвращает индекс слоя в массиве layers по его id.
 * @param {number|string} id
 * @returns {number}
 */
function lrLayerIndexById(id) {
    var numId = parseInt(id, 10);
    for (var i = 0; i < layers.length; i++) {
        if (layers[i].id === numId) return i;
    }
    return -1;
}

/* ============================================================
   Состояние модуля замены слоёв
   ============================================================ */

var layerReplacement = {
    mode: 'content-aware',

    // Content-Aware
    caSourceMarkers: [],   // [{x, y}] в координатах ImageData исходного слоя
    caTargetMarkers: [],   // [{x, y}] в координатах ImageData целевого слоя
    caDrawingTarget: false, // true = рисуем синий (target), false = рисуем зелёный (source)

    // Mask Transfer
    mtMaskMarkers: [],

    // Clone Stamp
    csSourcePoint: null,   // {x, y, layerIndex}
    csIsActive: false,
    csIsDrawing: false,
    csPrevPos: null,
    csAlignedOffset: null, // Offset в режиме aligned

    // Общий оверлей для рисования маркеров (поверх canvas)
    overlayCanvas: null,
    overlayCtx: null
};

/* ============================================================
   Инициализация оверлея маркеров
   ============================================================ */

function lrInitOverlay() {
    if (layerReplacement.overlayCanvas) return;
    var wrapper = document.getElementById('canvasWrapper');
    if (!wrapper) return;
    var oc = document.createElement('canvas');
    oc.id = 'lrOverlayCanvas';
    oc.style.position = 'absolute';
    oc.style.top = '0';
    oc.style.left = '0';
    oc.style.pointerEvents = 'none';
    oc.style.zIndex = '20';
    wrapper.style.position = 'relative';
    wrapper.appendChild(oc);
    layerReplacement.overlayCanvas = oc;
    layerReplacement.overlayCtx = oc.getContext('2d');
    lrSyncOverlaySize();
}

function lrSyncOverlaySize() {
    var oc = layerReplacement.overlayCanvas;
    if (!oc) return;
    var mainCanvas = document.getElementById('canvas');
    if (!mainCanvas) return;
    oc.width = mainCanvas.width;
    oc.height = mainCanvas.height;
    oc.style.width = mainCanvas.style.width || mainCanvas.width + 'px';
    oc.style.height = mainCanvas.style.height || mainCanvas.height + 'px';
}

function lrClearOverlay() {
    var oc = layerReplacement.overlayCanvas;
    if (!oc) return;
    layerReplacement.overlayCtx.clearRect(0, 0, oc.width, oc.height);
}

/**
 * Перерисовывает все маркеры на оверлейном canvas в зависимости от режима.
 */
function lrRedrawOverlay() {
    lrSyncOverlaySize();
    lrClearOverlay();
    var ctx = layerReplacement.overlayCtx;
    if (!ctx) return;
    var mode = layerReplacement.mode;

    if (mode === 'content-aware') {
        // Зелёный - source, Синий - target
        _lrDrawMarkers(ctx, layerReplacement.caSourceMarkers, 'rgba(0,200,80,0.55)', 6);
        _lrDrawMarkers(ctx, layerReplacement.caTargetMarkers, 'rgba(40,120,255,0.55)', 6);
    } else if (mode === 'mask-transfer') {
        _lrDrawMarkers(ctx, layerReplacement.mtMaskMarkers, 'rgba(255,210,0,0.55)', 6);
    }
    // Clone Stamp — source point dot
    if (mode === 'clone-stamp' && layerReplacement.csSourcePoint) {
        var sp = layerReplacement.csSourcePoint;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#c060ff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sp.x - 14, sp.y);
        ctx.lineTo(sp.x + 14, sp.y);
        ctx.moveTo(sp.x, sp.y - 14);
        ctx.lineTo(sp.x, sp.y + 14);
        ctx.strokeStyle = '#c060ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
}

function _lrDrawMarkers(ctx, markers, color, radius) {
    if (!markers || markers.length === 0) return;
    ctx.save();
    ctx.fillStyle = color;
    for (var i = 0; i < markers.length; i++) {
        ctx.beginPath();
        ctx.arc(markers[i].x, markers[i].y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

/* ============================================================
   Переключение режима
   ============================================================ */

function lrSwitchMode(mode) {
    layerReplacement.mode = mode;
    document.getElementById('contentAwareContainer').style.display = (mode === 'content-aware') ? 'block' : 'none';
    document.getElementById('maskTransferContainer').style.display = (mode === 'mask-transfer') ? 'block' : 'none';
    document.getElementById('cloneStampContainer').style.display = (mode === 'clone-stamp') ? 'block' : 'none';
    lrDeactivateAll();
    lrRedrawOverlay();
}

function lrDeactivateAll() {
    lrDeactivateCA();
    lrDeactivateMT();
    lrDeactivateCS();
}

/* ============================================================
   Режим A: Content-Aware Replace
   ============================================================ */

var _caDrawingHandler = null;
var _caUpHandler = null;

function lrActivateCASource() {
    lrDeactivateAll();
    layerReplacement.caDrawingTarget = false;
    _lrStartCADrawing();
    _lrUpdateCAButtonStates();
}

function lrActivateCATarget() {
    lrDeactivateAll();
    layerReplacement.caDrawingTarget = true;
    _lrStartCADrawing();
    _lrUpdateCAButtonStates();
}

function _lrStartCADrawing() {
    var mainCanvas = document.getElementById('canvas');
    if (!mainCanvas) return;
    mainCanvas.style.cursor = 'crosshair';

    function onMove(e) {
        if (!e.buttons && !e._touch) return;
        var pos = _lrGetCanvasPos(e);
        var markers = layerReplacement.caDrawingTarget
            ? layerReplacement.caTargetMarkers
            : layerReplacement.caSourceMarkers;
        markers.push(pos);
        lrRedrawOverlay();
    }
    function onDown(e) {
        var pos = _lrGetCanvasPos(e);
        var markers = layerReplacement.caDrawingTarget
            ? layerReplacement.caTargetMarkers
            : layerReplacement.caSourceMarkers;
        markers.push(pos);
        lrRedrawOverlay();
    }
    function onUp() {
        // Keep active for continuous drawing
    }

    mainCanvas.addEventListener('mousemove', onMove);
    mainCanvas.addEventListener('mousedown', onDown);
    _caDrawingHandler = onMove;
    _caUpHandler = onDown;
}

function lrDeactivateCA() {
    var mainCanvas = document.getElementById('canvas');
    if (!mainCanvas) return;
    mainCanvas.style.cursor = '';
    if (_caDrawingHandler) { mainCanvas.removeEventListener('mousemove', _caDrawingHandler); _caDrawingHandler = null; }
    if (_caUpHandler) { mainCanvas.removeEventListener('mousedown', _caUpHandler); _caUpHandler = null; }
}

function _lrUpdateCAButtonStates() {
    var srcBtn = document.getElementById('caBtnSource');
    var tgtBtn = document.getElementById('caBtnTarget');
    if (!srcBtn || !tgtBtn) return;
    var isTarget = layerReplacement.caDrawingTarget;
    srcBtn.classList.toggle('primary', !isTarget);
    tgtBtn.classList.toggle('primary', isTarget);
}

function lrClearCAMarkers() {
    layerReplacement.caSourceMarkers = [];
    layerReplacement.caTargetMarkers = [];
    lrDeactivateCA();
    lrRedrawOverlay();
}

/**
 * Применяет Content-Aware Replace:
 * 1. Из исходного слоя извлекает регион вокруг зелёных маркеров.
 * 2. Масштабирует под регион синих маркеров на целевом слое.
 * 3. Вставляет с feathering.
 */
function lrApplyContentAware() {
    var srcId = document.getElementById('caSourceLayer').value;
    var tgtId = document.getElementById('caTargetLayer').value;
    if (srcId === tgtId) {
        alert('Слой-источник и слой-назначение должны быть разными!');
        return;
    }
    var srcIdx = lrLayerIndexById(srcId);
    var tgtIdx = lrLayerIndexById(tgtId);
    if (srcIdx < 0 || tgtIdx < 0) { alert('Слой не найден'); return; }
    if (layerReplacement.caSourceMarkers.length === 0) { alert('Выделите объект на источнике (зелёным маркером)'); return; }
    if (layerReplacement.caTargetMarkers.length === 0) { alert('Выделите целевую область на назначении (синим маркером)'); return; }

    var feather = parseInt(document.getElementById('caFeather').value, 10) || 0;
    var autoScale = document.getElementById('caAutoScale').checked;

    var srcData = lrGetLayerImageData(srcIdx);
    var tgtData = lrGetLayerImageData(tgtIdx);
    if (!srcData || !tgtData) { alert('Не удалось получить данные слоёв'); return; }

    var sW = srcData.width, sH = srcData.height;
    var tW = tgtData.width, tH = tgtData.height;

    // Bounding box source markers (canvas coords → image coords)
    var srcBB = _lrMarkersBB(layerReplacement.caSourceMarkers, sW, sH);
    var tgtBB = _lrMarkersBB(layerReplacement.caTargetMarkers, tW, tH);

    if (!srcBB || !tgtBB) { alert('Не удалось определить bounding box маркеров'); return; }

    // Вырезаем регион из исходного слоя
    var cropW = Math.max(1, srcBB.w);
    var cropH = Math.max(1, srcBB.h);
    var cropData = new ImageData(cropW, cropH);
    for (var cy = 0; cy < cropH; cy++) {
        for (var cx = 0; cx < cropW; cx++) {
            var sx = srcBB.x + cx;
            var sy = srcBB.y + cy;
            if (sx < 0 || sx >= sW || sy < 0 || sy >= sH) continue;
            var si = (sy * sW + sx) * 4;
            var di = (cy * cropW + cx) * 4;
            cropData.data[di] = srcData.data[si];
            cropData.data[di + 1] = srcData.data[si + 1];
            cropData.data[di + 2] = srcData.data[si + 2];
            cropData.data[di + 3] = srcData.data[si + 3];
        }
    }

    // Масштабируем под целевую область
    var destW = autoScale ? Math.max(1, tgtBB.w) : cropW;
    var destH = autoScale ? Math.max(1, tgtBB.h) : cropH;
    var scaledData = lrResizeImageData(cropData, destW, destH);

    // Применяем feathering
    if (feather > 0) {
        lrGaussianBlurAlpha(scaledData, feather);
    }

    // Вставляем в целевой слой
    var opacity = parseInt(document.getElementById('caOpacity').value, 10) / 100;
    var result = new ImageData(new Uint8ClampedArray(tgtData.data), tW, tH);
    for (var py = 0; py < destH; py++) {
        for (var px = 0; px < destW; px++) {
            var tx = tgtBB.x + px;
            var ty = tgtBB.y + py;
            if (tx < 0 || tx >= tW || ty < 0 || ty >= tH) continue;
            var ti = (ty * tW + tx) * 4;
            var si2 = (py * destW + px) * 4;
            var srcPx = [scaledData.data[si2], scaledData.data[si2 + 1], scaledData.data[si2 + 2], scaledData.data[si2 + 3]];
            var dstPx = [result.data[ti], result.data[ti + 1], result.data[ti + 2], result.data[ti + 3]];
            var blended = lrAlphaBlend(srcPx, dstPx, opacity);
            result.data[ti] = blended[0];
            result.data[ti + 1] = blended[1];
            result.data[ti + 2] = blended[2];
            result.data[ti + 3] = blended[3];
        }
    }

    lrApplyToLayer(tgtIdx, result);
    lrClearCAMarkers();
    lrShowHint('✅ Замена применена!');
}

/**
 * Вычисляет bounding box из массива точек маркеров.
 * Точки хранятся в координатах canvas (CSS-пиксели), нужно пересчитать в пиксели изображения.
 */
function _lrMarkersBB(markers, imgW, imgH) {
    if (!markers || markers.length === 0) return null;
    var mainCanvas = document.getElementById('canvas');
    if (!mainCanvas) return null;

    var scaleX = imgW / mainCanvas.width;
    var scaleY = imgH / mainCanvas.height;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < markers.length; i++) {
        var ix = markers[i].x * scaleX;
        var iy = markers[i].y * scaleY;
        if (ix < minX) minX = ix;
        if (ix > maxX) maxX = ix;
        if (iy < minY) minY = iy;
        if (iy > maxY) maxY = iy;
    }
    minX = Math.max(0, Math.floor(minX));
    minY = Math.max(0, Math.floor(minY));
    maxX = Math.min(imgW - 1, Math.ceil(maxX));
    maxY = Math.min(imgH - 1, Math.ceil(maxY));
    var w = maxX - minX + 1;
    var h = maxY - minY + 1;
    if (w <= 0 || h <= 0) return null;
    return { x: minX, y: minY, w: w, h: h };
}

/* ============================================================
   Режим B: Mask Transfer
   ============================================================ */

var _mtDrawingHandler = null;
var _mtDownHandler = null;

function lrActivateMaskDraw() {
    lrDeactivateAll();
    var mainCanvas = document.getElementById('canvas');
    if (!mainCanvas) return;
    mainCanvas.style.cursor = 'crosshair';

    function onMove(e) {
        if (!e.buttons) return;
        layerReplacement.mtMaskMarkers.push(_lrGetCanvasPos(e));
        lrRedrawOverlay();
    }
    function onDown(e) {
        layerReplacement.mtMaskMarkers.push(_lrGetCanvasPos(e));
        lrRedrawOverlay();
    }

    mainCanvas.addEventListener('mousemove', onMove);
    mainCanvas.addEventListener('mousedown', onDown);
    _mtDrawingHandler = onMove;
    _mtDownHandler = onDown;
}

function lrDeactivateMT() {
    var mainCanvas = document.getElementById('canvas');
    if (!mainCanvas) return;
    mainCanvas.style.cursor = '';
    if (_mtDrawingHandler) { mainCanvas.removeEventListener('mousemove', _mtDrawingHandler); _mtDrawingHandler = null; }
    if (_mtDownHandler) { mainCanvas.removeEventListener('mousedown', _mtDownHandler); _mtDownHandler = null; }
}

/**
 * Применяет Mask Transfer:
 * 1. Создаёт маску из маркеров на источнике.
 * 2. Копирует пиксели из источника в назначение по маске.
 */
function lrApplyMaskTransfer() {
    var srcId = document.getElementById('mtSourceLayer').value;
    var tgtId = document.getElementById('mtTargetLayer').value;
    if (srcId === tgtId) { alert('Слой-источник и слой-назначение должны быть разными!'); return; }
    var srcIdx = lrLayerIndexById(srcId);
    var tgtIdx = lrLayerIndexById(tgtId);
    if (srcIdx < 0 || tgtIdx < 0) { alert('Слой не найден'); return; }
    if (layerReplacement.mtMaskMarkers.length === 0) { alert('Создайте маску на источнике'); return; }

    var srcData = lrGetLayerImageData(srcIdx);
    var tgtData = lrGetLayerImageData(tgtIdx);
    if (!srcData || !tgtData) { alert('Не удалось получить данные слоёв'); return; }

    var feather = parseInt(document.getElementById('mtFeather').value, 10) || 0;
    var threshold = parseInt(document.getElementById('mtThreshold').value, 10) / 100;
    var strength = parseInt(document.getElementById('mtStrength').value, 10) / 100;
    var transferMode = document.querySelector('input[name="mtMode"]:checked').value;
    var keepAlpha = document.getElementById('mtKeepAlpha').checked;

    var W = Math.min(srcData.width, tgtData.width);
    var H = Math.min(srcData.height, tgtData.height);

    // Создаём маску из маркеров (простая маска close-point на основе маркеров)
    var maskCanvas = document.createElement('canvas');
    maskCanvas.width = W;
    maskCanvas.height = H;
    var maskCtx = maskCanvas.getContext('2d');
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, W, H);

    var mainCanvas = document.getElementById('canvas');
    var scaleX = W / mainCanvas.width;
    var scaleY = H / mainCanvas.height;
    // MIN_BRUSH_RADIUS: minimum brush size regardless of feather setting
    // FEATHER_MULTIPLIER: scales feather slider value to brush radius
    // BRUSH_BASE_SIZE: constant added to brush radius
    var MIN_BRUSH_RADIUS = 20;
    var FEATHER_MULTIPLIER = 2;
    var BRUSH_BASE_SIZE = 10;
    var brushR = Math.max(MIN_BRUSH_RADIUS, parseInt(document.getElementById('mtFeather').value, 10) * FEATHER_MULTIPLIER + BRUSH_BASE_SIZE);

    maskCtx.fillStyle = 'white';
    for (var i = 0; i < layerReplacement.mtMaskMarkers.length; i++) {
        var mx = layerReplacement.mtMaskMarkers[i].x * scaleX;
        var my = layerReplacement.mtMaskMarkers[i].y * scaleY;
        maskCtx.beginPath();
        maskCtx.arc(mx, my, brushR, 0, Math.PI * 2);
        maskCtx.fill();
    }

    var maskImgData = maskCtx.getImageData(0, 0, W, H);

    // MASK_FEATHER_MULTIPLIER: feather radius is tripled so the blur covers the
    // full transition zone between masked and unmasked regions.
    var MASK_FEATHER_MULTIPLIER = 3;
    if (feather > 0) {
        lrGaussianBlurAlpha(maskImgData, feather * MASK_FEATHER_MULTIPLIER);
        // Переносим красный канал (белое=255 серый) к альфа-каналу:
        var md = maskImgData.data;
        for (var p = 0; p < W * H; p++) {
            md[p * 4 + 3] = md[p * 4]; // R → alpha
        }
    } else {
        var md = maskImgData.data;
        for (var p = 0; p < W * H; p++) {
            md[p * 4 + 3] = md[p * 4];
        }
    }

    var result = new ImageData(new Uint8ClampedArray(tgtData.data.subarray(0, W * H * 4)), W, H);

    for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
            var idx = (y * W + x) * 4;
            var maskVal = maskImgData.data[idx + 3] / 255; // 0-1
            if (transferMode === 'invert') maskVal = 1 - maskVal;

            if (maskVal < threshold) continue;

            var blendFactor = (transferMode === 'blend') ? maskVal * strength : strength;

            var sR = srcData.data[idx], sG = srcData.data[idx + 1], sB = srcData.data[idx + 2], sA = srcData.data[idx + 3];
            var dR = result.data[idx], dG = result.data[idx + 1], dB = result.data[idx + 2], dA = result.data[idx + 3];

            result.data[idx] = Math.round(sR * blendFactor + dR * (1 - blendFactor));
            result.data[idx + 1] = Math.round(sG * blendFactor + dG * (1 - blendFactor));
            result.data[idx + 2] = Math.round(sB * blendFactor + dB * (1 - blendFactor));
            if (!keepAlpha) {
                result.data[idx + 3] = Math.round(sA * blendFactor + dA * (1 - blendFactor));
            }
        }
    }

    lrApplyToLayer(tgtIdx, result);
    layerReplacement.mtMaskMarkers = [];
    lrRedrawOverlay();
    lrShowHint('✅ Перенос маски применён!');
}

function lrPreviewMask() {
    lrRedrawOverlay();
    var oc = layerReplacement.overlayCanvas;
    if (!oc) return;
    var ctx = layerReplacement.overlayCtx;
    var mainCanvas = document.getElementById('canvas');
    if (!mainCanvas) return;

    var W = mainCanvas.width;
    var H = mainCanvas.height;
    var brushR = 20;

    ctx.save();
    ctx.fillStyle = 'rgba(255,210,0,0.25)';
    for (var i = 0; i < layerReplacement.mtMaskMarkers.length; i++) {
        ctx.beginPath();
        ctx.arc(layerReplacement.mtMaskMarkers[i].x, layerReplacement.mtMaskMarkers[i].y, brushR, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

/* ============================================================
   Режим C: Clone Stamp Between Layers
   ============================================================ */

var _csMouseMoveHandler = null;
var _csMouseDownHandler = null;
var _csMouseUpHandler = null;

function lrActivateCloneStamp() {
    lrDeactivateAll();
    layerReplacement.csIsActive = true;
    var mainCanvas = document.getElementById('canvas');
    if (!mainCanvas) return;
    mainCanvas.style.cursor = 'crosshair';

    function onDown(e) {
        if (e.altKey) {
            // Alt+Click — установить точку источника
            var pos = _lrGetCanvasPos(e);
            var srcId = document.getElementById('csSrcLayer').value;
            var srcIdx = lrLayerIndexById(srcId);
            layerReplacement.csSourcePoint = { x: pos.x, y: pos.y, layerIndex: srcIdx };
            layerReplacement.csAlignedOffset = null;
            lrRedrawOverlay();
            lrShowHint('📍 Точка источника установлена');
            return;
        }
        if (!layerReplacement.csSourcePoint) {
            lrShowHint('⚠️ Сначала установите точку источника (Alt+Click)');
            return;
        }
        layerReplacement.csIsDrawing = true;
        var aligned = document.getElementById('csAligned').checked;
        if (!aligned) {
            layerReplacement.csPrevPos = null;
            layerReplacement.csAlignedOffset = null;
        }
        var pos = _lrGetCanvasPos(e);
        _csApplyStroke(pos);
    }
    function onMove(e) {
        if (!layerReplacement.csIsDrawing) return;
        var pos = _lrGetCanvasPos(e);
        _csApplyStroke(pos);
    }
    function onUp() {
        layerReplacement.csIsDrawing = false;
        layerReplacement.csPrevPos = null;
    }

    mainCanvas.addEventListener('mousedown', onDown);
    mainCanvas.addEventListener('mousemove', onMove);
    mainCanvas.addEventListener('mouseup', onUp);
    _csMouseDownHandler = onDown;
    _csMouseMoveHandler = onMove;
    _csMouseUpHandler = onUp;
}

function lrDeactivateCS() {
    var mainCanvas = document.getElementById('canvas');
    if (!mainCanvas) return;
    mainCanvas.style.cursor = '';
    layerReplacement.csIsActive = false;
    layerReplacement.csIsDrawing = false;
    if (_csMouseDownHandler) { mainCanvas.removeEventListener('mousedown', _csMouseDownHandler); _csMouseDownHandler = null; }
    if (_csMouseMoveHandler) { mainCanvas.removeEventListener('mousemove', _csMouseMoveHandler); _csMouseMoveHandler = null; }
    if (_csMouseUpHandler) { mainCanvas.removeEventListener('mouseup', _csMouseUpHandler); _csMouseUpHandler = null; }
}

function lrSetSourcePointMode() {
    var mainCanvas = document.getElementById('canvas');
    if (!mainCanvas) return;
    lrShowHint('Alt+Click на canvas для установки точки источника');
}

function lrResetCloneStamp() {
    layerReplacement.csSourcePoint = null;
    layerReplacement.csAlignedOffset = null;
    layerReplacement.csIsDrawing = false;
    lrDeactivateCS();
    lrRedrawOverlay();
}

/**
 * Применяет один "мазок" штампа.
 */
function _csApplyStroke(pos) {
    var sp = layerReplacement.csSourcePoint;
    if (!sp) return;

    var srcId = document.getElementById('csSrcLayer').value;
    var tgtId = document.getElementById('csTgtLayer').value;
    if (srcId === tgtId) return;

    var srcIdx = lrLayerIndexById(srcId);
    var tgtIdx = lrLayerIndexById(tgtId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    var brushSize = parseInt(document.getElementById('csBrushSize').value, 10) || 20;
    var hardness = parseInt(document.getElementById('csBrushHardness').value, 10) / 100;
    var opacity = parseInt(document.getElementById('csBrushOpacity').value, 10) / 100;
    var blendMode = document.getElementById('csBlendMode').value;
    var aligned = document.getElementById('csAligned').checked;

    var srcData = lrGetLayerImageData(srcIdx);
    var tgtData = lrGetLayerImageData(tgtIdx);
    if (!srcData || !tgtData) return;

    var sW = srcData.width, sH = srcData.height;
    var tW = tgtData.width, tH = tgtData.height;

    var mainCanvas = document.getElementById('canvas');
    var scaleX_s = sW / mainCanvas.width;
    var scaleY_s = sH / mainCanvas.height;
    var scaleX_t = tW / mainCanvas.width;
    var scaleY_t = tH / mainCanvas.height;

    // Вычисляем offset источника
    if (aligned && layerReplacement.csAlignedOffset === null) {
        layerReplacement.csAlignedOffset = { dx: sp.x - pos.x, dy: sp.y - pos.y };
    }

    var offsetX = aligned
        ? (layerReplacement.csAlignedOffset ? layerReplacement.csAlignedOffset.dx : sp.x - pos.x)
        : sp.x - pos.x;
    var offsetY = aligned
        ? (layerReplacement.csAlignedOffset ? layerReplacement.csAlignedOffset.dy : sp.y - pos.y)
        : sp.y - pos.y;

    var result = new ImageData(new Uint8ClampedArray(tgtData.data), tW, tH);
    var radius = brushSize / 2;

    var tx0 = Math.max(0, Math.floor((pos.x - radius) * scaleX_t));
    var ty0 = Math.max(0, Math.floor((pos.y - radius) * scaleY_t));
    var tx1 = Math.min(tW - 1, Math.ceil((pos.x + radius) * scaleX_t));
    var ty1 = Math.min(tH - 1, Math.ceil((pos.y + radius) * scaleY_t));

    for (var ty = ty0; ty <= ty1; ty++) {
        for (var tx = tx0; tx <= tx1; tx++) {
            // Canvas coords of this pixel
            var cpx = tx / scaleX_t;
            var cpy = ty / scaleY_t;
            var dist = Math.sqrt((cpx - pos.x) * (cpx - pos.x) + (cpy - pos.y) * (cpy - pos.y));
            if (dist > radius) continue;

            // Вычисляем вес кисти (soft / hard)
            var brushAlpha;
            if (hardness >= 1) {
                brushAlpha = 1;
            } else {
                var softEdge = radius * (1 - hardness);
                brushAlpha = softEdge > 0 ? Math.max(0, 1 - Math.max(0, dist - (radius - softEdge)) / softEdge) : 1;
            }

            // Координаты в источнике
            var srcCpx = cpx + offsetX;
            var srcCpy = cpy + offsetY;
            var sx = Math.round(srcCpx * scaleX_s);
            var sy = Math.round(srcCpy * scaleY_s);
            if (sx < 0 || sx >= sW || sy < 0 || sy >= sH) continue;

            var si = (sy * sW + sx) * 4;
            var di = (ty * tW + tx) * 4;

            var sR = srcData.data[si], sG = srcData.data[si + 1], sB = srcData.data[si + 2], sA = srcData.data[si + 3];
            var dR = result.data[di], dG = result.data[di + 1], dB = result.data[di + 2], dA = result.data[di + 3];

            var effectiveOpacity = brushAlpha * opacity;

            var outR, outG, outB;
            if (blendMode === 'multiply') {
                outR = (sR * dR) / 255;
                outG = (sG * dG) / 255;
                outB = (sB * dB) / 255;
            } else if (blendMode === 'screen') {
                outR = 255 - ((255 - sR) * (255 - dR)) / 255;
                outG = 255 - ((255 - sG) * (255 - dG)) / 255;
                outB = 255 - ((255 - sB) * (255 - dB)) / 255;
            } else if (blendMode === 'overlay') {
                outR = dR < 128 ? (2 * sR * dR / 255) : (255 - 2 * (255 - sR) * (255 - dR) / 255);
                outG = dG < 128 ? (2 * sG * dG / 255) : (255 - 2 * (255 - sG) * (255 - dG) / 255);
                outB = dB < 128 ? (2 * sB * dB / 255) : (255 - 2 * (255 - sB) * (255 - dB) / 255);
            } else {
                outR = sR; outG = sG; outB = sB;
            }

            result.data[di] = Math.round(outR * effectiveOpacity + dR * (1 - effectiveOpacity));
            result.data[di + 1] = Math.round(outG * effectiveOpacity + dG * (1 - effectiveOpacity));
            result.data[di + 2] = Math.round(outB * effectiveOpacity + dB * (1 - effectiveOpacity));
            result.data[di + 3] = Math.max(dA, Math.round(sA * effectiveOpacity));
        }
    }

    lrApplyToLayer(tgtIdx, result);
}

/* ============================================================
   Утилиты: получение координат курсора на canvas
   ============================================================ */

function _lrGetCanvasPos(e) {
    var mainCanvas = document.getElementById('canvas');
    var rect = mainCanvas.getBoundingClientRect();
    var clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    var clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    // Масштаб CSS → canvas
    var cssScaleX = mainCanvas.width / rect.width;
    var cssScaleY = mainCanvas.height / rect.height;
    return {
        x: (clientX - rect.left) * cssScaleX,
        y: (clientY - rect.top) * cssScaleY
    };
}

/* ============================================================
   Заполнение dropdown-ов слоёв
   ============================================================ */

function lrPopulateLayerDropdowns() {
    var dropdownIds = ['caSourceLayer', 'caTargetLayer', 'mtSourceLayer', 'mtTargetLayer', 'csSrcLayer', 'csTgtLayer'];
    dropdownIds.forEach(function (id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        var prevVal = sel.value;
        sel.innerHTML = '';
        layers.forEach(function (layer, idx) {
            if (layer && layer.image) {
                var opt = document.createElement('option');
                opt.value = layer.id;
                opt.textContent = (layer.name || ('Слой ' + layer.id));
                sel.appendChild(opt);
            }
        });
        // Restore selection if still valid
        if (prevVal && sel.querySelector('option[value="' + prevVal + '"]')) {
            sel.value = prevVal;
        }
    });
}

/* ============================================================
   Горячие клавиши
   ============================================================ */

document.addEventListener('keydown', function (e) {
    // Ctrl+L — открыть таб "Замена слоёв"
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        var btn = document.querySelector('.tab-btn[onclick*="layer-replace"]');
        if (btn) btn.click();
        return;
    }

    // Только если активен таб layer-replace
    if (typeof currentTab !== 'undefined' && currentTab !== 'layer-replace') return;

    if (e.key === '1') {
        document.getElementById('replaceMode').value = 'content-aware';
        lrSwitchMode('content-aware');
    } else if (e.key === '2') {
        document.getElementById('replaceMode').value = 'mask-transfer';
        lrSwitchMode('mask-transfer');
    } else if (e.key === '3') {
        document.getElementById('replaceMode').value = 'clone-stamp';
        lrSwitchMode('clone-stamp');
    }

    // [ / ] для размера кисти Clone Stamp
    if (e.key === '[') {
        var el = document.getElementById('csBrushSize');
        if (el) { el.value = Math.max(5, parseInt(el.value, 10) - 5); }
    } else if (e.key === ']') {
        var el = document.getElementById('csBrushSize');
        if (el) { el.value = Math.min(200, parseInt(el.value, 10) + 5); }
    }
});

/* ============================================================
   Подсказка
   ============================================================ */

function lrShowHint(msg) {
    if (typeof showHint === 'function') {
        showHint(msg);
    } else {
        console.log('[LayerReplacement]', msg);
    }
}

/* ============================================================
   Инициализация при переключении на таб
   ============================================================ */

function lrOnTabActivate() {
    lrInitOverlay();
    lrPopulateLayerDropdowns();
    lrSwitchMode(layerReplacement.mode);
}
