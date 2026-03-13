// Filter presets - applying pre-defined filter and effect combinations to the active layer

// ===== ПРЕСЕТЫ ФИЛЬТРОВ =====
function applyPreset(preset) {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];
    
    switch(preset) {
        case 'none':
            layer.brightness = 0;
            layer.contrast = 0;
            layer.saturation = 0;
            layer.temperature = 0;
            layer.hue = 0;
            break;
        case 'bw':
            layer.saturation = -100;
            layer.contrast = 20;
            break;
        case 'sepia':
            layer.saturation = -50;
            layer.temperature = 40;
            layer.contrast = 10;
            break;
        case 'warm':
            layer.temperature = 30;
            layer.brightness = 10;
            break;
        case 'cold':
            layer.temperature = -30;
            layer.contrast = 10;
            break;
        case 'vintage':
            layer.saturation = -30;
            layer.temperature = 20;
            layer.contrast = -10;
            layer.brightness = -5;
            break;
    }
    
    updateControls();
    render();
    showHint(`Пресет: ${preset}`);
}

// ===== ПРЕСЕТЫ ЭФФЕКТОВ =====
function applyEffect(effect) {
    if (activeLayerIndex < 0 || !layers[activeLayerIndex]) return;
    const layer = layers[activeLayerIndex];
    
    switch(effect) {
        case 'none':
            layer.blur = 0;
            layer.sharpness = 0;
            layer.vignette = 0;
            layer.hdr = 0;
            layer.grain = 0;
            break;
        case 'soft':
            layer.blur = 1;
            layer.vignette = 20;
            layer.brightness = 5;
            break;
        case 'dramatic':
            layer.contrast = 40;
            layer.saturation = 20;
            layer.vignette = 50;
            layer.hdr = 60;
            break;
        case 'dreamy':
            layer.blur = 2;
            layer.brightness = 15;
            layer.saturation = -20;
            layer.vignette = 30;
            break;
        case 'gritty':
            layer.grain = 40;
            layer.contrast = 30;
            layer.saturation = -20;
            layer.sharpness = 30;
            break;
        case 'cinema':
            layer.vignette = 40;
            layer.contrast = 20;
            layer.saturation = 10;
            layer.hdr = 30;
            break;
    }
    
    updateControls();
    render();
    showHint(`Эффект: ${effect}`);
}
