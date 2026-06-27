/**
 * Stream processing utilities
 * Shared utilities for handling ReadableStream operations
 */

/**
 * Read all chunks from a ReadableStreamDefaultReader
 * @param reader The stream reader to read from
 * @returns Promise resolving to array of Uint8Array chunks
 */
export async function readStreamChunks(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  let done = false;
  
  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;
    if (value) {
      chunks.push(value);
    }
  }
  
  return chunks;
}

/**
 * Combine multiple Uint8Array chunks into a single Uint8Array
 * @param chunks Array of Uint8Array chunks to combine
 * @returns Combined Uint8Array
 */
export function combineChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  
  return combined;
}