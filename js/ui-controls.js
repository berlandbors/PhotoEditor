// UI controls - sliders, tab switching, sidebar, canvas zoom, and UI scale

// Переменные модуля для управления жестами и изменением размера сайдбара
let canvasPinchDistance = 0;
let isCanvasPinching = false;
let lastDistance = 0;
let isPinching = false;
let isResizing = false;
let startX = 0;
let startWidth = 0;

// ===== УТИЛИТА DEBOUNCE =====
function debounce(func, wait) {
    let timeout;
    return function executedFunction() {
        const args = arguments;
        const later = function() {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

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

// ===== ПРОКРУТКА К ВКЛАДКАМ =====
function scrollToTabs() {
    const tabs = document.querySelector('.layer-tabs');
    if (tabs) {
        tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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

    slider.addEventListener('mousedown', () => {
        isDraggingSlider = true;
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

function applyColorMaskLive() {
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

    // Виньетки — инициализация слайдеров для каждого типа
    ['Darken', 'Lighten', 'Transparency'].forEach(function(type) {
        var k = 'vignette' + type;

        // Интенсивность
        initSlider(k, function() {
            if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
            _ensureVignetteObj(layers[activeLayerIndex], type);
            layers[activeLayerIndex][k].intensity = parseFloat(document.getElementById(k).value);
            updateValues();
            render();
        });

        // Внутренний радиус
        initSlider(k + 'InnerRadius', function() {
            if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
            _ensureVignetteObj(layers[activeLayerIndex], type);
            layers[activeLayerIndex][k].innerRadius = parseFloat(document.getElementById(k + 'InnerRadius').value);
            document.getElementById(k + 'InnerRadiusVal').textContent = document.getElementById(k + 'InnerRadius').value;
            render();
        });

        // Внешний радиус
        initSlider(k + 'OuterRadius', function() {
            if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
            _ensureVignetteObj(layers[activeLayerIndex], type);
            layers[activeLayerIndex][k].outerRadius = parseFloat(document.getElementById(k + 'OuterRadius').value);
            document.getElementById(k + 'OuterRadiusVal').textContent = document.getElementById(k + 'OuterRadius').value;
            render();
        });

        // Центр X
        initSlider(k + 'CenterX', function() {
            if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
            _ensureVignetteObj(layers[activeLayerIndex], type);
            layers[activeLayerIndex][k].centerX = parseFloat(document.getElementById(k + 'CenterX').value);
            document.getElementById(k + 'CenterXVal').textContent = document.getElementById(k + 'CenterX').value;
            render();
        });

        // Центр Y
        initSlider(k + 'CenterY', function() {
            if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
            _ensureVignetteObj(layers[activeLayerIndex], type);
            layers[activeLayerIndex][k].centerY = parseFloat(document.getElementById(k + 'CenterY').value);
            document.getElementById(k + 'CenterYVal').textContent = document.getElementById(k + 'CenterY').value;
            render();
        });

        // Резкость
        initSlider(k + 'Sharpness', function() {
            if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
            _ensureVignetteObj(layers[activeLayerIndex], type);
            layers[activeLayerIndex][k].sharpness = parseFloat(document.getElementById(k + 'Sharpness').value);
            document.getElementById(k + 'SharpnessVal').textContent = document.getElementById(k + 'Sharpness').value;
            render();
        });

        // Кривая затухания (select)
        var falloffEl = document.getElementById(k + 'Falloff');
        if (falloffEl) {
            falloffEl.addEventListener('change', function() {
                if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
                _ensureVignetteObj(layers[activeLayerIndex], type);
                layers[activeLayerIndex][k].falloffCurve = falloffEl.value;
                render();
            });
        }
    });

    // Кнопки выбора цветового диапазона
    document.querySelectorAll('.color-range-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            selectedColorRange = btn.dataset.color;
            document.querySelectorAll('.color-range-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            document.getElementById('colorMaskControls').style.display = 'block';
            // Применяем маску сразу при выборе цвета
            applyColorMaskLive();
        });
    });

    // Ползунки цветовой маски — динамическое применение
    initSlider('tolerance', function() {
        document.getElementById('toleranceVal').textContent = document.getElementById('tolerance').value;
        applyColorMaskLive();
    });
    initSlider('maskBrightness', function() {
        document.getElementById('maskBrightnessVal').textContent = document.getElementById('maskBrightness').value;
        applyColorMaskLive();
    });
    initSlider('maskSaturation', function() {
        document.getElementById('maskSaturationVal').textContent = document.getElementById('maskSaturation').value;
        applyColorMaskLive();
    });
    initSlider('maskHue', function() {
        document.getElementById('maskHueVal').textContent = document.getElementById('maskHue').value;
        applyColorMaskLive();
    });

    // Ползунки Channel Mixer
    initChannelMixerControls();

    // Инициализация единого инструмента удаления по цвету
    initColorRemoval();

    // Инициализация вкладки искажений и пикселизации
    initDistortionTab();

    // Инициализация вкладки ластика
    initEraserTab();

    // Инициализация вкладки маркера
    initMarkerControls();
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

function updateBackgroundTabUI(layer) {
    // Restore color removal UI
    const cr = layer.colorRemoval;
    document.getElementById('colorToRemove').value = cr && cr.targetColor
        ? rgbToHex(cr.targetColor.r, cr.targetColor.g, cr.targetColor.b)
        : '#00ff00';
    document.getElementById('colorRemovalMode').value = cr ? cr.mode : 'transparent';
    document.getElementById('colorReplacementGroup').style.display =
        (cr && cr.mode === 'replace') ? 'block' : 'none';
    document.getElementById('colorRemovalTolerance').value = cr ? cr.tolerance : 30;
    document.getElementById('colorRemovalToleranceVal').textContent = cr ? cr.tolerance : 30;
    document.getElementById('colorRemovalFeather').value = cr ? cr.feather : 10;
    document.getElementById('colorRemovalFeatherVal').textContent = cr ? cr.feather : 10;
    document.getElementById('colorRemovalStrength').value = cr ? cr.strength : 100;
    document.getElementById('colorRemovalStrengthVal').textContent = cr ? cr.strength : 100;

    // Restore luminance removal UI
    const lr = layer.luminanceRemoval;
    document.getElementById('luminanceType').value = lr ? lr.type : '';
    document.getElementById('luminanceThreshold').value = lr ? lr.threshold : 50;
    document.getElementById('luminanceThresholdVal').textContent = lr ? lr.threshold : 50;
    document.getElementById('luminanceStrength').value = lr ? lr.strength : 100;
    document.getElementById('luminanceStrengthVal').textContent = lr ? lr.strength : 100;
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

// Применить удаление по цвету (неразрушающее, динамическое)
const applyColorRemovalLive = debounce(function() {
    const layer = layers[activeLayerIndex];
    if (!layer || !layer.image) return;

    const targetColor = hexToRgb(document.getElementById('colorToRemove').value);
    const mode = document.getElementById('colorRemovalMode').value;
    const tolerance = parseInt(document.getElementById('colorRemovalTolerance').value);
    const feather = parseInt(document.getElementById('colorRemovalFeather').value);
    const strength = parseInt(document.getElementById('colorRemovalStrength').value);
    const replacementColor = mode === 'replace'
        ? hexToRgb(document.getElementById('colorReplacementPicker').value)
        : null;

    const smartEnabled = document.getElementById('smartRemovalEnabled').checked;
    const edgeProtection = smartEnabled
        ? parseInt(document.getElementById('edgeProtection').value)
        : 0;
    const foregroundBias = smartEnabled
        ? parseInt(document.getElementById('foregroundBias').value)
        : 50;

    layer.colorRemoval = {
        targetColor,
        mode,
        tolerance,
        feather,
        strength,
        replacementColor,
        smart: smartEnabled,
        edgeProtection,
        foregroundBias
    };
    render();
}, 150);

// Применить удаление по яркости (неразрушающее, динамическое)
const applyLuminanceLive = debounce(function() {
    const layer = layers[activeLayerIndex];
    if (!layer || !layer.image) return;

    const type = document.getElementById('luminanceType').value;
    if (!type) {
        layer.luminanceRemoval = null;
        render();
        return;
    }

    const threshold = parseInt(document.getElementById('luminanceThreshold').value);
    const feather = 0; // Luminance section has no dedicated feather slider
    const strength = parseInt(document.getElementById('luminanceStrength').value);

    layer.luminanceRemoval = { type, threshold, feather, strength };
    render();
}, 150);

// Сбросить удаление по цвету
function resetColorRemoval() {
    const layer = layers[activeLayerIndex];
    if (!layer) return;
    layer.colorRemoval = null;
    document.getElementById('colorToRemove').value = '#00ff00';
    document.getElementById('colorRemovalMode').value = 'transparent';
    document.getElementById('colorReplacementGroup').style.display = 'none';
    document.getElementById('colorRemovalTolerance').value = 30;
    document.getElementById('colorRemovalToleranceVal').textContent = 30;
    document.getElementById('colorRemovalFeather').value = 10;
    document.getElementById('colorRemovalFeatherVal').textContent = 10;
    document.getElementById('colorRemovalStrength').value = 100;
    document.getElementById('colorRemovalStrengthVal').textContent = 100;
    document.getElementById('smartRemovalEnabled').checked = false;
    document.getElementById('smartRemovalParams').style.display = 'none';
    document.getElementById('edgeProtection').value = 50;
    document.getElementById('edgeProtectionVal').textContent = 50;
    document.getElementById('foregroundBias').value = 50;
    document.getElementById('foregroundBiasVal').textContent = 50;
    render();
    showHint('Удаление цвета сброшено');
}

// Сбросить раздел удаления по яркости
function resetLuminanceSection() {
    const layer = layers[activeLayerIndex];
    if (!layer) return;
    layer.luminanceRemoval = null;
    document.getElementById('luminanceType').value = '';
    document.getElementById('luminanceThreshold').value = 50;
    document.getElementById('luminanceThresholdVal').textContent = 50;
    document.getElementById('luminanceStrength').value = 100;
    document.getElementById('luminanceStrengthVal').textContent = 100;
    render();
    showHint('Удаление по яркости сброшено');
}

// Сбросить все эффекты фона
function resetAllBackgroundEffects() {
    resetColorRemoval();
    resetLuminanceSection();
    showHint('Все эффекты фона сброшены');
}

// ===== УНИВЕРСАЛЬНОЕ УДАЛЕНИЕ ПО ЦВЕТУ (ПИПЕТКА) =====

var colorRemovalEyedropperActive = false;

/**
 * Активировать пипетку для удаления по цвету
 */
function activateColorRemovalEyedropper() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.image) {
        showHint('⚠️ Загрузите изображение для использования пипетки');
        return;
    }

    colorRemovalEyedropperActive = true;
    canvas.style.cursor = 'crosshair';

    document.getElementById('colorRemovalEyedropperBtn').classList.add('active');
    document.getElementById('colorRemovalEyedropperBtn').textContent = '✓ Кликните на цвет';

    showHint('💧 Кликните на изображение для выбора цвета');
}

/**
 * Деактивировать пипетку
 */
function deactivateColorRemovalEyedropper() {
    colorRemovalEyedropperActive = false;
    canvas.style.cursor = '';

    var btn = document.getElementById('colorRemovalEyedropperBtn');
    if (btn) {
        btn.classList.remove('active');
        btn.textContent = '💧 Пипетка';
    }
}

/**
 * Обработчик клика по canvas для пипетки удаления по цвету
 */
function handleColorRemovalEyedropperClick(e) {
    if (!colorRemovalEyedropperActive) return;

    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var canvasX = Math.round((e.clientX - rect.left) * scaleX);
    var canvasY = Math.round((e.clientY - rect.top) * scaleY);

    if (canvasX < 0 || canvasX >= canvas.width || canvasY < 0 || canvasY >= canvas.height) {
        showHint('⚠️ Кликните внутри изображения');
        return;
    }

    var useAverage = document.getElementById('colorRemovalAverage') &&
                     document.getElementById('colorRemovalAverage').checked;
    var color = useAverage
        ? getAveragePixelColor(canvasX, canvasY, 5)
        : getPixelColorFromCanvas(canvasX, canvasY);

    if (!color) {
        showHint('❌ Не удалось получить цвет пикселя');
        deactivateColorRemovalEyedropper();
        return;
    }

    var hexColor = rgbToHex(color.r, color.g, color.b);
    document.getElementById('colorToRemove').value = hexColor;

    showHint('✅ Выбран цвет: RGB(' + color.r + ', ' + color.g + ', ' + color.b + ')');

    deactivateColorRemovalEyedropper();
    applyColorRemovalLive();
}

/**
 * Инициализация единого инструмента удаления по цвету
 */
function initColorRemoval() {
    var btn = document.getElementById('colorRemovalEyedropperBtn');
    if (!btn) return;

    // Клик по кнопке пипетки
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        if (colorRemovalEyedropperActive) {
            deactivateColorRemovalEyedropper();
        } else {
            activateColorRemovalEyedropper();
        }
    });

    // Клик по canvas
    canvas.addEventListener('click', handleColorRemovalEyedropperClick);

    // ESC для отмены
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && colorRemovalEyedropperActive) {
            showHint('❌ Выбор цвета отменён');
            deactivateColorRemovalEyedropper();
        }
    });

    // Изменение color picker
    document.getElementById('colorToRemove').addEventListener('input', applyColorRemovalLive);

    // Изменение режима обработки
    document.getElementById('colorRemovalMode').addEventListener('change', function(e) {
        document.getElementById('colorReplacementGroup').style.display =
            e.target.value === 'replace' ? 'block' : 'none';
        applyColorRemovalLive();
    });

    // Изменение цвета замены
    document.getElementById('colorReplacementPicker').addEventListener('input', applyColorRemovalLive);

    // Тип удаления по яркости
    document.getElementById('luminanceType').addEventListener('change', function() {
        applyLuminanceLive();
    });

    // Слайдеры удаления по цвету
    initSlider('colorRemovalTolerance', function() {
        document.getElementById('colorRemovalToleranceVal').textContent =
            document.getElementById('colorRemovalTolerance').value;
        applyColorRemovalLive();
    });

    initSlider('colorRemovalFeather', function() {
        document.getElementById('colorRemovalFeatherVal').textContent =
            document.getElementById('colorRemovalFeather').value;
        applyColorRemovalLive();
    });

    initSlider('colorRemovalStrength', function() {
        document.getElementById('colorRemovalStrengthVal').textContent =
            document.getElementById('colorRemovalStrength').value;
        applyColorRemovalLive();
    });

    // Чекбокс умного режима удаления
    document.getElementById('smartRemovalEnabled').addEventListener('change', function(e) {
        document.getElementById('smartRemovalParams').style.display =
            e.target.checked ? 'block' : 'none';
        applyColorRemovalLive();
    });

    // Слайдеры умного режима
    initSlider('edgeProtection', function() {
        document.getElementById('edgeProtectionVal').textContent =
            document.getElementById('edgeProtection').value;
        applyColorRemovalLive();
    });

    initSlider('foregroundBias', function() {
        document.getElementById('foregroundBiasVal').textContent =
            document.getElementById('foregroundBias').value;
        applyColorRemovalLive();
    });

    // Слайдеры удаления по яркости
    initSlider('luminanceThreshold', function() {
        document.getElementById('luminanceThresholdVal').textContent =
            document.getElementById('luminanceThreshold').value;
        applyLuminanceLive();
    });

    initSlider('luminanceStrength', function() {
        document.getElementById('luminanceStrengthVal').textContent =
            document.getElementById('luminanceStrength').value;
        applyLuminanceLive();
    });
}


/**
 * Получить цвет пикселя из canvas
 * @param {number} canvasX - X координата на canvas
 * @param {number} canvasY - Y координата на canvas
 * @returns {{r: number, g: number, b: number}|null}
 */
function getPixelColorFromCanvas(canvasX, canvasY) {
    try {
        var imageData = ctx.getImageData(canvasX, canvasY, 1, 1);
        var data = imageData.data;
        return { r: data[0], g: data[1], b: data[2] };
    } catch (e) {
        console.error('Ошибка получения цвета пикселя:', e);
        return null;
    }
}

/**
 * Получить усреднённый цвет из области sampleSize×sampleSize пикселей
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} [sampleSize=5]
 * @returns {{r: number, g: number, b: number}|null}
 */
function getAveragePixelColor(centerX, centerY, sampleSize) {
    sampleSize = sampleSize || 5;
    var halfSize = Math.floor(sampleSize / 2);
    var sumR = 0, sumG = 0, sumB = 0, count = 0;

    for (var dy = -halfSize; dy <= halfSize; dy++) {
        for (var dx = -halfSize; dx <= halfSize; dx++) {
            var x = centerX + dx;
            var y = centerY + dy;

            if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
                continue;
            }

            try {
                var imageData = ctx.getImageData(x, y, 1, 1);
                var data = imageData.data;
                sumR += data[0];
                sumG += data[1];
                sumB += data[2];
                count++;
            } catch (e) {
                // Игнорировать ошибки
            }
        }
    }

    if (count === 0) return null;

    return {
        r: Math.round(sumR / count),
        g: Math.round(sumG / count),
        b: Math.round(sumB / count)
    };
}

/**
 * Конвертировать RGB в hex
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string} hex вида "#rrggbb"
 */
function rgbToHex(r, g, b) {
    return '#' +
        r.toString(16).padStart(2, '0') +
        g.toString(16).padStart(2, '0') +
        b.toString(16).padStart(2, '0');
}

// Инициализация вкладки искажений и пикселизации
const applyDistortionLive = debounce(function() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.originalImage) return;

    var type = document.getElementById('distortionType').value;
    if (!type) {
        layer.image = layer.originalImage;
        render();
        return;
    }

    showProcessing('Применение искажения...');

    var intensity = parseInt(document.getElementById('distortIntensity').value);
    var radius = parseInt(document.getElementById('distortRadius').value) / 100;

    var tempCanvas = document.createElement('canvas');
    var tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.originalImage.width;
    tempCanvas.height = layer.originalImage.height;

    tempCtx.drawImage(layer.originalImage, 0, 0);
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
        case 'ripple':
            imageData = applyRadialRipple(imageData, intensity, 5);
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
        hideProcessing();
        showHint('Искажение применено');
    };
    newImg.src = tempCanvas.toDataURL('image/png');
}, 300);

const applyPixelationLive = debounce(function() {
    var layer = layers[activeLayerIndex];
    if (!layer || !layer.originalImage) return;

    var mode = document.getElementById('pixelMode').value;
    if (mode === 'none') {
        layer.image = layer.originalImage;
        render();
        return;
    }

    showProcessing('Применение пикселизации...');

    var blockSize = parseInt(document.getElementById('pixelSize').value);
    var colorCount = parseInt(document.getElementById('colorCount').value);
    var palette = document.getElementById('retroPalette').value;

    var tempCanvas = document.createElement('canvas');
    var tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.originalImage.width;
    tempCanvas.height = layer.originalImage.height;

    tempCtx.drawImage(layer.originalImage, 0, 0);
    var imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    switch (mode) {
        case 'mosaic':
            imageData = applyPixelation(imageData, blockSize);
            break;
        case 'pixelart-floyd':
            imageData = applyPixelArt(imageData, blockSize, colorCount, 'floyd-steinberg');
            break;
        case 'pixelart-atkinson':
            imageData = applyPixelArt(imageData, blockSize, colorCount, 'atkinson');
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
        hideProcessing();
        showHint('Пикселизация применена');
    };
    newImg.src = tempCanvas.toDataURL('image/png');
}, 300);

function initDistortionTab() {
    // Показать/скрыть группы параметров при смене режима пикселизации
    document.getElementById('pixelMode').addEventListener('change', function(e) {
        var colorGroup = document.getElementById('colorCountGroup');
        var paletteGroup = document.getElementById('retroPaletteGroup');

        if (e.target.value === 'pixelart-floyd' || e.target.value === 'pixelart-atkinson') {
            colorGroup.style.display = 'block';
            paletteGroup.style.display = 'none';
        } else if (e.target.value === 'retro') {
            colorGroup.style.display = 'none';
            paletteGroup.style.display = 'block';
        } else {
            colorGroup.style.display = 'none';
            paletteGroup.style.display = 'none';
        }

        // Динамическое применение при смене режима
        applyPixelationLive();
    });

    // Динамическое применение искажений при изменении типа
    document.getElementById('distortionType').addEventListener('change', applyDistortionLive);

    // Ползунки искажений с динамическим применением
    initSlider('distortIntensity', function() {
        document.getElementById('distortIntensityVal').textContent =
            document.getElementById('distortIntensity').value;
        applyDistortionLive();
    });

    initSlider('distortRadius', function() {
        document.getElementById('distortRadiusVal').textContent =
            document.getElementById('distortRadius').value + '%';
        applyDistortionLive();
    });

    initSlider('pixelSize', function() {
        document.getElementById('pixelSizeVal').textContent =
            document.getElementById('pixelSize').value + 'px';
        applyPixelationLive();
    });

    initSlider('colorCount', function() {
        document.getElementById('colorCountVal').textContent =
            document.getElementById('colorCount').value;
        applyPixelationLive();
    });

    // Динамическое применение при смене палитры
    document.getElementById('retroPalette').addEventListener('change', applyPixelationLive);
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
        case 'ripple':
            imageData = applyRadialRipple(imageData, intensity, 5);
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
        case 'pixelart-floyd':
            imageData = applyPixelArt(imageData, blockSize, colorCount, 'floyd-steinberg');
            break;
        case 'pixelart-atkinson':
            imageData = applyPixelArt(imageData, blockSize, colorCount, 'atkinson');
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

// ==================== ВИНЬЕТКИ ====================

/**
 * Гарантирует, что layer[key] является объектом (конвертирует старый числовой формат).
 */
function _ensureVignetteObj(layer, type) {
    const k = 'vignette' + type;
    const val = layer[k];
    if (!val || typeof val === 'number') {
        const intensity = typeof val === 'number' ? val : 0;
        layer[k] = Object.assign({}, VIGNETTE_DEFAULTS[type], { intensity: intensity });
    }
}

function resetAllVignettes() {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];
    ['Darken', 'Lighten', 'Transparency'].forEach(function(type) {
        layer['vignette' + type] = Object.assign({}, VIGNETTE_DEFAULTS[type]);
    });
    updateControls();
    render();
    showHint('Виньетки сброшены');
}

function setVignetteTypeShape(type, shape, btn) {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];
    _ensureVignetteObj(layer, type);
    layer['vignette' + type].shape = shape;
    // Update button states
    ['Circle', 'Ellipse', 'Rectangle'].forEach(function(s) {
        const el = document.getElementById('vignette' + type + 'Shape' + s);
        if (el) el.classList.toggle('active', s.toLowerCase() === shape);
    });
    render();
}

function centerVignette(type) {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];
    _ensureVignetteObj(layer, type);
    layer['vignette' + type].centerX = 50;
    layer['vignette' + type].centerY = 50;
    // Sync sliders
    var k = 'vignette' + type;
    var elX = document.getElementById(k + 'CenterX');
    var elY = document.getElementById(k + 'CenterY');
    if (elX) { elX.value = 50; document.getElementById(k + 'CenterXVal').textContent = 50; }
    if (elY) { elY.value = 50; document.getElementById(k + 'CenterYVal').textContent = 50; }
    render();
}

// Legacy: setVignetteShape is no longer used but kept for backward compatibility
function setVignetteShape(shape, btn) {
    setVignetteTypeShape('Darken', shape, btn);
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
        // Обновить кнопку только если ластик успешно активировался
        if (eraserState.active) {
            document.getElementById('toggleEraser').textContent = '✖ Деактивировать ластик';
            document.getElementById('toggleEraser').classList.remove('primary');
            document.getElementById('toggleEraser').classList.add('danger');
        }
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
        // Сбросить editCanvas
        eraserState.editCanvas = null;
        eraserState.editCtx = null;
        eraserState.editLayerIndex = -1;
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

    // Показать/скрыть группы параметров умного ластика и обработки краёв
    document.getElementById('eraserMode').addEventListener('change', function(e) {
        var mode = e.target.value;
        var isSmart = mode === 'smart';
        var isRefine = mode === 'refine';
        var smartGroup = document.getElementById('smartEraseGroup');
        var smartAdvancedGroup = document.getElementById('smartEraseAdvancedGroup');
        var smartOptionsGroup = document.getElementById('smartOptionsGroup');
        var smartEdgeSensitivityGroup = document.getElementById('smartEdgeSensitivityGroup');
        var refineGroup = document.getElementById('refineGroup');
        var refineStrengthGroup = document.getElementById('refineStrengthGroup');
        var refineRadiusGroup = document.getElementById('refineRadiusGroup');
        var refineOptionsGroup = document.getElementById('refineOptionsGroup');

        if (smartGroup) smartGroup.style.display = isSmart ? 'block' : 'none';
        if (smartAdvancedGroup) smartAdvancedGroup.style.display = isSmart ? 'block' : 'none';
        if (smartOptionsGroup) smartOptionsGroup.style.display = isSmart ? 'block' : 'none';

        // Чувствительность показывать только если edge detection включен
        if (smartEdgeSensitivityGroup) {
            var edgeDetectionEnabled = document.getElementById('smartEdgeDetection').checked;
            smartEdgeSensitivityGroup.style.display = (isSmart && edgeDetectionEnabled) ? 'block' : 'none';
        }

        if (refineGroup) refineGroup.style.display = isRefine ? 'block' : 'none';
        if (refineStrengthGroup) refineStrengthGroup.style.display = isRefine ? 'block' : 'none';
        if (refineRadiusGroup) refineRadiusGroup.style.display = isRefine ? 'block' : 'none';
        if (refineOptionsGroup) refineOptionsGroup.style.display = isRefine ? 'block' : 'none';
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
