/**
 * Lightweight image caption generation for diagram reference.
 * Uses canvas analysis to extract visual properties without AI.
 * Captures: dimensions, dominant color tone, complexity estimate.
 */

/**
 * Generate a brief textual caption describing the image's visual properties.
 * Used to help the AI maintain context across multi-turn conversations
 * when the original image is not re-sent.
 */
export function generateImageCaption(
    img: HTMLImageElement | HTMLCanvasElement | ImageData,
    width: number,
    height: number,
): string {
    let caption = `Image (${width}×${height}): `

    // Extract color analysis from canvas
    if (img instanceof ImageData) {
        const { dominantTone, hasDiagramColors, hasWhiteBg } =
            analyzeImageColors(img.data, img.width, img.height)

        // Classify image type by color profile
        if (hasDiagramColors) {
            caption += "diagram/drawing"
        } else if (hasWhiteBg) {
            caption += "screenshot"
        } else {
            caption += "image"
        }

        if (dominantTone) {
            caption += ` (${dominantTone} tones)`
        }
    } else {
        caption += "image"
    }

    return caption
}

interface ColorAnalysis {
    dominantTone: string | null
    hasDiagramColors: boolean
    hasWhiteBg: boolean
}

/**
 * Analyze image pixel data to extract color profile.
 * Detects if image is likely a diagram, screenshot, or photo.
 */
function analyzeImageColors(
    data: Uint8ClampedArray,
    width: number,
    height: number,
): ColorAnalysis {
    // Sample every 4th pixel for performance (enough for color profile)
    const step = 4
    const totalSamples = Math.ceil((width * height) / step)

    let rSum = 0,
        gSum = 0,
        bSum = 0
    let whitePixels = 0 // Near-white pixels (typical of diagrams/screenshots)
    let darkPixels = 0 // Near-black pixels (text, borders)
    let colorfulPixels = 0 // High saturation pixels (photos)
    const gridLikePixels = 0 // High contrast pixels (lines, boxes)

    let lastR = -1,
        lastG = -1,
        lastB = -1
    let contrastChanges = 0

    for (let i = 0; i < data.length; i += step * 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        // alpha = data[i + 3]

        rSum += r
        gSum += g
        bSum += b

        // White background detection
        if (r > 240 && g > 240 && b > 240) {
            whitePixels++
        }

        // Dark text/line detection
        if (r < 50 && g < 50 && b < 50) {
            darkPixels++
        }

        // Colorful pixels (not grayscale)
        const maxC = Math.max(r, g, b)
        const minC = Math.min(r, g, b)
        const sat = maxC > 0 ? (maxC - minC) / maxC : 0
        if (sat > 0.3 && maxC > 80) {
            colorfulPixels++
        }

        // Detect grid-like structure (high local contrast = likely lines/boxes)
        if (lastR >= 0) {
            const contrast =
                Math.abs(r - lastR) + Math.abs(g - lastG) + Math.abs(b - lastB)
            if (contrast > 100) {
                contrastChanges++
            }
        }
        lastR = r
        lastG = g
        lastB = b
    }

    const whiteRatio = whitePixels / totalSamples
    const darkRatio = darkPixels / totalSamples
    const colorfulRatio = colorfulPixels / totalSamples
    const contrastRatio = contrastChanges / totalSamples

    // Determine dominant tone from average color
    const avgR = rSum / totalSamples
    const avgG = gSum / totalSamples
    const avgB = bSum / totalSamples

    let dominantTone: string | null = null
    const brightness = (avgR + avgG + avgB) / 3

    if (brightness > 200) {
        dominantTone = "light"
    } else if (brightness < 80) {
        dominantTone = "dark"
    } else {
        // Color tone
        if (avgB > avgR && avgB > avgG) {
            dominantTone = "blue"
        } else if (avgG > avgR && avgG > avgB) {
            dominantTone = "green"
        } else if (avgR > avgB) {
            dominantTone = avgG > 100 ? "yellow/orange" : "red"
        }
    }

    // Diagram detection: white bg + dark lines + moderate contrast
    const hasDiagramColors =
        whiteRatio > 0.4 && darkRatio > 0.01 && contrastRatio > 0.15
    const hasWhiteBg = whiteRatio > 0.5

    return {
        dominantTone,
        hasDiagramColors,
        hasWhiteBg,
    }
}

/**
 * Generate caption from a File object (loads into image element first).
 * Returns a promise that resolves with the caption string.
 */
export function generateImageCaptionFromFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error("Failed to read file"))

        reader.onload = () => {
            const img = new Image()
            img.onerror = () =>
                reject(new Error("Failed to load image for caption"))

            img.onload = () => {
                try {
                    // Draw to canvas for pixel analysis
                    const canvas = document.createElement("canvas")
                    // Use small canvas for fast analysis (64px max dimension)
                    const scale = Math.min(
                        1,
                        64 / Math.max(img.width, img.height),
                    )
                    canvas.width = Math.round(img.width * scale)
                    canvas.height = Math.round(img.height * scale)

                    const ctx = canvas.getContext("2d")
                    if (!ctx) {
                        resolve(`Image (${img.width}×${img.height}): image`)
                        return
                    }

                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                    const imageData = ctx.getImageData(
                        0,
                        0,
                        canvas.width,
                        canvas.height,
                    )
                    const caption = generateImageCaption(
                        imageData,
                        img.width,
                        img.height,
                    )
                    resolve(caption)
                } catch {
                    resolve(`Image (${img.width}×${img.height}): image`)
                }
            }

            img.src = reader.result as string
        }

        reader.readAsDataURL(file)
    })
}
