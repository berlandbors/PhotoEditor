// Layer manager - uploading images, selecting/removing layers, updating controls

function initUpload(layerNum) {
    const card = document.getElementById(`layer${layerNum}Card`);
    const input = document.getElementById(`file${layerNum}`);
    const preview = document.getElementById(`preview${layerNum}`);

    card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('layer-control-btn')) {
            input.click();
        }
    });

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    layers[layerNum].image = img;
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                    card.classList.add('has-image');
                    card.querySelector('.upload-placeholder').style.display = 'none';
                    
                    selectLayer(layerNum);
                    updateCanvasOverlay();
                    render();
                    showHint('Фото загружено');
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.style.borderColor = '#0078d4';
    });

    card.addEventListener('dragleave', () => {
        card.style.borderColor = '';
    });

    card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.style.borderColor = '';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change'));
        }
    });
}

function selectLayer(num) {
    if (!layers[num].image) return;
    
    activeLayer = num;
    
    document.querySelectorAll('.upload-card').forEach(card => {
        card.classList.remove('active');
    });
    document.getElementById(`layer${num}Card`).classList.add('active');
    
    document.getElementById('activeLayerNum').textContent = num;
    document.getElementById('activeLayerNum2').textContent = num;
    document.getElementById('activeLayerNum3').textContent = num;
    document.getElementById('activeLayerNum4').textContent = num;
    document.getElementById('bottomLayerNum').textContent = num;
    
    updateControls();
    updateBlendModeDisplay();
}

function removeLayer(num) {
    layers[num].image = null;
    const card = document.getElementById(`layer${num}Card`);
    const preview = document.getElementById(`preview${num}`);
    const input = document.getElementById(`file${num}`);
    
    card.classList.remove('has-image', 'active');
    preview.style.display = 'none';
    card.querySelector('.upload-placeholder').style.display = 'block';
    input.value = '';
    
    layers[num] = { 
        image: null, 
        x: num === 1 ? 200 : 400, 
        y: num === 1 ? 150 : 250, 
        scale: 1, 
        rotation: 0, 
        opacity: 1, 
        blendMode: 'source-over', 
        flipX: false,
        orientation: 'auto',
        brightness: 0,
        contrast: 0,
        saturation: 0,
        temperature: 0,
        hue: 0,
        blur: 0,
        sharpness: 0,
        vignette: 0,
        hdr: 0,
        grain: 0,
        colorMask: null,
        channelMixer: null,
        levels: null
    };
    
    // Сбросить кнопки ориентации для этого слоя
    document.querySelectorAll(`.orientation-btn[data-layer="${num}"]`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.orientation === 'auto');
    });
    const valElement = document.getElementById(`orientation${num}Val`);
    if (valElement) valElement.textContent = ORIENTATION_LABELS['auto'];

    updateCanvasOverlay();
    render();
    showHint('Удалено');
}

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
    const layer = layers[activeLayer];
    
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
    document.querySelectorAll(`.orientation-btn[data-layer="${activeLayer}"]`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.orientation === (layer.orientation || 'auto'));
    });
    const valElement = document.getElementById(`orientation${activeLayer}Val`);
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

    // Обновить номер активного слоя в табе каналов
    const layerNum5El = document.getElementById('activeLayerNum5');
    if (layerNum5El) layerNum5El.textContent = activeLayer;
}

function updateBlendModeButtons() {
    const layer = layers[activeLayer];
    
    document.querySelectorAll('.blend-btn').forEach(btn => {
        if (btn.dataset.blend === layer.blendMode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    updateBlendModeDisplay();
}

function updateBlendModeDisplay() {
    const layer = layers[activeLayer];
    const modeName = blendModeNames[layer.blendMode] || 'Обычный';
    document.getElementById('currentBlendMode').textContent = modeName;
}

function updateValues() {
    const layer = layers[activeLayer];
    
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
    const hasImages = layers[1].image || layers[2].image;
    document.getElementById('canvasOverlay').classList.toggle('hidden', hasImages);
}

function centerLayer() {
    const layer = layers[activeLayer];
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
    const layer = layers[activeLayer];
    if (!layer.image) return;
    
    const img = layer.image;
    layers[activeLayer] = {
        image: img,
        x: activeLayer === 1 ? 200 : 400,
        y: activeLayer === 1 ? 150 : 250,
        scale: 1,
        rotation: 0,
        opacity: 1,
        blendMode: 'source-over',
        flipX: false,
        orientation: 'auto',
        brightness: 0,
        contrast: 0,
        saturation: 0,
        temperature: 0,
        hue: 0,
        blur: 0,
        sharpness: 0,
        vignette: 0,
        hdr: 0,
        grain: 0
    };
    
    updateControls();
    render();
    showHint('Сброшено');
}

function flipH() {
    const layer = layers[activeLayer];
    if (!layer.image) return;
    layer.flipX = !layer.flipX;
    render();
    showHint('Отражено');
}

function swapLayers() {
    [layers[1], layers[2]] = [layers[2], layers[1]];
    
    const prev1 = document.getElementById('preview1');
    const prev2 = document.getElementById('preview2');
    const temp = prev1.src;
    prev1.src = prev2.src;
    prev2.src = temp;
    
    const card1 = document.getElementById('layer1Card');
    const card2 = document.getElementById('layer2Card');
    const hasImg1 = card1.classList.contains('has-image');
    const hasImg2 = card2.classList.contains('has-image');
    
    card1.classList.toggle('has-image', hasImg2);
    card2.classList.toggle('has-image', hasImg1);
    
    if (hasImg2) {
        prev1.style.display = 'block';
        card1.querySelector('.upload-placeholder').style.display = 'none';
    } else {
        prev1.style.display = 'none';
        card1.querySelector('.upload-placeholder').style.display = 'block';
    }
    
    if (hasImg1) {
        prev2.style.display = 'block';
        card2.querySelector('.upload-placeholder').style.display = 'none';
    } else {
        prev2.style.display = 'none';
        card2.querySelector('.upload-placeholder').style.display = 'block';
    }
    
    updateControls();
    render();
    showHint('Поменяны');
}

function fitCanvas() {
    const layer = layers[activeLayer];
    if (!layer.image) return;
    
    const scaleX = canvas.width / layer.image.width;
    const scaleY = canvas.height / layer.image.height;
    layer.scale = Math.min(scaleX, scaleY) * 0.95;
    
    centerLayer();
}

function downloadImage() {
    if (!layers[1].image && !layers[2].image) {
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
        [1, 2].forEach(num => removeLayer(num));
        showHint('Удалено');
    }
}

// Инициализация загрузки слоёв — вызывается из app.js после определения глобальных переменных
function initLayerManager() {
    initUpload(1);
    initUpload(2);
}
