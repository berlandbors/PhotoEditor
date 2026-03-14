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
    mode: 'erase',           // 'erase' | 'restore' | 'smart'
    lastX: 0,
    lastY: 0,
    originalImageData: null, // Резервная копия для восстановления
    history: [],             // История изменений
    historyIndex: -1,
    maxHistory: 20
};

/**
 * Активировать инструмент ластика
 */
function activateEraser() {
    eraserState.active = true;

    // Сохранить оригинал активного слоя
    var layer = layers[activeLayerIndex];
    if (layer && layer.image) {
        var tempCanvas = document.createElement('canvas');
        var tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = layer.image.width;
        tempCanvas.height = layer.image.height;
        tempCtx.drawImage(layer.image, 0, 0);
        eraserState.originalImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    }

    // Изменить курсор
    canvas.style.cursor = 'crosshair';
    canvas.classList.add('eraser-active');

    // Подписаться на события
    canvas.addEventListener('mousedown', startErasing);
    canvas.addEventListener('mousemove', continueErasing);
    canvas.addEventListener('mouseup', stopErasing);
    canvas.addEventListener('mouseleave', stopErasing);

    showHint('Ластик активирован. ЛКМ — стереть, ПКМ — восстановить');
}

/**
 * Деактивировать ластик
 */
function deactivateEraser() {
    eraserState.active = false;
    eraserState.isErasing = false;

    canvas.style.cursor = '';
    canvas.classList.remove('eraser-active');

    canvas.removeEventListener('mousedown', startErasing);
    canvas.removeEventListener('mousemove', continueErasing);
    canvas.removeEventListener('mouseup', stopErasing);
    canvas.removeEventListener('mouseleave', stopErasing);

    // Перерисовать без курсора кисти
    render();

    showHint('Ластик выключен');
}

/**
 * Начать стирание (mousedown)
 */
function startErasing(e) {
    if (!eraserState.active) return;

    e.preventDefault();
    eraserState.isErasing = true;

    // ПКМ = восстановление
    if (e.button === 2) {
        eraserState.mode = 'restore';
    } else {
        eraserState.mode = document.getElementById('eraserMode').value;
    }

    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / canvasZoom;
    var y = (e.clientY - rect.top) / canvasZoom;

    eraserState.lastX = x;
    eraserState.lastY = y;

    // Сохранить состояние в историю
    saveEraserHistory();

    // Если умный ластик — удалить похожие цвета
    if (eraserState.mode === 'smart') {
        applySmartErase(x, y);
    } else {
        applyErase(x, y);
    }
}

/**
 * Продолжить стирание (mousemove)
 */
function continueErasing(e) {
    if (!eraserState.active) return;

    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / canvasZoom;
    var y = (e.clientY - rect.top) / canvasZoom;

    // Отобразить курсор-кисть
    drawBrushCursor(x, y);

    if (!eraserState.isErasing) return;

    e.preventDefault();

    // Интерполяция — рисовать линию между lastX/lastY и x/y
    interpolateErase(eraserState.lastX, eraserState.lastY, x, y);

    eraserState.lastX = x;
    eraserState.lastY = y;
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
        applyErase(x, y);
    }
}

/**
 * Применить стирание/восстановление в точке (x, y)
 */
function applyErase(x, y) {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.image) return;

    // Получить координаты в системе слоя
    var layerX = Math.round((x - layer.x) / layer.scale);
    var layerY = Math.round((y - layer.y) / layer.scale);

    // Создать временный canvas для редактирования
    var tempCanvas = document.createElement('canvas');
    var tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.image.width;
    tempCanvas.height = layer.image.height;
    tempCtx.drawImage(layer.image, 0, 0);

    var imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    var data = imageData.data;

    var brushRadius = eraserState.brushSize / 2;
    var hardness = eraserState.brushHardness / 100;
    var opacity = eraserState.brushOpacity / 100;

    var dyInt, dxInt;
    for (dyInt = Math.ceil(-brushRadius); dyInt <= Math.floor(brushRadius); dyInt++) {
        for (dxInt = Math.ceil(-brushRadius); dxInt <= Math.floor(brushRadius); dxInt++) {
            var px = layerX + dxInt;
            var py = layerY + dyInt;

            if (px < 0 || px >= tempCanvas.width || py < 0 || py >= tempCanvas.height) continue;

            var distance = Math.sqrt(dxInt * dxInt + dyInt * dyInt);
            if (distance > brushRadius) continue;

            // Вычислить силу стирания (с учётом мягкости)
            var strength = 1;
            if (hardness < 1) {
                // Мягкая кисть — градиент от центра к краю
                var softRadius = brushRadius * (1 - hardness);
                if (distance > softRadius && brushRadius > softRadius) {
                    strength = 1 - (distance - softRadius) / (brushRadius - softRadius);
                }
            }
            strength *= opacity;

            var idx = (py * tempCanvas.width + px) * 4;

            if (eraserState.mode === 'restore') {
                // Восстановить из оригинала
                if (eraserState.originalImageData) {
                    var origData = eraserState.originalImageData.data;
                    data[idx]     = eraserLerp(data[idx],     origData[idx],     strength);
                    data[idx + 1] = eraserLerp(data[idx + 1], origData[idx + 1], strength);
                    data[idx + 2] = eraserLerp(data[idx + 2], origData[idx + 2], strength);
                    data[idx + 3] = eraserLerp(data[idx + 3], origData[idx + 3], strength);
                }
            } else {
                // Стирание — уменьшить альфа-канал
                data[idx + 3] = Math.max(0, data[idx + 3] - 255 * strength);
            }
        }
    }

    tempCtx.putImageData(imageData, 0, 0);

    // Обновить изображение слоя через onload для корректного рендера
    var newImg = new Image();
    newImg.onload = function() {
        layer.image = newImg;
        render();
    };
    newImg.src = tempCanvas.toDataURL('image/png');
}

/**
 * Умное стирание (удаление похожих цветов)
 */
function applySmartErase(x, y) {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.image) return;

    var layerX = Math.round((x - layer.x) / layer.scale);
    var layerY = Math.round((y - layer.y) / layer.scale);

    var tempCanvas = document.createElement('canvas');
    var tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.image.width;
    tempCanvas.height = layer.image.height;
    tempCtx.drawImage(layer.image, 0, 0);

    var imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    var data = imageData.data;

    // Получить цвет в точке клика
    var idx = (layerY * tempCanvas.width + layerX) * 4;
    var targetR = data[idx];
    var targetG = data[idx + 1];
    var targetB = data[idx + 2];

    // Толерантность из UI
    var tolerance = parseInt(document.getElementById('smartEraseTolerance').value);

    // Удалить похожие цвета в радиусе кисти
    var brushRadius = eraserState.brushSize / 2;
    for (var dy = -brushRadius; dy <= brushRadius; dy++) {
        for (var dx = -brushRadius; dx <= brushRadius; dx++) {
            var px = layerX + dx;
            var py = layerY + dy;

            if (px < 0 || px >= tempCanvas.width || py < 0 || py >= tempCanvas.height) continue;

            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > brushRadius) continue;

            var i = (py * tempCanvas.width + px) * 4;
            var colorDist = Math.sqrt(
                Math.pow(data[i] - targetR, 2) +
                Math.pow(data[i + 1] - targetG, 2) +
                Math.pow(data[i + 2] - targetB, 2)
            );

            if (colorDist < tolerance) {
                data[i + 3] = 0; // Прозрачный
            }
        }
    }

    tempCtx.putImageData(imageData, 0, 0);

    var newImg = new Image();
    newImg.onload = function() {
        layer.image = newImg;
        render();
    };
    newImg.src = tempCanvas.toDataURL('image/png');
}

/**
 * Сохранить текущее состояние в историю
 */
function saveEraserHistory() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.image) return;

    var tempCanvas = document.createElement('canvas');
    var tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.image.width;
    tempCanvas.height = layer.image.height;
    tempCtx.drawImage(layer.image, 0, 0);
    var snapshot = tempCanvas.toDataURL('image/png');

    // Удалить все состояния после текущего индекса
    eraserState.history = eraserState.history.slice(0, eraserState.historyIndex + 1);

    // Добавить новое состояние
    eraserState.history.push(snapshot);

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
 * Применить изменения к слою (сохранить финальное состояние)
 */
function commitEraseToLayer() {
    render();
}

/**
 * Отобразить курсор-кисть поверх холста
 */
function drawBrushCursor(x, y) {
    if (!eraserState.active) return;

    // Перерисовать сцену
    render();

    var ctx2d = canvas.getContext('2d');
    ctx2d.save();
    ctx2d.strokeStyle = eraserState.mode === 'restore' ? '#00ff00' : '#ff0000';
    ctx2d.lineWidth = 1.5;
    ctx2d.setLineDash([4, 4]);
    ctx2d.beginPath();
    ctx2d.arc(x, y, eraserState.brushSize / 2, 0, Math.PI * 2);
    ctx2d.stroke();
    ctx2d.restore();
}

/**
 * Линейная интерполяция
 */
function eraserLerp(a, b, t) {
    return Math.round(a + (b - a) * t);
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
