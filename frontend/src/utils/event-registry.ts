// ============================================================================
// Nammerha Frontend — Event Registry
// PLATINUM STANDARD: Zero-Leak Event Architecture (Zombie DOM Prevention)
// ============================================================================

type EventTargetElement = Window | Document | HTMLElement | Element;

interface RegisteredEvent {
  target: EventTargetElement;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
}

interface RegisterOptions {
  /** If true, the event survives SPA route transitions (e.g. core framework events). */
  persist?: boolean;
}

const activeListeners = new Set<RegisteredEvent>();

/**
 * Registers an event listener that is strictly tracked.
 * Transient listeners are automatically destroyed during SPA transitions.
 * Use this INSTEAD of target.addEventListener for any UI logic that belongs 
 * to a specific portal, dashboard, or transient view.
 * 
 * @param target The DOM element or Window object.
 * @param type The event string (e.g., 'scroll', 'click').
 * @param listener The callback function.
 * @param options Native event options.
 * @param nmOptions Nammerha-specific lifecycle options.
 */
export function nmAddEventListener(
  target: EventTargetElement | null | undefined,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
  nmOptions?: RegisterOptions
): void {
  if (!target) return;

  target.addEventListener(type, listener, options);
  
  if (!nmOptions?.persist) {
    activeListeners.add({ target, type, listener, options });
  }
}

/**
 * Removes an event listener and untracks it.
 */
export function nmRemoveEventListener(
  target: EventTargetElement | null | undefined,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions
): void {
  if (!target) return;

  target.removeEventListener(type, listener, options);

  // Remove from tracking registry
  for (const record of activeListeners) {
    if (record.target === target && record.type === type && record.listener === listener) {
      activeListeners.delete(record);
      break;
    }
  }
}

/**
 * PURGE SEQUENCE (The Platinum Fix):
 * Destroys all transient event listeners tracked by the registry.
 * MUST be called by the hash-router and portal context switchers before
 * performing any innerHTML DOM replacement.
 */
export function nmClearAllListeners(): void {
  let purgedCount = 0;
  for (const record of activeListeners) {
    try {
      record.target.removeEventListener(record.type, record.listener, record.options);
      purgedCount++;
    } catch (err) {
      /* ignore removal failures */
    }
  }
  
  if (import.meta.env.DEV && purgedCount > 0) {
    console.debug(`[EventRegistry] Purged ${purgedCount} transient zombie listeners.`);
  }

  activeListeners.clear();
}
