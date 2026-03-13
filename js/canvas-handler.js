// Canvas handler - rendering layers, applying pixel filters, and drag interactions

// ===== ОРИЕНТАЦИЯ ИЗОБРАЖЕНИЯ =====
const ORIENTATION_LABELS = {
    'auto': 'Авто',
    'landscape': 'Альбомная',
    'portrait': 'Книжная'
    // 'square' is an internal-only value used to skip rotation for square images
};

/**
 * Определить текущую ориентацию изображения
 * @param {HTMLImageElement|HTMLCanvasElement} img
 * @returns {'landscape'|'portrait'|'square'}
 */
function getImageOrientation(img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w > h) return 'landscape';
    if (h > w) return 'portrait';
    return 'square';
}

/**
 * Повернуть изображение на 90° для получения нужной ориентации
 * @param {HTMLImageElement} img
 * @param {'auto'|'landscape'|'portrait'} targetOrientation
 * @returns {HTMLImageElement|HTMLCanvasElement}
 */
function rotateImageForOrientation(img, targetOrientation) {
    if (targetOrientation === 'auto') return img;

    const currentOrientation = getImageOrientation(img);

    // Квадратные изображения не поворачиваем
    if (currentOrientation === 'square') return img;

    // Если ориентация уже совпадает, поворот не нужен
    if (currentOrientation === targetOrientation) return img;

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    // Создаём временный canvas для поворота на 90° по часовой стрелке
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // Меняем ширину и высоту местами
    tempCanvas.width = h;
    tempCanvas.height = w;

    tempCtx.translate(h / 2, w / 2);
    tempCtx.rotate(Math.PI / 2);
    tempCtx.drawImage(img, -w / 2, -h / 2);

    return tempCanvas;
}

/**
 * Получить изображение с применённой ориентацией
 * @param {Object} layer
 * @returns {HTMLImageElement|HTMLCanvasElement|null}
 */
function getOrientedImage(layer) {
    if (!layer.image) return null;
    return rotateImageForOrientation(layer.image, layer.orientation || 'auto');
}

// ===== ПРИМЕНЕНИЕ ФИЛЬТРОВ =====
function applyFiltersToImage(layer, imageOverride) {
    const img = imageOverride || layer.image;
    if (!img) return img;
    
    // Создаём временный canvas для применения фильтров
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    
    // Рисуем оригинал
    tempCtx.drawImage(img, 0, 0);
    
    // Получаем данные изображения
    let imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    let data = imageData.data;

    // Применяем цветовую маску перед остальными фильтрами
    if (layer.colorMask) {
        imageData = applyColorMask(
            imageData,
            layer.colorMask.range,
            layer.colorMask.adjustments,
            layer.colorMask.tolerance
        );
        data = imageData.data;
    }

    // Применяем фильтры
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];
        
        // Яркость
        if (layer.brightness !== 0) {
            const bright = layer.brightness * 2.55;
            r += bright;
            g += bright;
            b += bright;
        }
        
        // Контраст
        if (layer.contrast !== 0) {
            const factor = (259 * (layer.contrast + 255)) / (255 * (259 - layer.contrast));
            r = factor * (r - 128) + 128;
            g = factor * (g - 128) + 128;
            b = factor * (b - 128) + 128;
        }
        
        // Насыщенность
        if (layer.saturation !== 0) {
            const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
            const satFactor = 1 + (layer.saturation / 100);
            r = gray + (r - gray) * satFactor;
            g = gray + (g - gray) * satFactor;
            b = gray + (b - gray) * satFactor;
        }
        
        // Температура (теплые/холодные тона)
        if (layer.temperature !== 0) {
            const temp = layer.temperature / 100;
            r += temp * 50;
            b -= temp * 50;
        }
        
        // Оттенок (hue shift)
        if (layer.hue !== 0) {
            // Конвертируем RGB в HSL и обратно с изменением H
            const hsl = rgbToHsl(r, g, b);
            hsl[0] = (hsl[0] + layer.hue / 360) % 1;
            const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
            r = rgb[0];
            g = rgb[1];
            b = rgb[2];
        }
        
        // HDR эффект
        if (layer.hdr > 0) {
            const hdrFactor = layer.hdr / 100;
            const avg = (r + g + b) / 3;
            if (avg > 128) {
                r = r + (255 - r) * hdrFactor * 0.3;
                g = g + (255 - g) * hdrFactor * 0.3;
                b = b + (255 - b) * hdrFactor * 0.3;
            } else {
                r = r * (1 - hdrFactor * 0.3);
                g = g * (1 - hdrFactor * 0.3);
                b = b * (1 - hdrFactor * 0.3);
            }
        }
        
        // Ограничиваем значения
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
    }
    
    // Зерно пленки
    if (layer.grain > 0) {
        const grainAmount = layer.grain / 100;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * grainAmount * 50;
            data[i] += noise;
            data[i + 1] += noise;
            data[i + 2] += noise;
        }
    }
    
    tempCtx.putImageData(imageData, 0, 0);
    
    // Применяем эффекты через CSS фильтры
    let filterString = '';
    
    if (layer.blur > 0) {
        filterString += `blur(${layer.blur}px) `;
    }
    
    if (layer.sharpness > 0) {
        const sharpAmount = 1 + (layer.sharpness / 50);
        filterString += `contrast(${sharpAmount}) `;
    }
    
    return tempCanvas;
}

// Вспомогательные функции для конвертации цветов
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return [h, s, l];
}

function hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [r * 255, g * 255, b * 255];
}

// ===== РЕНДЕРИНГ С ФИЛЬТРАМИ =====
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const layer1 = layers[1];
    const layer2 = layers[2];

    // Если второй слой использует попиксельное смешивание —
    // оба слоя объединяются в applyCanvasBlending, рисуем сразу результат
    if (layer2.image && layer2.blendMode.startsWith('canvas-')) {
        applyCanvasBlending(layer1, layer2);
        return;
    }

    // Стандартный рендеринг: CSS режимы наложения через globalCompositeOperation
    if (layer1.image) {
        drawLayer(layer1);
    }
    if (layer2.image) {
        drawLayer(layer2);
    }
}

/**
 * Отрисовать слой на отдельный временный canvas того же размера, что и основной.
 * Применяются все трансформации и фильтры, но режим наложения — source-over.
 * @param {object} layer
 * @returns {HTMLCanvasElement}
 */
function createTempCanvas(layer) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    if (!layer.image) return tempCanvas;

    // Используем изображение с применённой ориентацией
    const orientedImage = getOrientedImage(layer);
    if (!orientedImage) return tempCanvas;

    tempCtx.save();
    tempCtx.globalAlpha = 1;
    tempCtx.globalCompositeOperation = 'source-over';

    const width = orientedImage.width * layer.scale;
    const height = orientedImage.height * layer.scale;

    // Трансформации
    tempCtx.translate(layer.x + width / 2, layer.y + height / 2);
    tempCtx.rotate(layer.rotation * Math.PI / 180);
    if (layer.flipX) tempCtx.scale(-1, 1);
    tempCtx.translate(-(layer.x + width / 2), -(layer.y + height / 2));

    // Применяем пиксельные фильтры к ориентированному изображению
    const filteredImage = applyFiltersToImage(layer, orientedImage);

    // CSS фильтр для размытия
    if (layer.blur > 0) {
        tempCtx.filter = `blur(${layer.blur}px)`;
    }

    tempCtx.drawImage(filteredImage, layer.x, layer.y, width, height);
    tempCtx.restore();
    tempCtx.filter = 'none';

    return tempCanvas;
}

/**
 * Применить попиксельное смешивание двух слоёв и отрисовать результат на основном canvas.
 * @param {object} layer1 — нижний слой
 * @param {object} layer2 — верхний слой (содержит canvas-режим смешивания)
 */
function applyCanvasBlending(layer1, layer2) {
    // Извлекаем имя алгоритма: 'canvas-average' → 'average'
    const mode = layer2.blendMode.replace('canvas-', '');

    // Рендерим каждый слой на отдельный временный canvas
    const tempCanvas1 = createTempCanvas(layer1);
    const tempCanvas2 = createTempCanvas(layer2);

    // Применяем попиксельный алгоритм из blending.js
    const resultCanvas = window.BlendingEngine.blendImages(
        tempCanvas1, tempCanvas2, mode, layer2.opacity
    );

    // Отрисовываем результат на основном canvas
    ctx.drawImage(resultCanvas, 0, 0);
}

function drawLayer(layer) {
    ctx.save();
    
    // Применяем режим наложения и прозрачность
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode;
    
    // Используем изображение с применённой ориентацией
    const orientedImage = getOrientedImage(layer);
    if (!orientedImage) {
        ctx.restore();
        return;
    }

    const width = orientedImage.width * layer.scale;
    const height = orientedImage.height * layer.scale;
    
    // Трансформации
    ctx.translate(layer.x + width / 2, layer.y + height / 2);
    ctx.rotate(layer.rotation * Math.PI / 180);
    if (layer.flipX) ctx.scale(-1, 1);
    ctx.translate(-(layer.x + width / 2), -(layer.y + height / 2));
    
    // Применяем фильтры к ориентированному изображению
    const filteredImage = applyFiltersToImage(layer, orientedImage);
    
    // CSS фильтры для blur
    if (layer.blur > 0) {
        ctx.filter = `blur(${layer.blur}px)`;
    }
    
    // Рисуем изображение с фильтрами
    ctx.drawImage(filteredImage, layer.x, layer.y, width, height);
    
    // Виньетирование
    if (layer.vignette > 0) {
        const centerX = layer.x + width / 2;
        const centerY = layer.y + height / 2;
        const radius = Math.max(width, height);
        const vignetteStrength = layer.vignette / 100;
        
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.7, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, `rgba(0,0,0,${vignetteStrength})`);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(layer.x, layer.y, width, height);
    }
    
    ctx.restore();
    ctx.filter = 'none';
}

// ===== ПЕРЕТАСКИВАНИЕ СЛОЯ НА CANVAS =====
function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    return {
        x: x * (canvas.width / rect.width),
        y: y * (canvas.height / rect.height)
    };
}

function startDrag(e) {
    if (!layers[activeLayer].image) return;
    if (e.touches && e.touches.length > 1) return;
    e.preventDefault();
    
    const coords = getCoords(e);
    isDragging = true;
    const layer = layers[activeLayer];
    dragStartX = coords.x - layer.x;
    dragStartY = coords.y - layer.y;
}

function drag(e) {
    if (isDragging) {
        e.preventDefault();
        const coords = getCoords(e);
        
        layers[activeLayer].x = coords.x - dragStartX;
        layers[activeLayer].y = coords.y - dragStartY;
        
        updateControls();
        render();
    }
}

function endDrag() {
    isDragging = false;
}

// Регистрация обработчиков canvas — вызывается из app.js после определения глобальных переменных
function initCanvasHandlers() {
    canvas.addEventListener('mousedown', startDrag);
    canvas.addEventListener('touchstart', startDrag);
    canvas.addEventListener('mousemove', drag);
    canvas.addEventListener('touchmove', drag);
    canvas.addEventListener('mouseup', endDrag);
    canvas.addEventListener('touchend', endDrag);
    canvas.addEventListener('mouseleave', endDrag);
}

// ===== ОРИЕНТАЦИЯ ХОЛСТА =====

function setCanvasOrientation(orientation) {
    canvasOrientation = orientation;
    document.querySelectorAll('.orientation-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.orientation === orientation);
    });
    updateCanvasSize();
    render();
}

function updateCanvasSize() {
    if (canvasOrientation === 'auto') {
        const dims = calculateAutoCanvasSize();
        canvas.width = dims.width;
        canvas.height = dims.height;
    } else {
        const size = CANVAS_SIZES[canvasOrientation];
        canvas.width = size.width;
        canvas.height = size.height;
    }
}

function calculateAutoCanvasSize() {
    let maxW = 1400, maxH = 900;
    [1, 2].forEach(n => {
        const l = layers[n];
        if (l.image) {
            maxW = Math.max(maxW, l.x + l.image.width * l.scale + 100);
            maxH = Math.max(maxH, l.y + l.image.height * l.scale + 100);
        }
    });
    return { width: Math.min(maxW, 3000), height: Math.min(maxH, 3000) };
}
