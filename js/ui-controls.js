// UI controls - sliders, tab switching, sidebar, canvas zoom, and UI scale

// Переменные модуля для управления жестами и изменением размера сайдбара
let canvasPinchDistance = 0;
let isCanvasPinching = false;
let lastDistance = 0;
let isPinching = false;
let isResizing = false;
let startX = 0;
let startWidth = 0;

// ===== ПЕРЕКЛЮЧЕНИЕ ТАБОВ =====
function switchTab(tabName, element) {
    currentTab = tabName;
    
    // Обновляем активные кнопки
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    element.classList.add('active');
    
    // Показываем нужный контент
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

// ===== МАСШТАБИРОВАНИЕ CANVAS =====
function zoomCanvasBy(delta) {
    canvasZoom = Math.max(0.25, Math.min(3, canvasZoom + delta));
    applyCanvasZoom();
}

function resetCanvasZoom() {
    canvasZoom = 1;
    applyCanvasZoom();
}

function applyCanvasZoom() {
    document.documentElement.style.setProperty('--canvas-zoom', canvasZoom);
    const percentage = Math.round(canvasZoom * 100);
    document.getElementById('canvasZoomIndicator').textContent = `Canvas: ${percentage}%`;
    document.getElementById('bottomCanvasZoom').textContent = `${percentage}%`;
}

function centerCanvas() {
    const wrapper = canvasWrapper;
    wrapper.scrollLeft = (wrapper.scrollWidth - wrapper.clientWidth) / 2;
    wrapper.scrollTop = (wrapper.scrollHeight - wrapper.clientHeight) / 2;
    showHint('Холст отцентрирован');
}

// ===== МАСШТАБИРОВАНИЕ UI =====
function zoomUI(delta) {
    uiScale = Math.max(0.5, Math.min(2, uiScale + delta));
    applyUIScale();
}

function applyUIScale() {
    document.documentElement.style.setProperty('--ui-scale', uiScale);
    document.getElementById('uiZoomDisplay').textContent = Math.round(uiScale * 100) + '%';
    
    const mainContainer = document.getElementById('mainContainer');
    mainContainer.style.width = (100 / uiScale) + 'vw';
    mainContainer.style.height = (100 / uiScale) + 'vh';
    
    const indicator = document.getElementById('scaleIndicator');
    indicator.textContent = `UI: ${Math.round(uiScale * 100)}%`;
    indicator.classList.add('visible');
    setTimeout(() => {
        indicator.classList.remove('visible');
    }, 1500);
}

function getDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// ===== ПОЛЗУНКИ =====
function initSlider(sliderId, callback) {
    const slider = document.getElementById(sliderId);
    let isDraggingSlider = false;

    slider.addEventListener('mousedown', (e) => {
        const rect = slider.getBoundingClientRect();
        const clickPos = (e.clientX - rect.left) / rect.width;
        const sliderValue = (slider.value - slider.min) / (slider.max - slider.min);
        
        if (Math.abs(clickPos - sliderValue) < 0.05) {
            isDraggingSlider = true;
        } else {
            e.preventDefault();
        }
    });

    slider.addEventListener('touchstart', () => {
        isDraggingSlider = true;
    });

    slider.addEventListener('input', (e) => {
        if (isDraggingSlider) {
            callback(e);
        }
    });

    slider.addEventListener('change', (e) => {
        if (isDraggingSlider) {
            callback(e);
        }
    });

    slider.addEventListener('mouseup', () => {
        isDraggingSlider = false;
    });

    slider.addEventListener('touchend', () => {
        isDraggingSlider = false;
    });

    document.addEventListener('mouseup', () => {
        isDraggingSlider = false;
    });
}

function setBlendMode(mode) {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    layers[activeLayerIndex].blendMode = mode;
    updateBlendModeButtons();
    render();
    showHint(blendModeNames[mode]);
}

function setOrientation(orientation) {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    layers[activeLayerIndex].orientation = orientation;

    // Обновить активную кнопку
    document.querySelectorAll('.layer-orientation-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.orientation === orientation);
    });

    // Обновить текстовое значение
    const valElement = document.getElementById('orientationVal');
    if (valElement) {
        valElement.textContent = ORIENTATION_LABELS[orientation];
    }

    render();
    showHint(`Ориентация: ${ORIENTATION_LABELS[orientation]}`);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('toggleIcon');
    sidebar.classList.toggle('collapsed');
    icon.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
}

function applyColorMaskToLayer() {
    if (!selectedColorRange) return;
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;

    const layer = layers[activeLayerIndex];
    layer.colorMask = {
        range: selectedColorRange,
        tolerance: parseInt(document.getElementById('tolerance').value),
        adjustments: {
            brightness: parseInt(document.getElementById('maskBrightness').value),
            saturation: parseInt(document.getElementById('maskSaturation').value),
            hue: parseInt(document.getElementById('maskHue').value)
        }
    };

    render();
    showHint('Маска применена: ' + COLOR_RANGES[selectedColorRange].name);
}

function resetColorMask() {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    layers[activeLayerIndex].colorMask = null;
    resetColorMaskUI();
    render();
    showHint('Маска сброшена');
}

// Регистрация всех обработчиков UI — вызывается из app.js после определения глобальных переменных
function initUIControls() {
    // Зум canvas колёсиком мыши
    canvasWrapper.addEventListener('wheel', function(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            zoomCanvasBy(delta);
        }
    }, { passive: false });

    // Зум canvas пинчем
    canvasWrapper.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            isCanvasPinching = true;
            canvasPinchDistance = getDistance(e.touches[0], e.touches[1]);
            e.preventDefault();
        }
    }, { passive: false });

    canvasWrapper.addEventListener('touchmove', (e) => {
        if (isCanvasPinching && e.touches.length === 2) {
            e.preventDefault();
            const distance = getDistance(e.touches[0], e.touches[1]);
            const delta = (distance - canvasPinchDistance) / 300;
            zoomCanvasBy(delta);
            canvasPinchDistance = distance;
        }
    }, { passive: false });

    canvasWrapper.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            isCanvasPinching = false;
        }
    });

    // Зум UI пинчем
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2 && !canvasWrapper.contains(e.target)) {
            isPinching = true;
            lastDistance = getDistance(e.touches[0], e.touches[1]);
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (isPinching && e.touches.length === 2) {
            e.preventDefault();
            const distance = getDistance(e.touches[0], e.touches[1]);
            const delta = (distance - lastDistance) / 200;
            zoomUI(delta);
            lastDistance = distance;
        }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            isPinching = false;
        }
    });

    // Изменение ширины сайдбара перетаскиванием
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('sidebarResizer');

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = parseInt(getComputedStyle(sidebar).width) * uiScale;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    resizer.addEventListener('touchstart', (e) => {
        isResizing = true;
        startX = e.touches[0].clientX;
        startWidth = parseInt(getComputedStyle(sidebar).width) * uiScale;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (isResizing) {
            const delta = e.clientX - startX;
            const newWidth = Math.max(250, Math.min(500, startWidth + delta));
            document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (isResizing) {
            const delta = e.touches[0].clientX - startX;
            const newWidth = Math.max(250, Math.min(500, startWidth + delta));
            document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
        }
    });

    document.addEventListener('touchend', () => {
        isResizing = false;
    });

    // Кнопки режима наложения
    document.querySelectorAll('.blend-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const mode = this.dataset.blend;
            setBlendMode(mode);
        });
    });

    // Кнопки ориентации активного слоя
    document.querySelectorAll('.layer-orientation-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const orientation = this.dataset.orientation;
            setOrientation(orientation);
        });
    });

    // Инициализация ползунков - Базовые
    initSlider('opacity', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].opacity = document.getElementById('opacity').value / 100;
        updateValues();
        render();
    });

    initSlider('scale', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].scale = document.getElementById('scale').value / 100;
        updateValues();
        render();
    });

    initSlider('rotate', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].rotation = parseFloat(document.getElementById('rotate').value);
        updateValues();
        render();
    });

    initSlider('posX', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].x = parseFloat(document.getElementById('posX').value);
        updateValues();
        render();
    });

    initSlider('posY', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].y = parseFloat(document.getElementById('posY').value);
        updateValues();
        render();
    });

    // Инициализация ползунков - Фильтры
    initSlider('brightness', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].brightness = parseFloat(document.getElementById('brightness').value);
        updateValues();
        render();
    });

    initSlider('contrast', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].contrast = parseFloat(document.getElementById('contrast').value);
        updateValues();
        render();
    });

    initSlider('saturation', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].saturation = parseFloat(document.getElementById('saturation').value);
        updateValues();
        render();
    });

    initSlider('temperature', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].temperature = parseFloat(document.getElementById('temperature').value);
        updateValues();
        render();
    });

    initSlider('hue', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].hue = parseFloat(document.getElementById('hue').value);
        updateValues();
        render();
    });

    // Инициализация ползунков - Эффекты
    initSlider('blur', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].blur = parseFloat(document.getElementById('blur').value);
        updateValues();
        render();
    });

    initSlider('sharpness', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].sharpness = parseFloat(document.getElementById('sharpness').value);
        updateValues();
        render();
    });

    initSlider('vignette', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].vignette = parseFloat(document.getElementById('vignette').value);
        updateValues();
        render();
    });

    initSlider('hdr', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].hdr = parseFloat(document.getElementById('hdr').value);
        updateValues();
        render();
    });

    initSlider('grain', function() {
        if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
        layers[activeLayerIndex].grain = parseFloat(document.getElementById('grain').value);
        updateValues();
        render();
    });

    // Кнопки выбора цветового диапазона
    document.querySelectorAll('.color-range-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            selectedColorRange = btn.dataset.color;
            document.querySelectorAll('.color-range-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            document.getElementById('colorMaskControls').style.display = 'block';
        });
    });

    // Ползунки цветовой маски
    initSlider('tolerance', function() {
        document.getElementById('toleranceVal').textContent = document.getElementById('tolerance').value;
    });
    initSlider('maskBrightness', function() {
        document.getElementById('maskBrightnessVal').textContent = document.getElementById('maskBrightness').value;
    });
    initSlider('maskSaturation', function() {
        document.getElementById('maskSaturationVal').textContent = document.getElementById('maskSaturation').value;
    });
    initSlider('maskHue', function() {
        document.getElementById('maskHueVal').textContent = document.getElementById('maskHue').value;
    });

    // Ползунки Channel Mixer
    initChannelMixerControls();

    // Инициализация вкладки удаления фона
    initBackgroundTab();

    // Инициализация вкладки искажений и пикселизации
    initDistortionTab();

    // Инициализация вкладки ластика
    initEraserTab();
}

// Инициализация слайдеров Channel Mixer
function initChannelMixerControls() {
    const channelSliders = [
        'redFromRed', 'redFromGreen', 'redFromBlue',
        'greenFromRed', 'greenFromGreen', 'greenFromBlue',
        'blueFromRed', 'blueFromGreen', 'blueFromBlue',
        'blackPoint', 'whitePoint', 'gamma'
    ];

    channelSliders.forEach(function(id) {
        initSlider(id, function() { updateChannelMixer(); });
    });
}

function updateChannelMixer() {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];

    layer.channelMixer = {
        redChannel: {
            red: parseInt(document.getElementById('redFromRed').value),
            green: parseInt(document.getElementById('redFromGreen').value),
            blue: parseInt(document.getElementById('redFromBlue').value)
        },
        greenChannel: {
            red: parseInt(document.getElementById('greenFromRed').value),
            green: parseInt(document.getElementById('greenFromGreen').value),
            blue: parseInt(document.getElementById('greenFromBlue').value)
        },
        blueChannel: {
            red: parseInt(document.getElementById('blueFromRed').value),
            green: parseInt(document.getElementById('blueFromGreen').value),
            blue: parseInt(document.getElementById('blueFromBlue').value)
        }
    };

    layer.levels = {
        blackPoint: parseInt(document.getElementById('blackPoint').value),
        whitePoint: parseInt(document.getElementById('whitePoint').value),
        gamma: parseFloat(document.getElementById('gamma').value)
    };

    updateChannelMixerValueDisplays(layer);
    render();
}

function updateChannelMixerValueDisplays(layer) {
    document.getElementById('redFromRedVal').textContent = layer.channelMixer.redChannel.red;
    document.getElementById('redFromGreenVal').textContent = layer.channelMixer.redChannel.green;
    document.getElementById('redFromBlueVal').textContent = layer.channelMixer.redChannel.blue;

    document.getElementById('greenFromRedVal').textContent = layer.channelMixer.greenChannel.red;
    document.getElementById('greenFromGreenVal').textContent = layer.channelMixer.greenChannel.green;
    document.getElementById('greenFromBlueVal').textContent = layer.channelMixer.greenChannel.blue;

    document.getElementById('blueFromRedVal').textContent = layer.channelMixer.blueChannel.red;
    document.getElementById('blueFromGreenVal').textContent = layer.channelMixer.blueChannel.green;
    document.getElementById('blueFromBlueVal').textContent = layer.channelMixer.blueChannel.blue;

    document.getElementById('blackPointVal').textContent = layer.levels.blackPoint;
    document.getElementById('whitePointVal').textContent = layer.levels.whitePoint;
    document.getElementById('gammaVal').textContent = layer.levels.gamma.toFixed(2);
}

function updateChannelMixerUI(layer) {
    const cm = layer.channelMixer;
    const lv = layer.levels;

    document.getElementById('redFromRed').value = cm ? cm.redChannel.red : 100;
    document.getElementById('redFromGreen').value = cm ? cm.redChannel.green : 0;
    document.getElementById('redFromBlue').value = cm ? cm.redChannel.blue : 0;

    document.getElementById('greenFromRed').value = cm ? cm.greenChannel.red : 0;
    document.getElementById('greenFromGreen').value = cm ? cm.greenChannel.green : 100;
    document.getElementById('greenFromBlue').value = cm ? cm.greenChannel.blue : 0;

    document.getElementById('blueFromRed').value = cm ? cm.blueChannel.red : 0;
    document.getElementById('blueFromGreen').value = cm ? cm.blueChannel.green : 0;
    document.getElementById('blueFromBlue').value = cm ? cm.blueChannel.blue : 100;

    document.getElementById('redFromRedVal').textContent = cm ? cm.redChannel.red : 100;
    document.getElementById('redFromGreenVal').textContent = cm ? cm.redChannel.green : 0;
    document.getElementById('redFromBlueVal').textContent = cm ? cm.redChannel.blue : 0;

    document.getElementById('greenFromRedVal').textContent = cm ? cm.greenChannel.red : 0;
    document.getElementById('greenFromGreenVal').textContent = cm ? cm.greenChannel.green : 100;
    document.getElementById('greenFromBlueVal').textContent = cm ? cm.greenChannel.blue : 0;

    document.getElementById('blueFromRedVal').textContent = cm ? cm.blueChannel.red : 0;
    document.getElementById('blueFromGreenVal').textContent = cm ? cm.blueChannel.green : 0;
    document.getElementById('blueFromBlueVal').textContent = cm ? cm.blueChannel.blue : 100;

    document.getElementById('blackPoint').value = lv ? lv.blackPoint : 0;
    document.getElementById('whitePoint').value = lv ? lv.whitePoint : 255;
    document.getElementById('gamma').value = lv ? lv.gamma : 1.0;

    document.getElementById('blackPointVal').textContent = lv ? lv.blackPoint : 0;
    document.getElementById('whitePointVal').textContent = lv ? lv.whitePoint : 255;
    document.getElementById('gammaVal').textContent = lv ? lv.gamma.toFixed(2) : '1.00';
}

function applyChannelMixerPreset(presetName) {
    const preset = CHANNEL_MIXER_PRESETS[presetName];
    if (!preset) return;

    document.getElementById('redFromRed').value = preset.redChannel.red;
    document.getElementById('redFromGreen').value = preset.redChannel.green;
    document.getElementById('redFromBlue').value = preset.redChannel.blue;

    document.getElementById('greenFromRed').value = preset.greenChannel.red;
    document.getElementById('greenFromGreen').value = preset.greenChannel.green;
    document.getElementById('greenFromBlue').value = preset.greenChannel.blue;

    document.getElementById('blueFromRed').value = preset.blueChannel.red;
    document.getElementById('blueFromGreen').value = preset.blueChannel.green;
    document.getElementById('blueFromBlue').value = preset.blueChannel.blue;

    updateChannelMixer();
    showHint('Пресет: ' + preset.name);
}

function resetChannelMixer() {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    document.getElementById('channelMixerPreset').value = 'default';
    document.getElementById('blackPoint').value = 0;
    document.getElementById('whitePoint').value = 255;
    document.getElementById('gamma').value = 1.0;

    layers[activeLayerIndex].channelMixer = null;
    layers[activeLayerIndex].levels = null;

    // Сброс слайдеров Channel Mixer через пресет по умолчанию
    const preset = CHANNEL_MIXER_PRESETS['default'];
    document.getElementById('redFromRed').value = preset.redChannel.red;
    document.getElementById('redFromGreen').value = preset.redChannel.green;
    document.getElementById('redFromBlue').value = preset.redChannel.blue;
    document.getElementById('greenFromRed').value = preset.greenChannel.red;
    document.getElementById('greenFromGreen').value = preset.greenChannel.green;
    document.getElementById('greenFromBlue').value = preset.greenChannel.blue;
    document.getElementById('blueFromRed').value = preset.blueChannel.red;
    document.getElementById('blueFromGreen').value = preset.blueChannel.green;
    document.getElementById('blueFromBlue').value = preset.blueChannel.blue;

    // Сброс отображаемых значений через updateChannelMixerUI
    updateChannelMixerUI(layers[activeLayerIndex]);

    render();
    showHint('Каналы сброшены');
}

// ===== УДАЛЕНИЕ ФОНА =====

// Конвертировать hex в RGB объект
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 255, b: 0 };
}

// Применить удаление фона
function applyBackgroundRemoval() {
    const layer = layers[activeLayerIndex];
    if (!layer || !layer.image) {
        showHint('Нет активного слоя');
        return;
    }

    const mode = document.getElementById('bgRemovalMode').value;
    const tolerance = parseInt(document.getElementById('bgTolerance').value);
    const feather = parseInt(document.getElementById('bgFeather').value);

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.image.width;
    tempCanvas.height = layer.image.height;

    tempCtx.drawImage(layer.image, 0, 0);
    let imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    if (mode === 'auto') {
        imageData = autoRemoveBackground(imageData, { tolerance, feather });
    } else if (mode === 'color') {
        const bgColor = hexToRgb(document.getElementById('bgColor').value);
        imageData = removeBackgroundByColor(imageData, {
            targetColor: bgColor,
            tolerance,
            feather
        });
    }

    tempCtx.putImageData(imageData, 0, 0);

    const newImg = new Image();
    newImg.onload = function() {
        layer.image = newImg;
        render();
        showHint('Фон удалён');
    };
    newImg.src = tempCanvas.toDataURL('image/png');
}

// Применить удаление канала
function applyChannelRemoval() {
    const layer = layers[activeLayerIndex];
    if (!layer || !layer.image) {
        showHint('Нет активного слоя');
        return;
    }

    const channel = document.getElementById('channelToRemove').value;
    if (!channel) {
        showHint('Выберите канал');
        return;
    }

    const mode = document.getElementById('channelMode').value;
    const tolerance = parseInt(document.getElementById('channelTolerance').value);
    const replacementColor = mode === 'replace'
        ? hexToRgb(document.getElementById('replacementColor').value)
        : null;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.image.width;
    tempCanvas.height = layer.image.height;

    tempCtx.drawImage(layer.image, 0, 0);
    let imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    imageData = removeColorChannel(imageData, channel, mode, {
        tolerance,
        replacementColor
    });

    tempCtx.putImageData(imageData, 0, 0);

    const newImg = new Image();
    newImg.onload = function() {
        layer.image = newImg;
        render();
        showHint(`Канал ${channel} обработан`);
    };
    newImg.src = tempCanvas.toDataURL('image/png');
}

// Удалить тени/блики
function removeLuminance(type) {
    const layer = layers[activeLayerIndex];
    if (!layer || !layer.image) return;

    const threshold = parseInt(document.getElementById('luminanceThreshold').value);

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.image.width;
    tempCanvas.height = layer.image.height;

    tempCtx.drawImage(layer.image, 0, 0);
    let imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    imageData = removeLuminanceRange(imageData, type, threshold);

    tempCtx.putImageData(imageData, 0, 0);

    const newImg = new Image();
    newImg.onload = function() {
        layer.image = newImg;
        render();
        showHint(type === 'shadows' ? 'Тени удалены' : 'Блики удалены');
    };
    newImg.src = tempCanvas.toDataURL('image/png');
}

// Восстановить исходное изображение
function resetTransparency() {
    const layer = layers[activeLayerIndex];
    if (!layer || !layer.originalImage) {
        showHint('Нет исходного изображения');
        return;
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.originalImage.width;
    tempCanvas.height = layer.originalImage.height;

    tempCtx.drawImage(layer.originalImage, 0, 0);

    const newImg = new Image();
    newImg.onload = function() {
        layer.image = newImg;
        render();
        showHint('Исходное изображение восстановлено');
    };
    newImg.src = tempCanvas.toDataURL('image/png');
}

// Инициализация обработчиков вкладки "Фон"
function initBackgroundTab() {
    // Показать/скрыть цвет замены
    document.getElementById('channelMode').addEventListener('change', function(e) {
        document.getElementById('replacementGroup').style.display =
            e.target.value === 'replace' ? 'block' : 'none';
    });

    // Показать/скрыть пипетку цвета фона
    document.getElementById('bgRemovalMode').addEventListener('change', function(e) {
        document.getElementById('colorPickerGroup').style.display =
            e.target.value === 'color' ? 'block' : 'none';
    });

    // Инициализация слайдеров
    initSlider('bgTolerance', function() {
        document.getElementById('bgToleranceVal').textContent =
            document.getElementById('bgTolerance').value;
    });

    initSlider('bgFeather', function() {
        document.getElementById('bgFeatherVal').textContent =
            document.getElementById('bgFeather').value;
    });

    initSlider('channelTolerance', function() {
        document.getElementById('channelToleranceVal').textContent =
            document.getElementById('channelTolerance').value;
    });

    initSlider('luminanceThreshold', function() {
        document.getElementById('luminanceThresholdVal').textContent =
            document.getElementById('luminanceThreshold').value;
    });
}

// Инициализация вкладки искажений и пикселизации
function initDistortionTab() {
    // Показать/скрыть группы параметров при смене режима пикселизации
    document.getElementById('pixelMode').addEventListener('change', function(e) {
        var colorGroup = document.getElementById('colorCountGroup');
        var paletteGroup = document.getElementById('retroPaletteGroup');

        if (e.target.value === 'pixelart') {
            colorGroup.style.display = 'block';
            paletteGroup.style.display = 'none';
        } else if (e.target.value === 'retro') {
            colorGroup.style.display = 'none';
            paletteGroup.style.display = 'block';
        } else {
            colorGroup.style.display = 'none';
            paletteGroup.style.display = 'none';
        }
    });

    // Ползунки искажений
    initSlider('distortIntensity', function() {
        document.getElementById('distortIntensityVal').textContent =
            document.getElementById('distortIntensity').value;
    });

    initSlider('distortRadius', function() {
        document.getElementById('distortRadiusVal').textContent =
            document.getElementById('distortRadius').value + '%';
    });

    initSlider('pixelSize', function() {
        document.getElementById('pixelSizeVal').textContent =
            document.getElementById('pixelSize').value + 'px';
    });

    initSlider('colorCount', function() {
        document.getElementById('colorCountVal').textContent =
            document.getElementById('colorCount').value;
    });
}

// Применить искажение к активному слою
function applyDistortionEffect() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.image) {
        showHint('Нет активного слоя');
        return;
    }

    var type = document.getElementById('distortionType').value;
    if (!type) {
        showHint('Выберите тип искажения');
        return;
    }

    var intensity = parseInt(document.getElementById('distortIntensity').value);
    var radius = parseInt(document.getElementById('distortRadius').value) / 100;

    var tempCanvas = document.createElement('canvas');
    var tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.image.width;
    tempCanvas.height = layer.image.height;

    tempCtx.drawImage(layer.image, 0, 0);
    var imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    switch (type) {
        case 'twist':
            imageData = applyTwist(imageData, intensity, radius);
            break;
        case 'bulge':
            imageData = applyBulge(imageData, intensity, radius);
            break;
        case 'pinch':
            imageData = applyBulge(imageData, -intensity, radius);
            break;
        case 'wave-h':
            imageData = applyWave(imageData, intensity * 0.5, 30, 'horizontal');
            break;
        case 'wave-v':
            imageData = applyWave(imageData, intensity * 0.5, 30, 'vertical');
            break;
        case 'funhouse':
            imageData = applyFunhouse(imageData, intensity);
            break;
        case 'swirl':
            imageData = applySwirl(imageData, intensity, radius);
            break;
    }

    tempCtx.putImageData(imageData, 0, 0);

    var newImg = new Image();
    newImg.onload = function() {
        layer.image = newImg;
        render();
        showHint('Искажение применено');
    };
    newImg.src = tempCanvas.toDataURL('image/png');
}

// Применить пикселизацию к активному слою
function applyPixelationEffect() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.image) {
        showHint('Нет активного слоя');
        return;
    }

    var mode = document.getElementById('pixelMode').value;
    var blockSize = parseInt(document.getElementById('pixelSize').value);
    var colorCount = parseInt(document.getElementById('colorCount').value);
    var palette = document.getElementById('retroPalette').value;

    var tempCanvas = document.createElement('canvas');
    var tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.image.width;
    tempCanvas.height = layer.image.height;

    tempCtx.drawImage(layer.image, 0, 0);
    var imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    switch (mode) {
        case 'mosaic':
            imageData = applyPixelation(imageData, blockSize);
            break;
        case 'pixelart':
            imageData = applyPixelArt(imageData, blockSize, colorCount);
            break;
        case 'retro':
            imageData = applyPixelation(imageData, blockSize);
            imageData = applyRetroPalette(imageData, palette);
            break;
    }

    tempCtx.putImageData(imageData, 0, 0);

    var newImg = new Image();
    newImg.onload = function() {
        layer.image = newImg;
        render();
        showHint('Пикселизация применена');
    };
    newImg.src = tempCanvas.toDataURL('image/png');
}

// Сбросить эффекты искажения (восстановить оригинальное изображение)
function resetDistortionEffects() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.originalImage) {
        showHint('Нет исходного изображения');
        return;
    }

    layer.image = layer.originalImage;
    render();
    showHint('Эффекты сброшены');
}

// ==================== ЛАСТИК ====================

// Переключить активацию ластика
function toggleEraser() {
    if (eraserState.active) {
        deactivateEraser();
        document.getElementById('toggleEraser').textContent = '✓ Активировать ластик';
        document.getElementById('toggleEraser').classList.remove('danger');
        document.getElementById('toggleEraser').classList.add('primary');
    } else {
        activateEraser();
        document.getElementById('toggleEraser').textContent = '✖ Деактивировать ластик';
        document.getElementById('toggleEraser').classList.remove('primary');
        document.getElementById('toggleEraser').classList.add('danger');
    }
}

// Сбросить все изменения ластика
function resetEraser() {
    var layer = layers[activeLayerIndex];
    if (!layer || !eraserState.originalImageData) {
        showHint('Нет исходного изображения');
        return;
    }

    var tempCanvas = document.createElement('canvas');
    var tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = eraserState.originalImageData.width;
    tempCanvas.height = eraserState.originalImageData.height;
    tempCtx.putImageData(eraserState.originalImageData, 0, 0);

    var newImg = new Image();
    newImg.onload = function() {
        layer.image = newImg;
        render();
    };
    newImg.src = tempCanvas.toDataURL('image/png');

    // Очистить историю
    eraserState.history = [];
    eraserState.historyIndex = -1;

    showHint('Изменения сброшены');
}

// Инициализация вкладки ластика
function initEraserTab() {
    // Инициализировать обработчики canvas для ластика
    initEraserTool();

    // Показать/скрыть группу параметров умного ластика
    document.getElementById('eraserMode').addEventListener('change', function(e) {
        var smartGroup = document.getElementById('smartEraseGroup');
        smartGroup.style.display = e.target.value === 'smart' ? 'block' : 'none';
    });

    // Инициализация слайдеров ластика
    initSlider('eraserSize', function(e) {
        eraserState.brushSize = parseInt(e.target.value);
        document.getElementById('eraserSizeVal').textContent = e.target.value + 'px';
    });

    initSlider('eraserHardness', function(e) {
        eraserState.brushHardness = parseInt(e.target.value);
        document.getElementById('eraserHardnessVal').textContent = e.target.value + '%';
    });

    initSlider('eraserOpacity', function(e) {
        eraserState.brushOpacity = parseInt(e.target.value);
        document.getElementById('eraserOpacityVal').textContent = e.target.value + '%';
    });

    initSlider('smartEraseTolerance', function(e) {
        document.getElementById('smartEraseToleranceVal').textContent = e.target.value;
    });
}
