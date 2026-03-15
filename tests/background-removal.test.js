'use strict';

/**
 * Unit tests for background-removal.js
 *
 * Run with: npm test
 */

const {
    rgbToHSL,
    rgbToYUV,
    clearHSLCache,
    removeBackgroundByColor,
    removeColorChannel,
    removeLuminanceRange,
    kMeansClustering,
    applyGaussianBlurToAlpha,
    autoRemoveBackground,
    removeBackgroundSmart,
    CONFIG,
    LRUCache,
    BackgroundRemovalError
} = require('../js/background-removal');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a solid-color ImageData-like object (compatible with Node.js).
 */
function createImageData(width, height, color) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i]     = color.r;
        data[i + 1] = color.g;
        data[i + 2] = color.b;
        data[i + 3] = color.a !== undefined ? color.a : 255;
    }
    return { data, width, height };
}

// ---------------------------------------------------------------------------
// LRUCache
// ---------------------------------------------------------------------------

describe('LRUCache', () => {
    test('stores and retrieves a value', () => {
        const cache = new LRUCache(10);
        cache.set('a', 42);
        expect(cache.get('a')).toBe(42);
    });

    test('returns undefined for missing keys', () => {
        const cache = new LRUCache(10);
        expect(cache.get('missing')).toBeUndefined();
    });

    test('has() reflects presence', () => {
        const cache = new LRUCache(5);
        cache.set(1, 'one');
        expect(cache.has(1)).toBe(true);
        expect(cache.has(2)).toBe(false);
    });

    test('evicts the least recently used entry when full', () => {
        const cache = new LRUCache(3);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        // Access 'a' to make it recently used
        cache.get('a');
        // Now add 'd' — 'b' should be evicted (LRU)
        cache.set('d', 4);
        expect(cache.has('b')).toBe(false);
        expect(cache.has('a')).toBe(true);
        expect(cache.has('c')).toBe(true);
        expect(cache.has('d')).toBe(true);
    });

    test('respects maxSize (size never exceeds it)', () => {
        const cache = new LRUCache(5);
        for (let i = 0; i < 20; i++) cache.set(i, i * 2);
        expect(cache.size).toBeLessThanOrEqual(5);
    });

    test('clear() empties the cache', () => {
        const cache = new LRUCache(10);
        cache.set('x', 99);
        cache.clear();
        expect(cache.size).toBe(0);
        expect(cache.get('x')).toBeUndefined();
    });

    test('updating an existing key keeps size stable', () => {
        const cache = new LRUCache(3);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('a', 10); // update, not insert
        expect(cache.size).toBe(2);
        expect(cache.get('a')).toBe(10);
    });
});

// ---------------------------------------------------------------------------
// BackgroundRemovalError
// ---------------------------------------------------------------------------

describe('BackgroundRemovalError', () => {
    test('has correct name property', () => {
        const err = new BackgroundRemovalError('test message');
        expect(err.name).toBe('BackgroundRemovalError');
    });

    test('inherits from Error', () => {
        const err = new BackgroundRemovalError('oops');
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('oops');
    });
});

// ---------------------------------------------------------------------------
// Color Conversion
// ---------------------------------------------------------------------------

describe('rgbToHSL', () => {
    test('converts pure red correctly', () => {
        const [h, s, l] = rgbToHSL(255, 0, 0);
        expect(h).toBeCloseTo(0, 1);
        expect(s).toBeCloseTo(100, 1);
        expect(l).toBeCloseTo(50, 1);
    });

    test('converts pure green correctly', () => {
        const [h, s, l] = rgbToHSL(0, 255, 0);
        expect(h).toBeCloseTo(120, 1);
        expect(s).toBeCloseTo(100, 1);
        expect(l).toBeCloseTo(50, 1);
    });

    test('converts pure blue correctly', () => {
        const [h, s, l] = rgbToHSL(0, 0, 255);
        expect(h).toBeCloseTo(240, 1);
        expect(s).toBeCloseTo(100, 1);
        expect(l).toBeCloseTo(50, 1);
    });

    test('converts white to zero saturation, full lightness', () => {
        const [h, s, l] = rgbToHSL(255, 255, 255);
        expect(s).toBeCloseTo(0, 1);
        expect(l).toBeCloseTo(100, 1);
    });

    test('converts black to zero saturation, zero lightness', () => {
        const [h, s, l] = rgbToHSL(0, 0, 0);
        expect(s).toBeCloseTo(0, 1);
        expect(l).toBeCloseTo(0, 1);
    });
});

describe('rgbToYUV', () => {
    test('converts pure red correctly (BT.601)', () => {
        const [y, u, v] = rgbToYUV(255, 0, 0);
        // Y = 0.299*255 ≈ 76.245, U = (0 - 76.245)*0.565 ≈ -43.08, V = (255 - 76.245)*0.713 ≈ 127.44
        expect(y).toBeCloseTo(76.245, 1);
        expect(v).toBeCloseTo(127.44, 0);
    });

    test('converts grey to zero chroma', () => {
        const [, u, v] = rgbToYUV(128, 128, 128);
        expect(Math.abs(u)).toBeLessThan(1);
        expect(Math.abs(v)).toBeLessThan(1);
    });
});

// ---------------------------------------------------------------------------
// HSL Cache
// ---------------------------------------------------------------------------

describe('HSL Cache (LRU)', () => {
    beforeEach(() => clearHSLCache());

    test('returns same values on repeated calls', () => {
        const result1 = rgbToHSL(128, 64, 192);
        const result2 = rgbToHSL(128, 64, 192);
        expect(result1).toEqual(result2);
    });

    test('clearHSLCache() resets cache without affecting correctness', () => {
        const before = rgbToHSL(200, 100, 50);
        clearHSLCache();
        const after = rgbToHSL(200, 100, 50);
        expect(before).toEqual(after);
    });
});

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

describe('CONFIG constants', () => {
    test('MAX_RGB_DISTANCE equals sqrt(3 * 255^2)', () => {
        expect(CONFIG.MAX_RGB_DISTANCE).toBeCloseTo(Math.sqrt(3 * 255 * 255), 5);
    });

    test('RGB_TO_TOLERANCE_FACTOR equals MAX_RGB_DISTANCE / 100', () => {
        expect(CONFIG.RGB_TO_TOLERANCE_FACTOR).toBeCloseTo(CONFIG.MAX_RGB_DISTANCE / 100, 5);
    });

    test('LUMA weights sum to 1.0', () => {
        expect(CONFIG.LUMA_R + CONFIG.LUMA_G + CONFIG.LUMA_B).toBeCloseTo(1.0, 5);
    });

    test('SOBEL_X and SOBEL_Y have 9 coefficients each', () => {
        expect(CONFIG.SOBEL_X.length).toBe(9);
        expect(CONFIG.SOBEL_Y.length).toBe(9);
    });
});

// ---------------------------------------------------------------------------
// removeBackgroundByColor
// ---------------------------------------------------------------------------

describe('removeBackgroundByColor', () => {
    test('throws on null imageData', () => {
        expect(() => removeBackgroundByColor(null)).toThrow();
    });

    test('removes solid green background completely', () => {
        const img = createImageData(5, 5, { r: 0, g: 255, b: 0 });
        removeBackgroundByColor(img, { targetColor: { r: 0, g: 255, b: 0 }, tolerance: 50 });
        for (let i = 3; i < img.data.length; i += 4) {
            expect(img.data[i]).toBe(0);
        }
    });

    test('does not touch pixels far from target color', () => {
        const img = createImageData(4, 4, { r: 255, g: 0, b: 0 }); // red
        removeBackgroundByColor(img, { targetColor: { r: 0, g: 255, b: 0 }, tolerance: 30 });
        for (let i = 3; i < img.data.length; i += 4) {
            expect(img.data[i]).toBe(255); // alpha unchanged
        }
    });

    test('respects strength parameter', () => {
        const img = createImageData(2, 2, { r: 0, g: 255, b: 0 });
        removeBackgroundByColor(img, {
            targetColor: { r: 0, g: 255, b: 0 },
            tolerance: 50,
            strength: 0.5
        });
        // Alpha should be 50% of original (255 * 0.5 = 127.5 ≈ 128)
        for (let i = 3; i < img.data.length; i += 4) {
            expect(img.data[i]).toBeCloseTo(128, 0);
        }
    });

    test('returns the same imageData object', () => {
        const img = createImageData(3, 3, { r: 0, g: 0, b: 0 });
        const result = removeBackgroundByColor(img, {});
        expect(result).toBe(img);
    });
});

// ---------------------------------------------------------------------------
// removeColorChannel
// ---------------------------------------------------------------------------

describe('removeColorChannel', () => {
    test('throws on null imageData', () => {
        expect(() => removeColorChannel(null, 'red', 'transparent')).toThrow();
    });

    test('returns imageData unchanged for unknown channel', () => {
        const img = createImageData(2, 2, { r: 255, g: 0, b: 0 });
        const before = Array.from(img.data);
        removeColorChannel(img, 'purple', 'transparent');
        expect(Array.from(img.data)).toEqual(before);
    });

    test('transparent mode lowers alpha for matching hue', () => {
        // Pure red pixel: H≈0°, S=100%, L=50%
        const img = createImageData(1, 1, { r: 255, g: 0, b: 0 });
        removeColorChannel(img, 'red', 'transparent', { tolerance: 30, strength: 1 });
        expect(img.data[3]).toBeLessThan(255);
    });

    test('targetColor mode uses squared-distance comparison', () => {
        const img = createImageData(2, 2, { r: 0, g: 200, b: 0 });
        removeColorChannel(img, 'green', 'transparent', {
            targetColor: { r: 0, g: 200, b: 0 },
            tolerance: 10,
            strength: 1
        });
        for (let i = 3; i < img.data.length; i += 4) {
            expect(img.data[i]).toBeLessThan(255);
        }
    });
});

// ---------------------------------------------------------------------------
// removeLuminanceRange
// ---------------------------------------------------------------------------

describe('removeLuminanceRange', () => {
    test('removes shadows (very dark pixels)', () => {
        const img = createImageData(3, 3, { r: 10, g: 10, b: 10 });
        removeLuminanceRange(img, 'shadows', 50, 0, 1);
        for (let i = 3; i < img.data.length; i += 4) {
            expect(img.data[i]).toBe(0);
        }
    });

    test('removes highlights (very bright pixels)', () => {
        const img = createImageData(3, 3, { r: 245, g: 245, b: 245 });
        removeLuminanceRange(img, 'highlights', 50, 0, 1);
        for (let i = 3; i < img.data.length; i += 4) {
            expect(img.data[i]).toBe(0);
        }
    });

    test('does not affect mid-tones for shadows removal', () => {
        const img = createImageData(2, 2, { r: 128, g: 128, b: 128 });
        removeLuminanceRange(img, 'shadows', 50, 0, 1);
        for (let i = 3; i < img.data.length; i += 4) {
            expect(img.data[i]).toBe(255);
        }
    });

    test('throws on invalid imageData', () => {
        expect(() => removeLuminanceRange(null, 'shadows', 50, 0, 1)).toThrow();
    });
});

// ---------------------------------------------------------------------------
// kMeansClustering (k-means++)
// ---------------------------------------------------------------------------

describe('kMeansClustering', () => {
    test('returns empty array for empty input', () => {
        expect(kMeansClustering([], 3, 10)).toEqual([]);
    });

    test('returns correct number of clusters', () => {
        const colors = [
            [255, 0, 0], [250, 5, 0], [245, 0, 5],   // red cluster
            [0, 255, 0], [5, 250, 0], [0, 245, 5],   // green cluster
        ];
        const clusters = kMeansClustering(colors, 2, 20);
        expect(clusters.length).toBe(2);
    });

    test('clusters account for all input colors', () => {
        const colors = Array.from({ length: 30 }, (_, i) => [i * 8, 0, 0]);
        const clusters = kMeansClustering(colors, 3, 15);
        const total = clusters.reduce((s, c) => s + c.size, 0);
        expect(total).toBe(colors.length);
    });

    test('clamps k to colors.length when k > colors.length', () => {
        const colors = [[10, 10, 10], [20, 20, 20]];
        const clusters = kMeansClustering(colors, 5, 10);
        expect(clusters.length).toBeLessThanOrEqual(2);
    });

    test('converges to stable centroids', () => {
        // Two well-separated clusters
        const redColors  = Array.from({ length: 20 }, () => [255, 0, 0]);
        const blueColors = Array.from({ length: 20 }, () => [0, 0, 255]);
        const clusters = kMeansClustering([...redColors, ...blueColors], 2, 20);
        // Each cluster should have ~20 members
        const sizes = clusters.map(c => c.size).sort((a, b) => a - b);
        expect(sizes[0]).toBeGreaterThanOrEqual(15);
        expect(sizes[1]).toBeGreaterThanOrEqual(15);
    });
});

// ---------------------------------------------------------------------------
// applyGaussianBlurToAlpha
// ---------------------------------------------------------------------------

describe('applyGaussianBlurToAlpha', () => {
    test('throws on invalid imageData', () => {
        expect(() => applyGaussianBlurToAlpha(null, 2)).toThrow();
    });

    test('returns the same imageData object', () => {
        const img = createImageData(10, 10, { r: 255, g: 0, b: 0, a: 128 });
        const result = applyGaussianBlurToAlpha(img, 2);
        expect(result).toBe(img);
    });

    test('does not alter RGB channels', () => {
        const img = createImageData(5, 5, { r: 200, g: 100, b: 50, a: 255 });
        applyGaussianBlurToAlpha(img, 1);
        for (let i = 0; i < img.data.length; i += 4) {
            expect(img.data[i]).toBe(200);
            expect(img.data[i + 1]).toBe(100);
            expect(img.data[i + 2]).toBe(50);
        }
    });
});

// ---------------------------------------------------------------------------
// removeBackgroundSmart
// ---------------------------------------------------------------------------

describe('removeBackgroundSmart', () => {
    test('throws on null imageData', () => {
        expect(() => removeBackgroundSmart(null)).toThrow();
    });

    test('returns the same imageData object', () => {
        const img = createImageData(10, 10, { r: 0, g: 200, b: 0 });
        const result = removeBackgroundSmart(img, {
            targetColor: { r: 0, g: 200, b: 0 },
            tolerance: 30
        });
        expect(result).toBe(img);
    });

    test('calls onProgress with 1.0 at the end', () => {
        const img = createImageData(8, 8, { r: 0, g: 255, b: 0 });
        let lastProgress = -1;
        removeBackgroundSmart(img, { targetColor: { r: 0, g: 255, b: 0 }, tolerance: 30 }, (p) => {
            lastProgress = p;
        });
        expect(lastProgress).toBe(1.0);
    });
});
