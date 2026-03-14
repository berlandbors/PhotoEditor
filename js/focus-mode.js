// js/focus-mode.js — Focus Mode for distraction-free canvas editing

let isFocusMode = false;
let focusAutoHideTimer = null;
let focusPanelAutoHideTimer = null;
let focusSettingsOpen = false;

// ─── Toggle ──────────────────────────────────────────────────────────────────

function toggleFocusMode() {
    isFocusMode = !isFocusMode;
    if (isFocusMode) {
        enterFocusMode();
    } else {
        exitFocusMode();
    }
}

function enterFocusMode() {
    // Hide main sidebar
    document.getElementById('sidebar').classList.add('hidden-for-focus');
    document.querySelector('.toggle-sidebar').classList.add('hidden-for-focus');

    // Show floating UI
    renderFloatingLayerPanel();
    document.querySelector('.floating-layers-panel').classList.add('visible');
    document.querySelector('.focus-mode-toolbar').classList.add('visible');

    // Expand canvas
    document.querySelector('.main-container').classList.add('focus-mode-active');

    // Highlight toolbar button
    const toggleBtn = document.getElementById('focusModeBtn');
    if (toggleBtn) toggleBtn.classList.add('active');

    centerCanvas();
    showHint('🎯 Focus Mode включён. Нажмите F для выхода');

    // Mobile auto-hide
    if (_isMobileDevice()) {
        _startFocusAutoHide();
        _startPanelAutoHide();
    }
}

function exitFocusMode() {
    // Close settings modal if open
    closeSettingsModal();

    // Restore sidebar
    document.getElementById('sidebar').classList.remove('hidden-for-focus');
    document.querySelector('.toggle-sidebar').classList.remove('hidden-for-focus');

    // Hide floating UI
    document.querySelector('.floating-layers-panel').classList.remove('visible');
    document.querySelector('.focus-mode-toolbar').classList.remove('visible');

    // Restore normal layout
    document.querySelector('.main-container').classList.remove('focus-mode-active');

    // Remove button highlight
    const toggleBtn = document.getElementById('focusModeBtn');
    if (toggleBtn) toggleBtn.classList.remove('active');

    _clearAutoHideTimers();
    showHint('Focus Mode выключен');
}

// ─── Floating Layer Panel ─────────────────────────────────────────────────────

function renderFloatingLayerPanel() {
    const panel = document.querySelector('.floating-layers-panel');
    if (!panel) return;
    panel.innerHTML = '';

    if (typeof layers === 'undefined' || layers.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#888;font-size:0.7em;text-align:center;padding:8px 4px;';
        empty.textContent = 'Нет слоёв';
        panel.appendChild(empty);
        return;
    }

    layers.forEach(function(layer, index) {
        if (!layer.image) return;

        const card = document.createElement('div');
        card.className = 'floating-layer-card';
        if (index === activeLayerIndex) {
            card.classList.add('active');
        }
        if (!layer.visible) {
            card.classList.add('layer-hidden');
        }

        // Thumbnail
        const img = document.createElement('img');
        img.src = layer.image.src;
        img.alt = layer.name || ('Слой ' + (index + 1));
        card.appendChild(img);

        // Quick actions overlay
        const actions = document.createElement('div');
        actions.className = 'layer-quick-actions';

        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'layer-eye-btn';
        eyeBtn.title = layer.visible ? 'Скрыть слой' : 'Показать слой';
        eyeBtn.textContent = layer.visible ? '👁️' : '🚫';
        eyeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            layer.visible = !layer.visible;
            eyeBtn.textContent = layer.visible ? '👁️' : '🚫';
            card.classList.toggle('layer-hidden', !layer.visible);
            if (typeof render === 'function') render();
            showHint(layer.visible ? 'Слой показан' : 'Слой скрыт');
        });
        actions.appendChild(eyeBtn);
        card.appendChild(actions);

        // Click to activate layer
        card.addEventListener('click', function() {
            if (typeof selectLayerByIndex === 'function') {
                selectLayerByIndex(index);
            }
            renderFloatingLayerPanel();
            if (typeof render === 'function') render();
        });

        // Drag and drop to reorder
        card.setAttribute('draggable', 'true');
        card.dataset.layerIndex = index;
        card.addEventListener('dragstart', _onLayerDragStart);
        card.addEventListener('dragover', _onLayerDragOver);
        card.addEventListener('drop', _onLayerDrop);

        panel.appendChild(card);
    });
}

// ─── Drag-and-drop reorder ────────────────────────────────────────────────────

let _dragSourceIndex = null;

function _onLayerDragStart(e) {
    _dragSourceIndex = parseInt(e.currentTarget.dataset.layerIndex);
    e.dataTransfer.effectAllowed = 'move';
}

function _onLayerDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function _onLayerDrop(e) {
    e.preventDefault();
    const targetIndex = parseInt(e.currentTarget.dataset.layerIndex);
    if (_dragSourceIndex === null || _dragSourceIndex === targetIndex) return;

    // Swap layers in array
    const moved = layers.splice(_dragSourceIndex, 1)[0];
    layers.splice(targetIndex, 0, moved);

    // Adjust activeLayerIndex
    if (activeLayerIndex === _dragSourceIndex) {
        activeLayerIndex = targetIndex;
    } else if (_dragSourceIndex < targetIndex) {
        if (activeLayerIndex > _dragSourceIndex && activeLayerIndex <= targetIndex) activeLayerIndex--;
    } else {
        if (activeLayerIndex >= targetIndex && activeLayerIndex < _dragSourceIndex) activeLayerIndex++;
    }

    _dragSourceIndex = null;
    renderFloatingLayerPanel();
    if (typeof render === 'function') render();
    if (typeof updateLayersList === 'function') updateLayersList();
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

function openSettingsModal() {
    if (typeof activeLayerIndex === 'undefined' || activeLayerIndex < 0) {
        showHint('Выберите слой для настройки');
        return;
    }
    const layer = layers[activeLayerIndex];
    if (!layer) {
        showHint('Слой не найден');
        return;
    }

    focusSettingsOpen = true;

    // Populate sliders with current layer values
    document.getElementById('focusOpacity').value = Math.round(layer.opacity * 100);
    document.getElementById('focusOpacityVal').textContent = Math.round(layer.opacity * 100) + '%';

    document.getElementById('focusScale').value = Math.round(layer.scale * 100);
    document.getElementById('focusScaleVal').textContent = Math.round(layer.scale * 100) + '%';

    document.getElementById('focusRotation').value = Math.round(layer.rotation);
    document.getElementById('focusRotationVal').textContent = Math.round(layer.rotation) + '°';

    document.getElementById('focusBrightness').value = layer.brightness;
    document.getElementById('focusBrightnessVal').textContent = layer.brightness;

    document.getElementById('focusContrast').value = layer.contrast;
    document.getElementById('focusContrastVal').textContent = layer.contrast;

    document.getElementById('focusSaturation').value = layer.saturation;
    document.getElementById('focusSaturationVal').textContent = layer.saturation;

    document.querySelector('.focus-settings-modal').classList.add('visible');
}

function closeSettingsModal() {
    focusSettingsOpen = false;
    const modal = document.querySelector('.focus-settings-modal');
    if (modal) modal.classList.remove('visible');
}

function _onSettingsSliderInput(e) {
    if (typeof activeLayerIndex === 'undefined' || activeLayerIndex < 0) return;
    const layer = layers[activeLayerIndex];
    if (!layer) return;

    const id = e.target.id;
    const val = parseFloat(e.target.value);

    if (id === 'focusOpacity') {
        layer.opacity = val / 100;
        document.getElementById('focusOpacityVal').textContent = val + '%';
        // Sync main UI slider
        const mainEl = document.getElementById('opacity');
        if (mainEl) mainEl.value = val;
    } else if (id === 'focusScale') {
        layer.scale = val / 100;
        document.getElementById('focusScaleVal').textContent = val + '%';
        const mainEl = document.getElementById('scale');
        if (mainEl) mainEl.value = val;
    } else if (id === 'focusRotation') {
        layer.rotation = val;
        document.getElementById('focusRotationVal').textContent = val + '°';
        const mainEl = document.getElementById('rotate');
        if (mainEl) mainEl.value = val;
    } else if (id === 'focusBrightness') {
        layer.brightness = val;
        document.getElementById('focusBrightnessVal').textContent = val;
        const mainEl = document.getElementById('brightness');
        if (mainEl) mainEl.value = val;
    } else if (id === 'focusContrast') {
        layer.contrast = val;
        document.getElementById('focusContrastVal').textContent = val;
        const mainEl = document.getElementById('contrast');
        if (mainEl) mainEl.value = val;
    } else if (id === 'focusSaturation') {
        layer.saturation = val;
        document.getElementById('focusSaturationVal').textContent = val;
        const mainEl = document.getElementById('saturation');
        if (mainEl) mainEl.value = val;
    }

    if (typeof updateValues === 'function') updateValues();
    if (typeof render === 'function') render();
}

// ─── Hotkeys ──────────────────────────────────────────────────────────────────

document.addEventListener('keydown', function(e) {
    // Skip when typing in an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFocusMode();
        return;
    }

    if (e.key === 'Escape') {
        if (focusSettingsOpen) {
            e.preventDefault();
            closeSettingsModal();
        }
    }
});

// ─── Mobile auto-hide ─────────────────────────────────────────────────────────

function _isMobileDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

function _startFocusAutoHide() {
    clearTimeout(focusAutoHideTimer);
    focusAutoHideTimer = setTimeout(function() {
        const toolbar = document.querySelector('.focus-mode-toolbar');
        if (toolbar) toolbar.classList.add('auto-hidden');
    }, 3000);
}

function _startPanelAutoHide() {
    clearTimeout(focusPanelAutoHideTimer);
    focusPanelAutoHideTimer = setTimeout(function() {
        const panel = document.querySelector('.floating-layers-panel');
        if (panel) panel.classList.add('auto-hidden');
    }, 3000);
}

function _clearAutoHideTimers() {
    clearTimeout(focusAutoHideTimer);
    clearTimeout(focusPanelAutoHideTimer);
}

function _resetFocusAutoHide() {
    if (!isFocusMode || !_isMobileDevice()) return;
    // Show both panels again
    const toolbar = document.querySelector('.focus-mode-toolbar');
    const panel = document.querySelector('.floating-layers-panel');
    if (toolbar) toolbar.classList.remove('auto-hidden');
    if (panel) panel.classList.remove('auto-hidden');
    _startFocusAutoHide();
    _startPanelAutoHide();
}

// Touch on canvas resets auto-hide timer
document.addEventListener('touchstart', function() {
    if (isFocusMode) _resetFocusAutoHide();
}, { passive: true });

// Tap left edge of screen to show floating panel
document.addEventListener('touchend', function(e) {
    if (!isFocusMode) return;
    const touch = e.changedTouches[0];
    if (touch && touch.clientX < 30) {
        const panel = document.querySelector('.floating-layers-panel');
        if (panel) panel.classList.remove('auto-hidden');
        _startPanelAutoHide();
    }
    if (touch && touch.clientY > window.innerHeight - 30) {
        const toolbar = document.querySelector('.focus-mode-toolbar');
        if (toolbar) toolbar.classList.remove('auto-hidden');
        _startFocusAutoHide();
    }
}, { passive: true });

// Swipe gestures
(function() {
    let swipeStartX = 0;
    let swipeStartY = 0;

    document.addEventListener('touchstart', function(e) {
        if (!isFocusMode) return;
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        if (!isFocusMode) return;
        const dx = e.changedTouches[0].clientX - swipeStartX;
        const dy = e.changedTouches[0].clientY - swipeStartY;

        // Swipe right from left edge → show panel
        if (swipeStartX < 30 && dx > 40 && Math.abs(dy) < 60) {
            const panel = document.querySelector('.floating-layers-panel');
            if (panel) panel.classList.remove('auto-hidden');
            _startPanelAutoHide();
        }

        // Swipe left on panel → hide panel
        if (swipeStartX < 110 && dx < -40 && Math.abs(dy) < 60) {
            const panel = document.querySelector('.floating-layers-panel');
            if (panel) panel.classList.add('auto-hidden');
        }
    }, { passive: true });
})();

// ─── Wire up settings sliders on DOM ready ────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
    ['focusOpacity', 'focusScale', 'focusRotation', 'focusBrightness', 'focusContrast', 'focusSaturation'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', _onSettingsSliderInput);
    });

    // Close modal on backdrop click
    const modal = document.querySelector('.focus-settings-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeSettingsModal();
        });
    }
});
