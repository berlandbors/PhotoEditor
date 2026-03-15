// Layer manager - dynamic layer management, updating controls

// ===== УПРАВЛЕНИЕ СЛОЯМИ =====

/**
 * Добавить новый слой
 */
function addNewLayer() {
    if (layers.length >= MAX_LAYERS) {
        showHint(`Максимум ${MAX_LAYERS} слоёв`);
        return;
    }

    const newLayer = createNewLayer();
    layers.unshift(newLayer);

    const layerElement = createLayerElement(newLayer);
    document.getElementById('layersList').prepend(layerElement);

    selectLayerByIndex(0);

    updateLayerCount();
    updateAddButton();

    showHint(`Добавлен ${newLayer.name}`);
}

/**
 * Удалить слой
 */
function deleteLayer(button) {
    const layerItem = button.closest('.layer-item');
    const layerId = parseInt(layerItem.dataset.layerId);
    const layerIndex = layers.findIndex(l => l.id === layerId);

    if (layerIndex === -1) return;

    if (layers[layerIndex].image) {
        if (!confirm(`Удалить ${layers[layerIndex].name}?`)) return;
    }

    const deletedLayer = layers.splice(layerIndex, 1)[0];
    layerItem.remove();

    if (layers.length > 0) {
        const newIndex = Math.min(layerIndex, layers.length - 1);
        selectLayerByIndex(newIndex);
    } else {
        activeLayerIndex = -1;
        updateControls();
    }

    updateLayerCount();
    updateAddButton();
    render();

    showHint(`Удалён ${deletedLayer.name}`);
}

/**
 * Дублировать слой
 */
function duplicateLayer(button) {
    const layerItem = button.closest('.layer-item');
    const layerId = parseInt(layerItem.dataset.layerId);
    const layerIndex = layers.findIndex(l => l.id === layerId);

    if (layerIndex === -1 || layers.length >= MAX_LAYERS) return;

    const originalLayer = layers[layerIndex];
    const duplicatedLayer = JSON.parse(JSON.stringify(originalLayer));
    duplicatedLayer.id = nextLayerId++;
    duplicatedLayer.name = `${originalLayer.name} (копия)`;
    duplicatedLayer.image = originalLayer.image;

    layers.splice(layerIndex, 0, duplicatedLayer);

    const layerElement = createLayerElement(duplicatedLayer);
    layerItem.before(layerElement);

    selectLayerByIndex(layerIndex);
    updateLayerCount();
    updateAddButton();
    render();

    showHint(`Дублирован ${originalLayer.name}`);
}

/**
 * Переместить слой вверх (выше в списке = ниже по индексу в массиве)
 */
function moveLayerUp(button) {
    const layerItem = button.closest('.layer-item');
    const layerId = parseInt(layerItem.dataset.layerId);
    const layerIndex = layers.findIndex(l => l.id === layerId);

    if (layerIndex <= 0) return;

    [layers[layerIndex], layers[layerIndex - 1]] = [layers[layerIndex - 1], layers[layerIndex]];

    const prevItem = layerItem.previousElementSibling;
    if (prevItem) {
        layerItem.parentNode.insertBefore(layerItem, prevItem);
    }

    if (activeLayerIndex === layerIndex) {
        activeLayerIndex = layerIndex - 1;
    } else if (activeLayerIndex === layerIndex - 1) {
        activeLayerIndex = layerIndex;
    }

    render();
    showHint('Слой перемещён вверх');
}

/**
 * Переместить слой вниз
 */
function moveLayerDown(button) {
    const layerItem = button.closest('.layer-item');
    const layerId = parseInt(layerItem.dataset.layerId);
    const layerIndex = layers.findIndex(l => l.id === layerId);

    if (layerIndex >= layers.length - 1) return;

    [layers[layerIndex], layers[layerIndex + 1]] = [layers[layerIndex + 1], layers[layerIndex]];

    const nextItem = layerItem.nextElementSibling;
    if (nextItem) {
        layerItem.parentNode.insertBefore(nextItem, layerItem);
    }

    if (activeLayerIndex === layerIndex) {
        activeLayerIndex = layerIndex + 1;
    } else if (activeLayerIndex === layerIndex + 1) {
        activeLayerIndex = layerIndex;
    }

    render();
    showHint('Слой перемещён вниз');
}

/**
 * Переключить видимость слоя
 */
function toggleLayerVisibility(button) {
    const layerItem = button.closest('.layer-item');
    const layerId = parseInt(layerItem.dataset.layerId);
    const layer = layers.find(l => l.id === layerId);

    if (!layer) return;

    layer.visible = !layer.visible;

    button.textContent = layer.visible ? '👁️' : '🚫';
    layerItem.classList.toggle('layer-hidden', !layer.visible);

    render();
    showHint(layer.visible ? 'Слой показан' : 'Слой скрыт');
}

/**
 * Заблокировать/разблокировать слой
 */
function toggleLayerLock(button) {
    const layerItem = button.closest('.layer-item');
    const layerId = parseInt(layerItem.dataset.layerId);
    const layer = layers.find(l => l.id === layerId);

    if (!layer) return;

    layer.locked = !layer.locked;

    button.textContent = layer.locked ? '🔒' : '🔓';
    layerItem.classList.toggle('layer-locked', layer.locked);

    showHint(layer.locked ? 'Слой заблокирован' : 'Слой разблокирован');
}

/**
 * Переименовать слой
 */
function renameLayer(input) {
    const layerItem = input.closest('.layer-item');
    const layerId = parseInt(layerItem.dataset.layerId);
    const layer = layers.find(l => l.id === layerId);

    if (!layer) return;

    layer.name = input.value || `Слой ${layer.id}`;
    showHint(`Переименован в "${layer.name}"`);
}

/**
 * Выбрать слой по индексу
 */
function selectLayerByIndex(index) {
    if (index < 0 || index >= layers.length) return;

    activeLayerIndex = index;
    const layer = layers[index];

    document.querySelectorAll('.layer-item').forEach(item => {
        item.classList.remove('active');
        if (parseInt(item.dataset.layerId) === layer.id) {
            item.classList.add('active');
        }
    });

    updateControls();
}

/**
 * Создать DOM элемент слоя
 */
function createLayerElement(layer) {
    const template = document.getElementById('layerTemplate');
    const clone = template.content.cloneNode(true);

    const layerItem = clone.querySelector('.layer-item');
    layerItem.dataset.layerId = layer.id;

    const nameInput = clone.querySelector('.layer-name-input');
    nameInput.value = layer.name;

    if (layer.image) {
        const thumbnail = clone.querySelector('.layer-thumbnail');
        thumbnail.src = layer.image.src;
        thumbnail.style.display = 'block';
        clone.querySelector('.layer-placeholder').style.display = 'none';

        const sizeSpan = clone.querySelector('.layer-size');
        sizeSpan.textContent = `${layer.image.width}×${layer.image.height}`;
    }

    layerItem.addEventListener('click', (e) => {
        if (e.target.closest('.layer-actions') || e.target.closest('.layer-name-input')) return;
        const id = parseInt(layerItem.dataset.layerId);
        const idx = layers.findIndex(l => l.id === id);
        selectLayerByIndex(idx);
    });

    return clone;
}

/**
 * Обновить счётчик слоёв
 */
function updateLayerCount() {
    document.getElementById('layerCount').textContent = layers.length;
    document.getElementById('maxLayers').textContent = MAX_LAYERS;
}

/**
 * Обновить кнопку добавления (деактивировать если макс)
 */
function updateAddButton() {
    const btn = document.getElementById('addLayerBtn');
    btn.disabled = layers.length >= MAX_LAYERS;
    btn.style.opacity = layers.length >= MAX_LAYERS ? '0.5' : '1';
}

/**
 * Открыть диалог выбора файла для слоя
 */
function openFileDialog(button) {
    const layerItem = button.closest('.layer-item');
    const fileInput = layerItem.querySelector('.layer-file-input');
    fileInput.click();
}

/**
 * Загрузить изображение в слой
 */
function loadImageToLayer(input) {
    const file = input.files[0];
    if (!file) return;

    const layerItem = input.closest('.layer-item');
    const layerId = parseInt(layerItem.dataset.layerId);
    const layer = layers.find(l => l.id === layerId);

    if (!layer) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            layer.image = img;

            // Сохранить оригинал как независимую копию
            const originalImg = new Image();
            originalImg.src = e.target.result;
            layer.originalImage = originalImg;

            const thumbnail = layerItem.querySelector('.layer-thumbnail');
            thumbnail.src = e.target.result;
            thumbnail.style.display = 'block';
            layerItem.querySelector('.layer-placeholder').style.display = 'none';

            const sizeSpan = layerItem.querySelector('.layer-size');
            sizeSpan.textContent = `${img.width}×${img.height}`;

            // Выбрать слой после загрузки
            const idx = layers.findIndex(l => l.id === layerId);
            selectLayerByIndex(idx);

            updateCanvasOverlay();
            render();
            showHint(`Загружено в ${layer.name}`);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

// Сбросить UI цветовой маски к значениям по умолчанию
function resetColorMaskUI() {
    selectedColorRange = null;
    document.querySelectorAll('.color-range-btn').forEach(function(btn) { btn.classList.remove('active'); });
    document.getElementById('colorMaskControls').style.display = 'none';
    document.getElementById('tolerance').value = DEFAULT_TOLERANCE;
    document.getElementById('maskBrightness').value = 0;
    document.getElementById('maskSaturation').value = 0;
    document.getElementById('maskHue').value = 0;
    document.getElementById('toleranceVal').textContent = DEFAULT_TOLERANCE;
    document.getElementById('maskBrightnessVal').textContent = 0;
    document.getElementById('maskSaturationVal').textContent = 0;
    document.getElementById('maskHueVal').textContent = 0;
}

function updateControls() {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];

    // Базовые
    document.getElementById('opacity').value = layer.opacity * 100;
    document.getElementById('scale').value = layer.scale * 100;
    document.getElementById('rotate').value = layer.rotation;
    document.getElementById('posX').value = layer.x;
    document.getElementById('posY').value = layer.y;

    // Фильтры
    document.getElementById('brightness').value = layer.brightness;
    document.getElementById('contrast').value = layer.contrast;
    document.getElementById('saturation').value = layer.saturation;
    document.getElementById('temperature').value = layer.temperature;
    document.getElementById('hue').value = layer.hue;

    // Эффекты
    document.getElementById('blur').value = layer.blur;
    document.getElementById('sharpness').value = layer.sharpness;
    document.getElementById('vignette').value = layer.vignette;
    document.getElementById('hdr').value = layer.hdr;
    document.getElementById('grain').value = layer.grain;

    updateValues();
    updateBlendModeButtons();

    // Обновить кнопки ориентации для активного слоя
    document.querySelectorAll('.layer-orientation-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.orientation === (layer.orientation || 'auto'));
    });
    const valElement = document.getElementById('orientationVal');
    if (valElement) {
        valElement.textContent = ORIENTATION_LABELS[layer.orientation || 'auto'];
    }

    // Обновить UI цветовой маски для активного слоя
    if (layer.colorMask) {
        selectedColorRange = layer.colorMask.range;
        document.querySelectorAll('.color-range-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === selectedColorRange);
        });
        document.getElementById('colorMaskControls').style.display = 'block';
        document.getElementById('tolerance').value = layer.colorMask.tolerance;
        document.getElementById('maskBrightness').value = layer.colorMask.adjustments.brightness;
        document.getElementById('maskSaturation').value = layer.colorMask.adjustments.saturation;
        document.getElementById('maskHue').value = layer.colorMask.adjustments.hue;
        document.getElementById('toleranceVal').textContent = layer.colorMask.tolerance;
        document.getElementById('maskBrightnessVal').textContent = layer.colorMask.adjustments.brightness;
        document.getElementById('maskSaturationVal').textContent = layer.colorMask.adjustments.saturation;
        document.getElementById('maskHueVal').textContent = layer.colorMask.adjustments.hue;
    } else {
        resetColorMaskUI();
    }

    // Обновить UI Channel Mixer для активного слоя
    updateChannelMixerUI(layer);

    // Обновить UI вкладки "Фон" для активного слоя
    updateBackgroundTabUI(layer);

    // Обновить номер активного слоя в табах
    const layerDisplayNum = activeLayerIndex + 1;
    ['activeLayerNum', 'activeLayerNum2', 'activeLayerNum3', 'activeLayerNum4', 'activeLayerNum5', 'activeLayerNum6', 'activeLayerNum8', 'bottomLayerNum'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = layerDisplayNum;
    });
}

function updateBlendModeButtons() {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];

    document.querySelectorAll('.blend-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.blend === layer.blendMode);
    });

    updateBlendModeDisplay();
}

function updateBlendModeDisplay() {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];
    const modeName = blendModeNames[layer.blendMode] || 'Обычный';
    document.getElementById('currentBlendMode').textContent = modeName;
}

function updateValues() {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];

    // Базовые
    document.getElementById('opacityVal').textContent = Math.round(layer.opacity * 100) + '%';
    document.getElementById('scaleVal').textContent = Math.round(layer.scale * 100) + '%';
    document.getElementById('rotateVal').textContent = Math.round(layer.rotation) + '°';
    document.getElementById('xVal').textContent = Math.round(layer.x);
    document.getElementById('yVal').textContent = Math.round(layer.y);

    // Фильтры
    document.getElementById('brightnessVal').textContent = layer.brightness;
    document.getElementById('contrastVal').textContent = layer.contrast;
    document.getElementById('saturationVal').textContent = layer.saturation;
    document.getElementById('temperatureVal').textContent = layer.temperature;
    document.getElementById('hueVal').textContent = layer.hue + '°';

    // Эффекты
    document.getElementById('blurVal').textContent = layer.blur;
    document.getElementById('sharpnessVal').textContent = layer.sharpness;
    document.getElementById('vignetteVal').textContent = layer.vignette;
    document.getElementById('hdrVal').textContent = layer.hdr;
    document.getElementById('grainVal').textContent = layer.grain;
}

function updateCanvasOverlay() {
    const hasImages = layers.some(l => l.image);
    document.getElementById('canvasOverlay').classList.toggle('hidden', hasImages);
}

function centerLayer() {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];
    if (!layer.image) return;

    const width = layer.image.width * layer.scale;
    const height = layer.image.height * layer.scale;
    layer.x = (canvas.width - width) / 2;
    layer.y = (canvas.height - height) / 2;

    updateControls();
    render();
    showHint('Слой отцентрирован');
}

function resetLayer() {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];
    if (!layer.image) return;

    const { id, name, image, originalImage } = layer;
    const resetted = createNewLayer();
    nextLayerId--; // undo ID increment — we're resetting, not creating a new layer
    resetted.id = id;
    resetted.name = name;
    resetted.image = image;
    resetted.originalImage = originalImage;
    layers[activeLayerIndex] = resetted;

    updateControls();
    render();
    showHint('Сброшено');
}

function flipH() {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];
    if (!layer.image) return;
    layer.flipX = !layer.flipX;
    render();
    showHint('Отражено');
}

function fitCanvas() {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];
    if (!layer.image) return;

    const scaleX = canvas.width / layer.image.width;
    const scaleY = canvas.height / layer.image.height;
    layer.scale = Math.min(scaleX, scaleY) * 0.95;

    centerLayer();
}

function downloadImage() {
    if (!layers.some(l => l.image)) {
        showHint('Загрузите фото!');
        return;
    }

    const link = document.createElement('a');
    link.download = `merged-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();

    showHint('✅ Сохранено!');
}

function resetAll() {
    if (confirm('Удалить всё?')) {
        layers.length = 0;
        activeLayerIndex = -1;
        nextLayerId = 1;
        document.getElementById('layersList').innerHTML = '';
        updateLayerCount();
        updateAddButton();
        updateCanvasOverlay();
        render();
        showHint('Удалено');
    }
}

// ===== СЛИЯНИЕ СЛОЁВ =====

/**
 * Пересобрать список слоёв в DOM из массива layers[]
 */
function rebuildLayersList() {
    const list = document.getElementById('layersList');
    list.innerHTML = '';
    layers.forEach(layer => {
        list.appendChild(createLayerElement(layer));
        // Sync visibility/lock state that isn't set by createLayerElement
        const layerItem = list.querySelector(`[data-layer-id="${layer.id}"]`);
        if (layerItem) {
            const visBtn = layerItem.querySelector('[title="Показать/Скрыть"]');
            if (visBtn) visBtn.textContent = layer.visible ? '👁️' : '🚫';
            layerItem.classList.toggle('layer-hidden', !layer.visible);

            const lockBtn = layerItem.querySelector('[title="Заблокировать/Разблокировать"]');
            if (lockBtn) lockBtn.textContent = layer.locked ? '🔒' : '🔓';
            layerItem.classList.toggle('layer-locked', layer.locked);
        }
    });
}

/**
 * Отрендерить набор слоёв на временный canvas.
 * Слои передаются в том же порядке, что и в массиве layers[]
 * (индекс 0 = верхний визуальный слой, последний = нижний).
 * @param {object[]} layerSubset - массив объектов слоёв
 * @returns {HTMLCanvasElement}
 */
function renderLayersToTempCanvas(layerSubset) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    let hasContent = false;

    // Рендерим снизу вверх (от последнего элемента к первому)
    for (let i = layerSubset.length - 1; i >= 0; i--) {
        const layer = layerSubset[i];
        if (!layer.image) continue;

        // createTempCanvas рисует слой с source-over и opacity=1
        const layerCanvas = createTempCanvas(layer);

        if (layer.blendMode.startsWith('canvas-') && hasContent) {
            const mode = layer.blendMode.replace('canvas-', '');
            const resultCanvas = window.BlendingEngine.blendImages(
                tempCanvas, layerCanvas, mode, layer.opacity
            );
            tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.drawImage(resultCanvas, 0, 0);
        } else {
            tempCtx.save();
            tempCtx.globalAlpha = layer.opacity;
            tempCtx.globalCompositeOperation = layer.blendMode;
            tempCtx.drawImage(layerCanvas, 0, 0);
            tempCtx.restore();
        }

        hasContent = true;
    }

    return tempCanvas;
}

/**
 * Слить все видимые слои в один
 */
function flattenLayers() {
    const visibleWithImage = layers.filter(l => l.visible && l.image);
    if (visibleWithImage.length === 0) {
        showHint('Нет видимых слоёв для слияния');
        return;
    }
    if (!confirm('Слить все слои в один?')) return;

    const tempCanvas = renderLayersToTempCanvas(visibleWithImage);
    const dataURL = tempCanvas.toDataURL('image/png');

    const img = new Image();
    img.onload = () => {
        layers.length = 0;
        const newLayer = createNewLayer();
        newLayer.name = 'Слитый слой';
        newLayer.image = img;
        newLayer.originalImage = img;
        layers.push(newLayer);
        activeLayerIndex = 0;

        rebuildLayersList();
        updateLayerCount();
        updateAddButton();
        updateCanvasOverlay();
        render();
        showHint('✅ Все слои слиты');
    };
    img.src = dataURL;
}

/**
 * Слить активный слой со слоем ниже
 * @param {HTMLElement} button - кнопка внутри .layer-item
 */
function mergeDown(button) {
    const layerItem = button.closest('.layer-item');
    const layerId = parseInt(layerItem.dataset.layerId);
    const layerIndex = layers.findIndex(l => l.id === layerId);

    if (layerIndex === -1) return;

    // Нижний слой в массиве — это layerIndex + 1 (визуально ниже)
    if (layerIndex >= layers.length - 1) {
        showHint('Нет слоя ниже для слияния');
        return;
    }

    const upperLayer = layers[layerIndex];
    const lowerLayer = layers[layerIndex + 1];

    if (!upperLayer.image && !lowerLayer.image) {
        showHint('Оба слоя пусты');
        return;
    }

    // Передаём в порядке массива: верхний (index 0), нижний (index 1)
    const tempCanvas = renderLayersToTempCanvas([upperLayer, lowerLayer]);
    const dataURL = tempCanvas.toDataURL('image/png');

    const img = new Image();
    img.onload = () => {
        const mergedLayer = createNewLayer();
        mergedLayer.name = 'Слитый слой';
        mergedLayer.image = img;
        mergedLayer.originalImage = img;

        // Заменяем оба слоя одним слитым
        layers.splice(layerIndex, 2, mergedLayer);
        activeLayerIndex = Math.min(layerIndex, layers.length - 1);

        rebuildLayersList();
        updateLayerCount();
        updateAddButton();
        render();
        showHint('✅ Слой слит вниз');
    };
    img.src = dataURL;
}

/**
 * Слить все видимые слои, сохранив невидимые нетронутыми
 */
function mergeVisibleLayers() {
    const visibleIndices = layers.reduce((acc, l, idx) => {
        if (l.visible && l.image) acc.push(idx);
        return acc;
    }, []);

    if (visibleIndices.length < 2) {
        showHint('Нужно минимум 2 видимых слоя с изображением');
        return;
    }

    const visibleLayers = visibleIndices.map(i => layers[i]);
    const tempCanvas = renderLayersToTempCanvas(visibleLayers);
    const dataURL = tempCanvas.toDataURL('image/png');

    const img = new Image();
    img.onload = () => {
        // Позиция для вставки: место нижнего из видимых после удаления остальных
        const insertAtOriginal = Math.max(...visibleIndices);
        const removedBefore = visibleIndices.filter(i => i < insertAtOriginal).length;
        const insertPosition = Math.min(insertAtOriginal - removedBefore, layers.length - visibleIndices.length);

        // Удаляем видимые слои по индексам (с конца, чтобы не сбивать индексы)
        for (let i = visibleIndices.length - 1; i >= 0; i--) {
            layers.splice(visibleIndices[i], 1);
        }

        const mergedLayer = createNewLayer();
        mergedLayer.name = 'Слитые видимые';
        mergedLayer.image = img;
        mergedLayer.originalImage = img;

        layers.splice(insertPosition, 0, mergedLayer);
        activeLayerIndex = Math.min(insertPosition, layers.length - 1);

        rebuildLayersList();
        updateLayerCount();
        updateAddButton();
        updateCanvasOverlay();
        render();
        showHint('✅ Видимые слои слиты');
    };
    img.src = dataURL;
}

// Инициализация — вызывается из app.js после определения глобальных переменных
function initLayerManager() {
    // Слои добавляются динамически через addNewLayer()
}
