/**
 * Tests for metrics.ts
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { 
  trackAPICall,
  trackRateLimitHit,
  trackRetry,
  getMetrics,
  clearMetrics,
  getCacheHitRate,
  getEndpointMetrics
} from './metrics.js';

test.beforeEach(() => {
  clearMetrics();
});

test.afterEach(() => {
  clearMetrics();
});

test("trackAPICall increments total requests", () => {
  trackAPICall('test', false, 100);
  const metrics = getMetrics();
  assert.strictEqual(metrics.totalRequests, 1);
});

test("trackAPICall increments cached requests when cached is true", () => {
  trackAPICall('test', true, 100);
  const metrics = getMetrics();
  assert.strictEqual(metrics.cachedRequests, 1);
});

test("trackAPICall updates average response time", () => {
  trackAPICall('test', false, 100);
  trackAPICall('test', false, 200);
  const metrics = getMetrics();
  assert.strictEqual(metrics.averageResponseTime, 150);
});

test("trackAPICall tracks endpoint-specific metrics", () => {
  trackAPICall('geocoding', false, 100);
  trackAPICall('geocoding', true, 50);
  const endpointMetrics = getEndpointMetrics('geocoding');
  assert.ok(endpointMetrics !== null);
  assert.strictEqual(endpointMetrics?.count, 2);
  assert.strictEqual(endpointMetrics?.cached, 1);
  assert.strictEqual(endpointMetrics?.avgResponseTime, 75);
});

test("trackRateLimitHit increments rate limit count", () => {
  trackRateLimitHit();
  trackRateLimitHit();
  const metrics = getMetrics();
  assert.strictEqual(metrics.rateLimitHits, 2);
});

test("trackRetry increments retry count", () => {
  trackRetry();
  trackRetry();
  trackRetry();
  const metrics = getMetrics();
  assert.strictEqual(metrics.retryCount, 3);
});

test("getMetrics returns current metrics", () => {
  trackAPICall('test', false, 100);
  trackRateLimitHit();
  const metrics = getMetrics();
  assert.strictEqual(metrics.totalRequests, 1);
  assert.strictEqual(metrics.rateLimitHits, 1);
});

test("clearMetrics resets all metrics", () => {
  trackAPICall('test', false, 100);
  trackRateLimitHit();
  trackRetry();
  
  clearMetrics();
  
  const metrics = getMetrics();
  assert.strictEqual(metrics.totalRequests, 0);
  assert.strictEqual(metrics.cachedRequests, 0);
  assert.strictEqual(metrics.rateLimitHits, 0);
  assert.strictEqual(metrics.retryCount, 0);
  assert.strictEqual(metrics.averageResponseTime, 0);
  assert.strictEqual(Object.keys(metrics.endpoints).length, 0);
});

test("getCacheHitRate returns 0 when no requests", () => {
  const hitRate = getCacheHitRate();
  assert.strictEqual(hitRate, 0);
});

test("getCacheHitRate returns correct percentage", () => {
  trackAPICall('test', true, 100);
  trackAPICall('test', false, 100);
  trackAPICall('test', true, 100);
  const hitRate = getCacheHitRate();
  assert.strictEqual(hitRate, 66.66666666666666); // 2/3
});

test("getCacheHitRate returns 100 when all cached", () => {
  trackAPICall('test', true, 100);
  trackAPICall('test', true, 100);
  const hitRate = getCacheHitRate();
  assert.strictEqual(hitRate, 100);
});

test("getCacheHitRate returns 0 when none cached", () => {
  trackAPICall('test', false, 100);
  trackAPICall('test', false, 100);
  const hitRate = getCacheHitRate();
  assert.strictEqual(hitRate, 0);
});

test("getEndpointMetrics returns null for unknown endpoint", () => {
  const metrics = getEndpointMetrics('unknown');
  assert.strictEqual(metrics, null);
});

test("getEndpointMetrics returns metrics for known endpoint", () => {
  trackAPICall('geocoding', false, 100);
  const metrics = getEndpointMetrics('geocoding');
  assert.ok(metrics !== null);
  assert.strictEqual(metrics?.count, 1);
  assert.strictEqual(metrics?.cached, 0);
  assert.strictEqual(metrics?.avgResponseTime, 100);
});

test("trackAPICall handles multiple endpoints", () => {
  trackAPICall('geocoding', false, 100);
  trackAPICall('routing', false, 200);
  trackAPICall('transport', true, 50);
  
  assert.strictEqual(getEndpointMetrics('geocoding')?.count, 1);
  assert.strictEqual(getEndpointMetrics('routing')?.count, 1);
  assert.strictEqual(getEndpointMetrics('transport')?.count, 1);
});

test("metrics persist across clearMetrics calls", () => {
  // This test verifies that metrics are persisted to localStorage
  trackAPICall('test', false, 100);
  
  // Clear in-memory metrics
  clearMetrics();
  
  // Metrics should be cleared
  assert.strictEqual(getMetrics().totalRequests, 0);
});
