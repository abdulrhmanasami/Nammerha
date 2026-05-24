/**
 * safe-storage.ts
 * Platinum UX: LocalStorage/SessionStorage Quota Crash Protection
 *
 * Intercepts QuotaExceededError when saving form drafts.
 * If the 5MB quota is hit, it automatically evicts the oldest auto-saved
 * drafts (LRU Eviction) to ensure the CURRENT form the user is typing
 * can be saved successfully, preventing silent data loss.
 */

function isQuotaExceeded(e: unknown): boolean {
  let quotaExceeded = false;
  if (e instanceof DOMException) {
    if (
      e.code === 22 ||
      e.code === 1014 ||
      e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    ) {
      quotaExceeded = true;
    }
  } else if (typeof e === 'number') {
    quotaExceeded = e === 22 || e === 1014;
  }
  return quotaExceeded;
}

export function safeSessionStorageSet(key: string, value: string): boolean {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (isQuotaExceeded(e)) {
      // LRU Eviction: Try to free space by deleting oldest `nm_draft_` and `nm_autosave_` items
      try {
        const items = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && (k.startsWith('nm_draft_') || k.startsWith('nm_autosave_'))) {
            const raw = sessionStorage.getItem(k);
            let time = 0;
            if (raw) {
              try {
                // If it's a draft, it has savedAt
                const parsed = JSON.parse(raw);
                time = parsed.savedAt || 0;
              } catch {
                time = 0; // autosave strings don't have savedAt, they are older targets
              }
            }
            items.push({ key: k, time });
          }
        }

        if (items.length > 0) {
          // Sort ascending by time (oldest first)
          items.sort((a, b) => a.time - b.time);

          // Delete oldest 30% of items to free space
          const toDeleteCount = Math.max(1, Math.floor(items.length * 0.3));
          for (let i = 0; i < toDeleteCount; i++) {
            const item = items[i];
            if (item) {
              sessionStorage.removeItem(item.key);
            }
          }
        }

        // Retry
        sessionStorage.setItem(key, value);
        return true;
      } catch (retryErr) {
        console.error('SessionStorage Eviction Failed', retryErr);
        return false;
      }
    }
    return false;
  }
}
