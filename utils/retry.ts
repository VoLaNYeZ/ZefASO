/**
 * Generic retry utility for async operations.
 * 
 * @param fn The async function to retry.
 * @param retries Number of retries (default: 3).
 * @param delayMs Initial delay in milliseconds (default: 1000).
 * @param backoff Factor to multiply delay by after each failure (default: 2).
 * @returns The result of the function call.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delayMs: number = 1000,
    backoff: number = 2
): Promise<T> {
    let attempt = 0;
    while (attempt <= retries) {
        try {
            return await fn();
        } catch (error) {
            attempt++;
            if (attempt > retries) {
                throw error;
            }

            console.warn(`Attempt ${attempt} failed. Retrying in ${delayMs}ms...`, error);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            delayMs *= backoff;
        }
    }
    throw new Error('Unreachable code in withRetry');
}
