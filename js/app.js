// App - global state, coordination between modules, and application initialization
// Загружается последним, после canvas-handler.js, filter-presets.js, layer-manager.js, ui-controls.js

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const canvasWrapper = document.getElementById('canvasWrapper');
const canvasContainer = document.getElementById('canvasContainer');

let activeLayerIndex = -1;
let uiScale = 1;
let canvasZoom = 1;
let currentTab = 'basic';
let canvasOrientation = 'auto';

const CANVAS_SIZES = {
    landscape: { width: 1400, height: 900 },
    portrait: { width: 900, height: 1400 },
    square: { width: 1200, height: 1200 }
};

// Структура слоёв — динамический массив
let layers = [];
let nextLayerId = 1;
const MAX_LAYERS = 5;

function createNewLayer() {
    const id = nextLayerId++;
    return {
        id,
        name: `Слой ${id}`,
        image: null,
        originalImage: null,
        x: 200,
        y: 150,
        scale: 1,
        rotation: 0,
        opacity: 1,
        blendMode: 'source-over',
        flipX: false,
        orientation: 'auto',
        visible: true,
        locked: false,
        // Фильтры
        brightness: 0,
        contrast: 0,
        saturation: 0,
        temperature: 0,
        hue: 0,
        // Эффекты
        blur: 0,
        sharpness: 0,
        vignette: 0,
        hdr: 0,
        grain: 0,
        // Маски и каналы
        colorMask: null,
        channelMixer: null,
        levels: null
    };
}

let selectedColorRange = null;

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

const blendModeNames = {
    // Стандартные CSS режимы наложения
    'source-over': 'Обычный',
    'multiply': 'Умножение',
    'screen': 'Экран',
    'overlay': 'Наложение',
    'darken': 'Темнее',
    'lighten': 'Светлее',
    'color-dodge': 'Dodge',
    'hard-light': 'Свет',

    // Попиксельные Canvas режимы (⚡)
    'canvas-average': '⚡ Усреднение',
    'canvas-additive': '⚡ Сложение',
    'canvas-multiply': '⚡ Умножение*',
    'canvas-screen': '⚡ Экран*',
    'canvas-overlay': '⚡ Наложение*',
    'canvas-difference': '⚡ Разность',
    'canvas-lighten-only': '⚡ Светлее',
    'canvas-darken-only': '⚡ Темнее',
    'canvas-luminosity': '⚡ Яркость',
    'canvas-gradient-h': '⚡ Градиент →',
    'canvas-gradient-v': '⚡ Градиент ↓',
    'canvas-gradient-radial': '⚡ Градиент ○',
    'canvas-chroma-key': '⚡ Хромакей'
};

let hintTimeout;
function showHint(text) {
    const hint = document.getElementById('hint');
    hint.textContent = text;
    hint.classList.remove('hidden');
    
    clearTimeout(hintTimeout);
    hintTimeout = setTimeout(() => {
        hint.classList.add('hidden');
    }, 2000);
}

function showProcessing(message) {
    clearTimeout(hintTimeout);
    const hint = document.getElementById('hint');
    hint.textContent = message || 'Обработка...';
    hint.classList.remove('hidden');
    hint.style.background = 'rgba(255, 165, 0, 0.95)';
}

function hideProcessing() {
    const hint = document.getElementById('hint');
    hint.classList.add('hidden');
    hint.style.background = '';
}

// Инициализация модулей
initCanvasHandlers();
initUIControls();
initLayerManager();

// Запуск приложения
updateCanvasOverlay();

setTimeout(() => {
    updateCanvasSize();
    centerCanvas();
    applyCanvasZoom();
    updateLayerCount();
    updateAddButton();
    document.getElementById('hint').classList.add('hidden');
}, 100);
