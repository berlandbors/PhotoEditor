/**
 * background-removal.d.ts — TypeScript definitions for background-removal.js
 *
 * @version 3.0.0
 * @author PhotoEditor Team
 * @license MIT
 */

export interface RGB {
    r: number; // 0-255
    g: number; // 0-255
    b: number; // 0-255
}

export interface RemovalOptions {
    /** Target color to remove. Defaults to pure green {r:0, g:255, b:0}. */
    targetColor?: RGB;
    /** Color distance tolerance. For RGB mode: 0-441; for YUV mode: 0-180. Default: 30. */
    tolerance?: number;
    /** Edge softness in pixels (0-100). Default: 0. */
    feather?: number;
    /** Effect strength (0.0-1.0). Default: 1.0. */
    strength?: number;
    /** Use YUV color space for chroma keying (more accurate for green/blue screens). */
    useYUV?: boolean;
}

export interface SmartRemovalOptions extends RemovalOptions {
    /** Edge protection strength (0-100). Higher = more edges preserved. Default: 50. */
    edgeProtection?: number;
    /** Foreground bias toward image center (0-100). Default: 50. */
    foregroundBias?: number;
}

export interface ColorChannelOptions {
    /** Hue tolerance in degrees (0-360). Default: 20. */
    tolerance?: number;
    /** Replacement color for 'replace' mode. */
    replacementColor?: RGB;
    /** Effect strength (0.0-1.0). Default: 1.0. */
    strength?: number;
    /** Exact target color for precise RGB-distance matching (bypasses HSL hue range). */
    targetColor?: RGB;
}

/** Supported named color channels for removeColorChannel(). */
export type ColorChannel =
    | 'red'
    | 'green'
    | 'blue'
    | 'yellow'
    | 'orange'
    | 'cyan'
    | 'magenta'
    | 'pink';

/** Processing mode for removeColorChannel(). */
export type ColorMode = 'transparent' | 'replace' | 'desaturate';

/** Luminance type for removeLuminanceRange(). */
export type LuminanceType = 'shadows' | 'highlights';

/** Progress callback receiving a value from 0.0 to 1.0. */
export type ProgressCallback = (progress: number) => void;

/**
 * Remove background by chroma key (color matching).
 * Supports both RGB and YUV (options.useYUV) color spaces.
 *
 * @param imageData - Source image data, modified in-place.
 * @param options - Removal parameters.
 * @param onProgress - Optional progress callback (0.0-1.0).
 * @returns The modified imageData.
 */
export function removeBackgroundByColor(
    imageData: ImageData,
    options?: RemovalOptions,
    onProgress?: ProgressCallback
): ImageData;

/**
 * Remove background using multi-pass smart algorithm:
 * Sobel edge detection → foreground estimation → trimap → alpha matting.
 *
 * @param imageData - Source image data, modified in-place.
 * @param options - Smart removal parameters.
 * @param onProgress - Optional progress callback (0.0-1.0).
 * @returns The modified imageData.
 */
export function removeBackgroundSmart(
    imageData: ImageData,
    options?: SmartRemovalOptions,
    onProgress?: ProgressCallback
): ImageData;

/**
 * Remove or modify pixels belonging to a specific color channel (hue range).
 *
 * @param imageData - Source image data, modified in-place.
 * @param channel - Named color channel to process.
 * @param mode - How to process matched pixels.
 * @param options - Channel removal parameters.
 * @returns The modified imageData.
 */
export function removeColorChannel(
    imageData: ImageData,
    channel: ColorChannel,
    mode: ColorMode,
    options?: ColorChannelOptions
): ImageData;

/**
 * Automatically detect and remove background using k-means++ color clustering
 * on edge pixels followed by chroma key removal.
 *
 * @param imageData - Source image data, modified in-place.
 * @param options - Removal parameters.
 * @returns The modified imageData.
 */
export function autoRemoveBackground(
    imageData: ImageData,
    options?: RemovalOptions
): ImageData;

/**
 * Remove shadows or highlights based on pixel luminance.
 *
 * @param imageData - Source image data, modified in-place.
 * @param type - 'shadows' removes dark areas; 'highlights' removes bright areas.
 * @param threshold - Luminance threshold (0-255).
 * @param feather - Edge softness (0-100).
 * @param strength - Effect strength (0.0-1.0).
 * @returns The modified imageData.
 */
export function removeLuminanceRange(
    imageData: ImageData,
    type: LuminanceType,
    threshold: number,
    feather: number,
    strength: number
): ImageData;

/**
 * Apply a binary mask to the image alpha channel.
 *
 * @param imageData - Source image data, modified in-place.
 * @param mask - Per-pixel mask (255 = keep, 0 = remove). Length must equal width×height.
 * @param feather - Edge softness (0-50). Default: 5.
 * @returns The modified imageData.
 */
export function removeBackgroundByMask(
    imageData: ImageData,
    mask: Uint8ClampedArray,
    feather?: number
): ImageData;

/**
 * Remove background using Sobel edge detection to generate a mask.
 *
 * @param imageData - Source image data, modified in-place.
 * @param options - Edge-based removal options.
 * @returns The modified imageData.
 */
export function autoRemoveBackgroundByEdges(
    imageData: ImageData,
    options?: { edgeThreshold?: number; invertMask?: boolean; feather?: number }
): ImageData;

/**
 * Clear the RGB→HSL LRU cache.
 * Call when switching between unrelated images to free memory.
 */
export function clearHSLCache(): void;

/**
 * Convert RGB to HSL with LRU caching.
 *
 * @returns [hue (0-360), saturation (0-100), lightness (0-100)]
 */
export function rgbToHSL(r: number, g: number, b: number): [number, number, number];

/**
 * Convert RGB to YUV (BT.601).
 *
 * @returns [Y (0-255), U (-127..127), V (-127..127)]
 */
export function rgbToYUV(r: number, g: number, b: number): [number, number, number];

/**
 * k-means++ clustering for an array of RGB colors.
 *
 * @param colors - Array of [r, g, b] tuples.
 * @param k - Number of clusters.
 * @param maxIterations - Maximum iteration count.
 * @returns Array of clusters with centroid and size.
 */
export function kMeansClustering(
    colors: Array<[number, number, number]>,
    k: number,
    maxIterations: number
): Array<{ centroid: [number, number, number]; size: number }>;

/** Module configuration constants. */
export const CONFIG: {
    /** Color quantization factor for grouping. */
    COLOR_GROUPING_FACTOR: number;
    /** Minimum feather value that triggers Gaussian blur. */
    MIN_FEATHER_FOR_BLUR: number;
    /** Divisor mapping feather → blur radius. */
    FEATHER_TO_BLUR_RATIO: number;
    /** Sobel magnitude threshold for edge detection. */
    EDGE_DETECTION_THRESHOLD: number;
    /** Minimum HSL saturation to apply color channel removal. */
    MIN_SATURATION_FOR_COLOR_REMOVAL: number;
    /** Default tolerance for chroma key removal (0-441). */
    DEFAULT_CHROMA_TOLERANCE: number;
    /** Default tolerance for auto background removal. */
    DEFAULT_AUTO_TOLERANCE: number;
    /** Default feather radius in pixels. */
    DEFAULT_FEATHER: number;
    /** Maximum entries in the LRU HSL cache. */
    HSL_CACHE_LIMIT: number;
    /** Maximum iterations for k-means clustering. */
    KMEANS_MAX_ITERATIONS: number;
    /** Centroid movement threshold below which k-means is considered converged. */
    KMEANS_CONVERGENCE_THRESHOLD: number;
    /** Maximum Euclidean RGB distance: sqrt(3 × 255²) ≈ 441.67. */
    MAX_RGB_DISTANCE: number;
    /** Factor to convert tolerance (0-100) to RGB distance units (~4.41). */
    RGB_TO_TOLERANCE_FACTOR: number;
    /** ITU-R BT.601 red luminance weight. */
    LUMA_R: number;
    /** ITU-R BT.601 green luminance weight. */
    LUMA_G: number;
    /** ITU-R BT.601 blue luminance weight. */
    LUMA_B: number;
    /** Sobel X kernel coefficients. */
    SOBEL_X: number[];
    /** Sobel Y kernel coefficients. */
    SOBEL_Y: number[];
};

/**
 * LRU (Least Recently Used) cache with bounded size.
 * Automatically evicts the least recently accessed entry when full.
 */
export class LRUCache<K = number, V = unknown> {
    constructor(maxSize: number);
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    has(key: K): boolean;
    clear(): void;
    readonly size: number;
}

/**
 * Structured error class for background removal failures.
 */
export class BackgroundRemovalError extends Error {
    constructor(message: string);
    readonly name: 'BackgroundRemovalError';
}
