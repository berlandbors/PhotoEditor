/**
 * distortion-effects.js — эффекты искажения изображения
 */

'use strict';

/**
 * Twist (Закручивание от центра)
 * @param {ImageData} imageData
 * @param {number} intensity - интенсивность (0-100)
 * @param {number} radius - радиус эффекта (0-1)
 * @param {Object} center - {x: 0-1, y: 0-1} центр искажения
 * @returns {ImageData}
 */
function applyTwist(imageData, intensity, radius, center) {
    radius = (radius === undefined) ? 0.5 : radius;
    center = center || { x: 0.5, y: 0.5 };

    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const output = new Uint8ClampedArray(data.length);

    const cx = center.x * width;
    const cy = center.y * height;
    const maxRadius = Math.min(width, height) * radius;
    const angle = intensity * Math.PI / 50; // 0-2π

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < maxRadius) {
                const amount = (1 - distance / maxRadius) * angle;
                const cos = Math.cos(amount);
                const sin = Math.sin(amount);

                const srcX = Math.round(cx + (dx * cos - dy * sin));
                const srcY = Math.round(cy + (dx * sin + dy * cos));
                const destIdx = (y * width + x) * 4;

                if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                    const srcIdx = (srcY * width + srcX) * 4;
                    output[destIdx]     = data[srcIdx];
                    output[destIdx + 1] = data[srcIdx + 1];
                    output[destIdx + 2] = data[srcIdx + 2];
                    output[destIdx + 3] = data[srcIdx + 3];
                } else {
                    output[destIdx + 3] = 0;
                }
            } else {
                const idx = (y * width + x) * 4;
                output[idx]     = data[idx];
                output[idx + 1] = data[idx + 1];
                output[idx + 2] = data[idx + 2];
                output[idx + 3] = data[idx + 3];
            }
        }
    }

    imageData.data.set(output);
    return imageData;
}

/**
 * Bulge (Выпуклость / Рыбий глаз)
 * @param {ImageData} imageData
 * @param {number} intensity - сила (0-100), отрицательная = Pinch
 * @param {number} radius - радиус (0-1)
 * @param {Object} center - {x, y}
 * @returns {ImageData}
 */
function applyBulge(imageData, intensity, radius, center) {
    radius = (radius === undefined) ? 0.5 : radius;
    center = center || { x: 0.5, y: 0.5 };

    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const output = new Uint8ClampedArray(data.length);

    const cx = center.x * width;
    const cy = center.y * height;
    const maxRadius = Math.min(width, height) * radius;
    const amount = intensity / 100;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < maxRadius) {
                const factor = Math.pow(distance / maxRadius, 1 + amount);
                const srcX = Math.round(cx + dx * factor);
                const srcY = Math.round(cy + dy * factor);
                const destIdx = (y * width + x) * 4;

                if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                    const srcIdx = (srcY * width + srcX) * 4;
                    output[destIdx]     = data[srcIdx];
                    output[destIdx + 1] = data[srcIdx + 1];
                    output[destIdx + 2] = data[srcIdx + 2];
                    output[destIdx + 3] = data[srcIdx + 3];
                } else {
                    output[destIdx + 3] = 0;
                }
            } else {
                const idx = (y * width + x) * 4;
                output[idx]     = data[idx];
                output[idx + 1] = data[idx + 1];
                output[idx + 2] = data[idx + 2];
                output[idx + 3] = data[idx + 3];
            }
        }
    }

    imageData.data.set(output);
    return imageData;
}

/**
 * Wave (Волна)
 * @param {ImageData} imageData
 * @param {number} amplitude - амплитуда (0-50)
 * @param {number} wavelength - длина волны (10-100)
 * @param {string} direction - 'horizontal' | 'vertical'
 * @returns {ImageData}
 */
function applyWave(imageData, amplitude, wavelength, direction) {
    direction = direction || 'horizontal';

    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const output = new Uint8ClampedArray(data.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let srcX = x;
            let srcY = y;

            if (direction === 'horizontal') {
                srcX = x + Math.sin(y / wavelength * Math.PI * 2) * amplitude;
            } else {
                srcY = y + Math.sin(x / wavelength * Math.PI * 2) * amplitude;
            }

            srcX = Math.round(srcX);
            srcY = Math.round(srcY);
            const destIdx = (y * width + x) * 4;

            if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                const srcIdx = (srcY * width + srcX) * 4;
                output[destIdx]     = data[srcIdx];
                output[destIdx + 1] = data[srcIdx + 1];
                output[destIdx + 2] = data[srcIdx + 2];
                output[destIdx + 3] = data[srcIdx + 3];
            } else {
                output[destIdx + 3] = 0;
            }
        }
    }

    imageData.data.set(output);
    return imageData;
}

/**
 * Funhouse (Комната смеха / Кривое зеркало)
 * Комбинация горизонтальных и вертикальных волн
 * @param {ImageData} imageData
 * @param {number} intensity - сила эффекта (0-100)
 * @returns {ImageData}
 */
function applyFunhouse(imageData, intensity) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const output = new Uint8ClampedArray(data.length);

    const amplitudeX = intensity * 0.3;
    const amplitudeY = intensity * 0.2;
    const wavelengthX = 40;
    const wavelengthY = 30;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offsetX = Math.sin(y / wavelengthY * Math.PI * 2) * amplitudeX;
            const offsetY = Math.sin(x / wavelengthX * Math.PI * 2) * amplitudeY;

            const srcX = Math.round(x + offsetX);
            const srcY = Math.round(y + offsetY);
            const destIdx = (y * width + x) * 4;

            if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                const srcIdx = (srcY * width + srcX) * 4;
                output[destIdx]     = data[srcIdx];
                output[destIdx + 1] = data[srcIdx + 1];
                output[destIdx + 2] = data[srcIdx + 2];
                output[destIdx + 3] = data[srcIdx + 3];
            } else {
                output[destIdx + 3] = 0;
            }
        }
    }

    imageData.data.set(output);
    return imageData;
}

/**
 * Swirl (Водоворот / Радиальное закручивание)
 * @param {ImageData} imageData
 * @param {number} intensity - сила эффекта (0-100)
 * @param {number} radius - радиус (0-1)
 * @param {Object} center - {x, y}
 * @returns {ImageData}
 */
function applySwirl(imageData, intensity, radius, center) {
    radius = (radius === undefined) ? 0.5 : radius;
    center = center || { x: 0.5, y: 0.5 };

    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const output = new Uint8ClampedArray(data.length);

    const cx = center.x * width;
    const cy = center.y * height;
    const maxRadius = Math.min(width, height) * radius;
    const twist = intensity * Math.PI / 25;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < maxRadius) {
                const amount = (distance / maxRadius) * twist;
                const cos = Math.cos(amount);
                const sin = Math.sin(amount);

                const srcX = Math.round(cx + (dx * cos - dy * sin));
                const srcY = Math.round(cy + (dx * sin + dy * cos));
                const destIdx = (y * width + x) * 4;

                if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                    const srcIdx = (srcY * width + srcX) * 4;
                    output[destIdx]     = data[srcIdx];
                    output[destIdx + 1] = data[srcIdx + 1];
                    output[destIdx + 2] = data[srcIdx + 2];
                    output[destIdx + 3] = data[srcIdx + 3];
                } else {
                    output[destIdx + 3] = 0;
                }
            } else {
                const idx = (y * width + x) * 4;
                output[idx]     = data[idx];
                output[idx + 1] = data[idx + 1];
                output[idx + 2] = data[idx + 2];
                output[idx + 3] = data[idx + 3];
            }
        }
    }

    imageData.data.set(output);
    return imageData;
}
