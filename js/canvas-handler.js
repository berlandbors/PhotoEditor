// Canvas handler - rendering layers, applying pixel filters, and drag interactions

// ===== ПРИМЕНЕНИЕ ФИЛЬТРОВ =====
function applyFiltersToImage(layer) {
    if (!layer.image) return layer.image;
    
    // Создаём временный canvas для применения фильтров
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = layer.image.width;
    tempCanvas.height = layer.image.height;
    
    // Рисуем оригинал
    tempCtx.drawImage(layer.image, 0, 0);
    
    // Получаем данные изображения
    let imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    let data = imageData.data;
    
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

    tempCtx.save();
    tempCtx.globalAlpha = 1;
    tempCtx.globalCompositeOperation = 'source-over';

    const width = layer.image.width * layer.scale;
    const height = layer.image.height * layer.scale;

    // Трансформации
    tempCtx.translate(layer.x + width / 2, layer.y + height / 2);
    tempCtx.rotate(layer.rotation * Math.PI / 180);
    if (layer.flipX) tempCtx.scale(-1, 1);
    tempCtx.translate(-(layer.x + width / 2), -(layer.y + height / 2));

    // Применяем пиксельные фильтры (яркость, контраст и т.д.)
    const filteredImage = applyFiltersToImage(layer);

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
    
    const width = layer.image.width * layer.scale;
    const height = layer.image.height * layer.scale;
    
    // Трансформации
    ctx.translate(layer.x + width / 2, layer.y + height / 2);
    ctx.rotate(layer.rotation * Math.PI / 180);
    if (layer.flipX) ctx.scale(-1, 1);
    ctx.translate(-(layer.x + width / 2), -(layer.y + height / 2));
    
    // Применяем фильтры
    const filteredImage = applyFiltersToImage(layer);
    
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
