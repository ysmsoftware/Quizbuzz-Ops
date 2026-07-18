/**
 * Simulates artificial network latency for API responses.
 * By default delays between 300ms and 600ms.
 */
export function simulateLatency(min = 300, max = 600): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Returns true if a random failure should trigger, defaults to 2% chance.
 */
export function shouldFail(chance = 0.02): boolean {
  return Math.random() < chance;
}
