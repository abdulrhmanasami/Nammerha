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
      // PLATINUM FIX: Aggressive LRU Eviction Loop (Silent Data Loss Prevention)
      // Ensure we actually free enough space, otherwise warn the user of data loss.
      try {
        const items = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && (k.startsWith('nm_draft_') || k.startsWith('nm_autosave_'))) {
            const raw = sessionStorage.getItem(k);
            let time = 0;
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                time = parsed.savedAt || 0;
              } catch {
                time = 0;
              }
            }
            items.push({ key: k, time });
          }
        }

        if (items.length > 0) {
          // Sort ascending by time (oldest first)
          items.sort((a, b) => a.time - b.time);

          let success = false;
          let itemsRemoved = 0;

          // Aggressively remove items one by one until setItem succeeds
          while (items.length > 0 && !success) {
            const item = items.shift();
            if (item) {
              sessionStorage.removeItem(item.key);
              itemsRemoved++;
              try {
                sessionStorage.setItem(key, value);
                success = true;
              } catch (loopErr) {
                if (!isQuotaExceeded(loopErr)) {
                  throw loopErr;
                }
                // Still exceeded, loop continues to remove the next oldest item
              }
            }
          }

          if (success) {
            console.warn(`[Safe Storage] Evicted ${itemsRemoved} old drafts to free space for new draft.`);
            return true;
          }
        }

        // Eviction failed entirely (either no drafts to delete, or current draft is bigger than 5MB limit alone)
        throw new Error('Quota Exhausted');
      } catch (retryErr) {
        console.error('SessionStorage Eviction Failed', retryErr);
        import('./toast').then(({ showToast }) => {
          import('./i18n').then(({ t }) => {
            showToast(
              t('error_storage_quota', 'حجم البيانات المدخلة (كالصور) تجاوز السعة القصوى المسموحة للمتصفح. يرجى حذف بعض الملفات لضمان حفظ العمل.'),
              'warning',
              { duration: 8000 }
            );
          }).catch(() => {});
        }).catch(() => {});
        return false;
      }
    }
    return false;
  }
}
