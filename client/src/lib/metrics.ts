/**
 * API metrics tracking for monitoring performance and optimization effectiveness
 */

export interface APIMetrics {
  totalRequests: number;
  cachedRequests: number;
  rateLimitHits: number;
  retryCount: number;
  averageResponseTime: number;
  endpoints: {
    [key: string]: {
      count: number;
      cached: number;
      avgResponseTime: number;
    };
  };
}

const METRICS_STORAGE_KEY = "pendelpilot.api-metrics";

let inMemoryMetrics: APIMetrics = {
  totalRequests: 0,
  cachedRequests: 0,
  rateLimitHits: 0,
  retryCount: 0,
  averageResponseTime: 0,
  endpoints: {},
};

/**
 * Load metrics from localStorage
 */
function loadMetrics(): APIMetrics {
  try {
    const raw = localStorage.getItem(METRICS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Silently fail if localStorage is unavailable
  }
  return { ...inMemoryMetrics };
}

/**
 * Save metrics to localStorage
 */
function saveMetrics(metrics: APIMetrics): void {
  try {
    localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(metrics));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Track an API call
 * @param endpoint - The API endpoint (e.g., 'geocoding', 'routing', 'transport')
 * @param cached - Whether the request was served from cache
 * @param duration - The response time in milliseconds
 */
export function trackAPICall(endpoint: string, cached: boolean, duration: number): void {
  const metrics = loadMetrics();
  
  metrics.totalRequests++;
  if (cached) metrics.cachedRequests++;
  
  // Update average response time
  metrics.averageResponseTime = 
    (metrics.averageResponseTime * (metrics.totalRequests - 1) + duration) / metrics.totalRequests;
  
  // Update endpoint-specific metrics
  if (!metrics.endpoints[endpoint]) {
    metrics.endpoints[endpoint] = {
      count: 0,
      cached: 0,
      avgResponseTime: 0,
    };
  }
  
  const endpointMetrics = metrics.endpoints[endpoint];
  endpointMetrics.count++;
  if (cached) endpointMetrics.cached++;
  endpointMetrics.avgResponseTime = 
    (endpointMetrics.avgResponseTime * (endpointMetrics.count - 1) + duration) / endpointMetrics.count;
  
  inMemoryMetrics = metrics;
  saveMetrics(metrics);
}

/**
 * Track a rate limit hit
 */
export function trackRateLimitHit(): void {
  const metrics = loadMetrics();
  metrics.rateLimitHits++;
  inMemoryMetrics = metrics;
  saveMetrics(metrics);
}

/**
 * Track a retry attempt
 */
export function trackRetry(): void {
  const metrics = loadMetrics();
  metrics.retryCount++;
  inMemoryMetrics = metrics;
  saveMetrics(metrics);
}

/**
 * Get current metrics
 * @returns The current API metrics
 */
export function getMetrics(): APIMetrics {
  return loadMetrics();
}

/**
 * Clear all metrics
 */
export function clearMetrics(): void {
  inMemoryMetrics = {
    totalRequests: 0,
    cachedRequests: 0,
    rateLimitHits: 0,
    retryCount: 0,
    averageResponseTime: 0,
    endpoints: {},
  };
  try {
    localStorage.removeItem(METRICS_STORAGE_KEY);
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Get cache hit rate as a percentage
 * @returns Cache hit rate (0-100)
 */
export function getCacheHitRate(): number {
  const metrics = getMetrics();
  if (metrics.totalRequests === 0) return 0;
  return (metrics.cachedRequests / metrics.totalRequests) * 100;
}

/**
 * Get endpoint-specific metrics
 * @param endpoint - The endpoint name
 * @returns Endpoint metrics or null if not found
 */
export function getEndpointMetrics(endpoint: string): APIMetrics['endpoints'][string] | null {
  const metrics = getMetrics();
  return metrics.endpoints[endpoint] || null;
}
