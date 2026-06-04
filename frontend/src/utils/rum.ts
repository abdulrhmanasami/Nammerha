// ============================================================================
// Nammerha — Real User Monitoring (GAP-O2 PLATINUM)
// ============================================================================
// Captures Core Web Vitals (LCP, FID, CLS, TTFB, INP) and reports them to
// the backend for monitoring Syrian field performance. No external dependencies
// — uses the native PerformanceObserver API.
//
// Why this matters:
//   Syrian users on 2G/3G networks experience fundamentally different
//   performance than developers on fiber connections. Lab metrics (Lighthouse)
//   don't capture real-world degradation. RUM captures what users ACTUALLY see.
//
// Architecture:
//   PerformanceObserver → MetricBuffer → Beacon to /api/rum/vitals (batched)
//
// Standard: Google Web Vitals (https://web.dev/vitals/)
// ============================================================================

import { reportWarning } from '../error-reporter';
import { addTrackedTimer } from './tracked-timers';

// ─── Metric Types ───────────────────────────────────────────────────────────

interface WebVitalMetric {
  name: 'LCP' | 'FID' | 'CLS' | 'TTFB' | 'INP';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

interface RUMPayload {
  url: string;
  timestamp: string;
  connection?: string;
  effectiveType?: string;
  metrics: WebVitalMetric[];
}

// ─── Thresholds (Google Web Vitals 2024) ────────────────────────────────────

const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000], // Good < 2.5s, Poor > 4s
  FID: [100, 300], // Good < 100ms, Poor > 300ms
  CLS: [0.1, 0.25], // Good < 0.1, Poor > 0.25
  TTFB: [800, 1800], // Good < 800ms, Poor > 1.8s
  INP: [200, 500], // Good < 200ms, Poor > 500ms
};

function rate(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const t = THRESHOLDS[name];
  if (!t) {
    return 'good';
  }
  if (value <= t[0]) {
    return 'good';
  }
  if (value <= t[1]) {
    return 'needs-improvement';
  }
  return 'poor';
}

// ─── Metric Buffer ──────────────────────────────────────────────────────────

const buffer: WebVitalMetric[] = [];
let flushScheduled = false;

function bufferMetric(name: WebVitalMetric['name'], value: number): void {
  buffer.push({
    name,
    value: Math.round(name === 'CLS' ? value * 1000 : value), // CLS is unitless, scale for readability
    rating: rate(name, value),
  });

  if (!flushScheduled) {
    flushScheduled = true;
    // Batch: flush after 5 seconds or on page unload (whichever comes first)
    addTrackedTimer(setTimeout(flush, 5000));
  }
}

function flush(): void {
  if (buffer.length === 0) {
    return;
  }

  const payload: RUMPayload = {
    url: window.location.pathname,
    timestamp: new Date().toISOString(),
    metrics: [...buffer],
  };

  // Capture network quality if available (Network Information API)
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; type?: string };
  };
  if (nav.connection) {
    payload.effectiveType = nav.connection.effectiveType;
    payload.connection = nav.connection.type;
  }

  buffer.length = 0;
  flushScheduled = false;

  // Use sendBeacon for reliability on page unload
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const sent = navigator.sendBeacon('/api/rum/vitals', blob);
    if (!sent) {
      // Fallback: fire-and-forget fetch
      fetch('/api/rum/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        /* Silent — non-critical telemetry */
      });
    }
  } catch {
    // Silent — RUM is non-critical telemetry
  }
}

// ─── PerformanceObserver Watchers ────────────────────────────────────────────

function observeLCP(): void {
  try {
    const obs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        bufferMetric('LCP', last.startTime);
      }
    });
    obs.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // Browser doesn't support LCP observation
  }
}

function observeFID(): void {
  try {
    const obs = new PerformanceObserver((list) => {
      const entry = list.getEntries()[0] as PerformanceEventTiming | undefined;
      if (entry) {
        bufferMetric('FID', entry.processingStart - entry.startTime);
      }
    });
    obs.observe({ type: 'first-input', buffered: true });
  } catch {
    // Browser doesn't support FID observation
  }
}

function observeCLS(): void {
  try {
    let clsValue = 0;
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        };
        if (!layoutShift.hadRecentInput && layoutShift.value) {
          clsValue += layoutShift.value;
        }
      }
    });
    obs.observe({ type: 'layout-shift', buffered: true });

    // Report final CLS on page hide
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden') {
          bufferMetric('CLS', clsValue);
          flush(); // Force flush on page hide
        }
      },
      { once: true },
    );
  } catch {
    // Browser doesn't support CLS observation
  }
}

function observeTTFB(): void {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav) {
      bufferMetric('TTFB', nav.responseStart - nav.requestStart);
    }
  } catch {
    // Navigation Timing not available
  }
}

function observeINP(): void {
  try {
    let maxINP = 0;
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const evt = entry as PerformanceEventTiming;
        const duration = evt.duration;
        if (duration > maxINP) {
          maxINP = duration;
        }
      }
    });
    obs.observe({ type: 'event', buffered: true });

    // Report max INP on page hide
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden' && maxINP > 0) {
          bufferMetric('INP', maxINP);
        }
      },
      { once: true },
    );
  } catch {
    // Browser doesn't support INP observation
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize Real User Monitoring.
 * Call once per page load (e.g., in main.ts).
 *
 * Non-blocking, non-critical — all observers are wrapped in try/catch.
 * If any observer fails, the rest continue independently.
 */
export function initRUM(): void {
  if (typeof PerformanceObserver === 'undefined') {
    reportWarning('[RUM] PerformanceObserver not available — skipping Web Vitals', {
      component: 'rum',
    });
    return;
  }

  // Only run in production to avoid polluting dev metrics
  if (import.meta.env.DEV) {
    return;
  }

  observeLCP();
  observeFID();
  observeCLS();
  observeTTFB();
  observeINP();

  // Ensure flush on page unload
  window.addEventListener('pagehide', flush);
}
