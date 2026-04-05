/**
 * Image compression utilities for client-side processing.
 * Resizes and compresses images before sending to AI to prevent:
 * 1. Frontend freezing from large base64 strings in React state
 * 2. Slow AI processing from unnecessarily large images
 * 3. Memory pressure from storing large data URLs
 */

// Maximum dimensions for AI-processed images
const MAX_WIDTH = 1280
const MAX_HEIGHT = 1280
// JPEG quality for compression (0.7 = good balance of quality/size)
const JPEG_QUALITY = 0.7

interface CompressedImageResult {
    dataUrl: string
    originalSize: number
    compressedSize: number
    width: number
    height: number
}

/**
 * Compress and resize an image file for AI processing.
 * Uses canvas-based resize to reduce dimensions, then JPEG compression.
 *
 * For diagrams/screenshots, JPEG at 0.7 quality is visually identical
 * but 5-10x smaller than PNG, and AI vision models work equally well with it.
 *
 * @param file - The image File to compress
 * @param maxWidth - Maximum width (default: 1280)
 * @param maxHeight - Maximum height (default: 1280)
 * @param quality - JPEG quality 0-1 (default: 0.7)
 * @returns Promise with compressed data URL and size info
 */
export async function compressImageForAI(
    file: File,
    maxWidth: number = MAX_WIDTH,
    maxHeight: number = MAX_HEIGHT,
    quality: number = JPEG_QUALITY,
): Promise<CompressedImageResult> {
    return new Promise((resolve, reject) => {
        const originalSize = file.size

        const reader = new FileReader()
        reader.onerror = () =>
            reject(new Error(`Failed to read file: ${file.name}`))

        reader.onload = () => {
            const img = new Image()

            img.onerror = () =>
                reject(new Error(`Failed to load image: ${file.name}`))

            img.onload = () => {
                // Calculate target dimensions maintaining aspect ratio
                let { width, height } = img

                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height)
                    width = Math.round(width * ratio)
                    height = Math.round(height * ratio)
                }

                // Use OffscreenCanvas if available (non-blocking), fallback to regular canvas
                let canvas: HTMLCanvasElement | OffscreenCanvas
                let ctx:
                    | CanvasRenderingContext2D
                    | OffscreenCanvasRenderingContext2D
                    | null

                if (
                    typeof OffscreenCanvas !== "undefined" &&
                    typeof OffscreenCanvas.prototype.convertToBlob ===
                        "function"
                ) {
                    canvas = new OffscreenCanvas(width, height)
                    ctx = canvas.getContext(
                        "2d",
                    ) as OffscreenCanvasRenderingContext2D | null
                } else {
                    canvas = document.createElement("canvas")
                    canvas.width = width
                    canvas.height = height
                    ctx = canvas.getContext("2d")
                }

                if (!ctx) {
                    reject(new Error("Failed to get canvas context"))
                    return
                }

                // Disable image smoothing for sharper diagram rendering
                if ("imageSmoothingEnabled" in ctx) {
                    ctx.imageSmoothingEnabled = false
                }

                // Draw resized image
                ctx.drawImage(img, 0, 0, width, height)

                // Convert to JPEG blob (much smaller than PNG for natural images)
                const onConverted = (
                    blob: Blob | null,
                    originalDataUrl: string,
                ) => {
                    if (!blob) {
                        reject(new Error("Failed to convert canvas to blob"))
                        return
                    }

                    // For very small originals that don't need compression,
                    // use the original if it's already smaller
                    if (originalSize <= blob.size) {
                        resolve({
                            dataUrl: originalDataUrl,
                            originalSize,
                            compressedSize: originalSize,
                            width: img.width,
                            height: img.height,
                        })
                        return
                    }

                    // Convert blob to data URL
                    const compressedReader = new FileReader()
                    compressedReader.onload = () => {
                        const dataUrl = compressedReader.result as string
                        resolve({
                            dataUrl,
                            originalSize,
                            compressedSize: blob.size,
                            width,
                            height,
                        })
                    }
                    compressedReader.onerror = () =>
                        reject(new Error("Failed to read compressed blob"))
                    compressedReader.readAsDataURL(blob)
                }

                if (canvas instanceof OffscreenCanvas) {
                    canvas
                        .convertToBlob({ type: "image/jpeg", quality })
                        .then((blob) =>
                            onConverted(blob, reader.result as string),
                        )
                        .catch(() =>
                            reject(
                                new Error(
                                    "OffscreenCanvas.convertToBlob not supported",
                                ),
                            ),
                        )
                } else {
                    ;(canvas as HTMLCanvasElement).toBlob(
                        (blob) => onConverted(blob, reader.result as string),
                        "image/jpeg",
                        quality,
                    )
                }
            }

            img.src = reader.result as string
        }

        reader.readAsDataURL(file)
    })
}

/**
 * Check if a file is an image type.
 */
export function isImageFile(file: File): boolean {
    return file.type.startsWith("image/")
}
