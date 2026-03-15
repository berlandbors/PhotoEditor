/**
 * eraser-tool.js — интерактивный инструмент ластика
 */

'use strict';

var eraserState = {
    active: false,           // Активен ли инструмент
    isErasing: false,        // Идёт ли сейчас рисование
    brushSize: 20,           // Размер кисти (px)
    brushHardness: 50,       // Жёсткость (0-100, 0=мягкая, 100=жёсткая)
    brushOpacity: 100,       // Прозрачность кисти (10-100%)
    mode: 'erase',           // 'erase' | 'restore' | 'smart'
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
        applyErase(x, y);
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

    var imageData = ectx.getImageData(0, 0, ec.width, ec.height);
    var data = imageData.data;

    var brushRadius = eraserState.brushSize / 2;
    if (brushRadius <= 0) return;
    var hardness = eraserState.brushHardness / 100;
    var opacity = eraserState.brushOpacity / 100;

    var dyInt, dxInt;
    for (dyInt = Math.ceil(-brushRadius); dyInt <= Math.floor(brushRadius); dyInt++) {
        for (dxInt = Math.ceil(-brushRadius); dxInt <= Math.floor(brushRadius); dxInt++) {
            var px = layerX + dxInt;
            var py = layerY + dyInt;

            if (px < 0 || px >= ec.width || py < 0 || py >= ec.height) continue;

            var distance = Math.sqrt(dxInt * dxInt + dyInt * dyInt);
            if (distance > brushRadius) continue;

            // Вычислить силу стирания (с учётом мягкости и плавной кривой)
            // hardness=0 → мягкая кисть (плавная растушёвка), hardness=1 → жёсткая
            var strength = 1;
            var normalizedDistance = distance / brushRadius; // 0..1

            if (hardness < 1) {
                if (normalizedDistance <= hardness) {
                    // Жёсткая зона: полная сила
                    strength = 1;
                } else {
                    // Мягкая зона: плавное затухание с ease-out кривой
                    var t = (normalizedDistance - hardness) / (1 - hardness);
                    // Ease-out cubic для более плавного затухания
                    strength = 1 - (t * t * t);
                }
            } else {
                // Полностью жёсткая кисть
                strength = 1;
            }

            strength *= opacity;

            var idx = (py * ec.width + px) * 4;

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
                // Стирание — плавное затухание альфа-канала
                data[idx + 3] = Math.round(data[idx + 3] * (1 - strength));
            }
        }
    }

    ectx.putImageData(imageData, 0, 0);
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

    var imageData = ectx.getImageData(0, 0, ec.width, ec.height);
    var data = imageData.data;

    // Получить цвет в точке клика
    var startIdx = (Math.min(Math.max(layerY, 0), ec.height - 1) * ec.width +
                    Math.min(Math.max(layerX, 0), ec.width - 1)) * 4;
    var targetR = data[startIdx];
    var targetG = data[startIdx + 1];
    var targetB = data[startIdx + 2];

    // Толерантность из UI
    var tolerance = parseInt(document.getElementById('smartEraseTolerance').value);

    // Удалить похожие цвета в радиусе кисти
    var brushRadius = eraserState.brushSize / 2;
    if (brushRadius <= 0) return;
    var hardness = eraserState.brushHardness / 100;
    var opacity = eraserState.brushOpacity / 100;
    var brushRadiusCeil = Math.ceil(brushRadius);
    for (var dy = -brushRadiusCeil; dy <= brushRadiusCeil; dy++) {
        for (var dx = -brushRadiusCeil; dx <= brushRadiusCeil; dx++) {
            var px = layerX + dx;
            var py = layerY + dy;

            if (px < 0 || px >= ec.width || py < 0 || py >= ec.height) continue;

            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > brushRadius) continue;

            var i = (py * ec.width + px) * 4;
            var colorDist = Math.sqrt(
                Math.pow(data[i] - targetR, 2) +
                Math.pow(data[i + 1] - targetG, 2) +
                Math.pow(data[i + 2] - targetB, 2)
            );

            if (colorDist <= tolerance) {
                // Растушёвка по краям кисти (hardness=0 → мягкая, hardness=1 → жёсткая)
                var strength = 1;
                var normalizedDist = dist / brushRadius; // 0..1
                if (hardness < 1) {
                    if (normalizedDist <= hardness) {
                        strength = 1;
                    } else {
                        var t = (normalizedDist - hardness) / (1 - hardness);
                        strength = 1 - (t * t * t);
                    }
                } else {
                    strength = 1;
                }
                strength *= opacity;
                // Дополнительное сглаживание по похожести цвета
                strength *= (1 - colorDist / tolerance);

                data[i + 3] = Math.round(data[i + 3] * (1 - strength));
            }
        }
    }

    ectx.putImageData(imageData, 0, 0);
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
    var cursorRadius = Math.max(1, (eraserState.brushSize / 2) * scale);

    var ctx2d = canvas.getContext('2d');
    ctx2d.save();
    var cursorColor = eraserState.mode === 'restore' ? 'rgba(0,220,100,0.9)' : 'rgba(255,255,255,0.9)';
    // Внешняя окружность (полный размер кисти)
    ctx2d.strokeStyle = cursorColor;
    ctx2d.lineWidth = 1.5;
    ctx2d.setLineDash([4, 4]);
    ctx2d.beginPath();
    ctx2d.arc(x, y, cursorRadius, 0, Math.PI * 2);
    ctx2d.stroke();
    // Внутренняя окружность (зона жёсткости, только при промежуточной жёсткости)
    var hardness = eraserState.brushHardness / 100;
    if (hardness > 0 && hardness < 1) {
        ctx2d.strokeStyle = eraserState.mode === 'restore' ? 'rgba(0,220,100,0.4)' : 'rgba(255,255,255,0.4)';
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
