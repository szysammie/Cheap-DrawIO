/**
 * Separates large image data from React state to prevent
 * main-thread blocking from base64 string diffing during re-renders.
 *
 * Problem: Storing image data URLs (100KB-1MB base64 strings) in React state
 * causes every re-render to diff these massive strings, blocking the main thread.
 *
 * Solution: Keep image data in a module-level Map (not React state),
 * keyed by message ID. React state only holds a lightweight reference.
 * Components read from the Map directly without triggering re-renders.
 */

interface ImageDataEntry {
    dataUrl: string
    mediaType: string
    caption: string
    timestamp: number
}

/** Module-level Map — not React state, so updates don't trigger re-renders */
const imageDataMap = new Map<string, ImageDataEntry>()

/**
 * Store image data under a stable message ID.
 * Call this when adding an image to a message.
 */
export function storeImageData(
    messageId: string,
    dataUrl: string,
    mediaType: string,
    caption: string,
): void {
    imageDataMap.set(messageId, {
        dataUrl,
        mediaType,
        caption,
        timestamp: Date.now(),
    })
}

/**
 * Retrieve image data by message ID.
 * Returns undefined if not found (image was never stored or already evicted).
 */
export function getImageData(messageId: string): ImageDataEntry | undefined {
    return imageDataMap.get(messageId)
}

/**
 * Remove image data for a specific message.
 * Call this when a message is deleted.
 */
export function removeImageData(messageId: string): void {
    imageDataMap.delete(messageId)
}

/**
 * Evict oldest entries when the map grows too large.
 * Keeps memory bounded for long conversations.
 */
const MAX_ENTRIES = 20

function evictOldestIfNeeded(): void {
    if (imageDataMap.size <= MAX_ENTRIES) return

    // Sort by timestamp, delete oldest half
    const sorted = Array.from(imageDataMap.entries()).sort(
        ([, a], [, b]) => a.timestamp - b.timestamp,
    )
    const toDelete = sorted.slice(0, Math.floor(MAX_ENTRIES / 2))
    for (const [id] of toDelete) {
        imageDataMap.delete(id)
    }
}

/** Call after storing to keep map bounded */
export function storeImageDataWithEviction(
    messageId: string,
    dataUrl: string,
    mediaType: string,
    caption: string,
): void {
    storeImageData(messageId, dataUrl, mediaType, caption)
    evictOldestIfNeeded()
}

/**
 * Clear all stored image data.
 * Call this on new chat / session clear.
 */
export function clearAllImageData(): void {
    imageDataMap.clear()
}

/**
 * Get total memory footprint (approximate base64 bytes stored).
 */
export function getImageDataMemoryBytes(): number {
    let total = 0
    for (const entry of imageDataMap.values()) {
        total += entry.dataUrl.length * 2 // rough UTF-16 estimate
    }
    return total
}
