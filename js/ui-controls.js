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
    layers[activeLayer].blendMode = mode;
    updateBlendModeButtons();
    render();
    showHint(blendModeNames[mode]);
}

function setOrientation(layerNum, orientation) {
    layers[layerNum].orientation = orientation;

    // Обновить активную кнопку
    document.querySelectorAll(`.orientation-btn[data-layer="${layerNum}"]`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.orientation === orientation);
    });

    // Обновить текстовое значение
    const valElement = document.getElementById(`orientation${layerNum}Val`);
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

    // Кнопки ориентации
    document.querySelectorAll('.orientation-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const layerNum = parseInt(this.dataset.layer);
            const orientation = this.dataset.orientation;
            setOrientation(layerNum, orientation);
        });
    });

    // Инициализация ползунков - Базовые
    initSlider('opacity', function() {
        layers[activeLayer].opacity = document.getElementById('opacity').value / 100;
        updateValues();
        render();
    });

    initSlider('scale', function() {
        layers[activeLayer].scale = document.getElementById('scale').value / 100;
        updateValues();
        render();
    });

    initSlider('rotate', function() {
        layers[activeLayer].rotation = parseFloat(document.getElementById('rotate').value);
        updateValues();
        render();
    });

    initSlider('posX', function() {
        layers[activeLayer].x = parseFloat(document.getElementById('posX').value);
        updateValues();
        render();
    });

    initSlider('posY', function() {
        layers[activeLayer].y = parseFloat(document.getElementById('posY').value);
        updateValues();
        render();
    });

    // Инициализация ползунков - Фильтры
    initSlider('brightness', function() {
        layers[activeLayer].brightness = parseFloat(document.getElementById('brightness').value);
        updateValues();
        render();
    });

    initSlider('contrast', function() {
        layers[activeLayer].contrast = parseFloat(document.getElementById('contrast').value);
        updateValues();
        render();
    });

    initSlider('saturation', function() {
        layers[activeLayer].saturation = parseFloat(document.getElementById('saturation').value);
        updateValues();
        render();
    });

    initSlider('temperature', function() {
        layers[activeLayer].temperature = parseFloat(document.getElementById('temperature').value);
        updateValues();
        render();
    });

    initSlider('hue', function() {
        layers[activeLayer].hue = parseFloat(document.getElementById('hue').value);
        updateValues();
        render();
    });

    // Инициализация ползунков - Эффекты
    initSlider('blur', function() {
        layers[activeLayer].blur = parseFloat(document.getElementById('blur').value);
        updateValues();
        render();
    });

    initSlider('sharpness', function() {
        layers[activeLayer].sharpness = parseFloat(document.getElementById('sharpness').value);
        updateValues();
        render();
    });

    initSlider('vignette', function() {
        layers[activeLayer].vignette = parseFloat(document.getElementById('vignette').value);
        updateValues();
        render();
    });

    initSlider('hdr', function() {
        layers[activeLayer].hdr = parseFloat(document.getElementById('hdr').value);
        updateValues();
        render();
    });

    initSlider('grain', function() {
        layers[activeLayer].grain = parseFloat(document.getElementById('grain').value);
        updateValues();
        render();
    });
}
