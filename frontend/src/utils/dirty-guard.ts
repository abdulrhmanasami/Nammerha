/**
 * Platinum UX: DirtyStateGuard
 *
 * Protects users from accidental data loss when navigating away from dirty forms.
 * Crucially, it manages the `beforeunload` event listener dynamically.
 *
 * WHY: Leaving a permanent `beforeunload` listener on `window` permanently disables
 * the browser's Back-Forward Cache (bfcache). For Syrian users on 2G/3G networks,
 * bfcache is critical for instant back-navigation.
 *
 * Usage:
 * const formGuard = new DirtyStateGuard();
 *
 * // When user types something:
 * formGuard.markDirty();
 *
 * // When form is submitted successfully or reset:
 * formGuard.markClean();
 */

import { t } from './i18n';

// 🚨 PLATINUM FIX: Global Dirty State Registry
// Protects the Window state by preventing duplicate beforeunload listeners
// across multiple active DirtyStateGuard instances using a reference counter.
let activeGuardsCount = 0;
let _globalUnloadListener: ((e: BeforeUnloadEvent) => void) | null = null;

export class DirtyStateGuard {
  private isDirty = false;
  private readonly _internalNavListener: (e: Event) => void;

  constructor() {
    this._internalNavListener = (e: Event) => {
      if (this.isDirty) {
        // PLATINUM FIX: If another guard already intercepted and canceled the navigation,
        // do not show a duplicate confirm dialog.
        if (e.defaultPrevented) return;

        // PLATINUM FIX: Double Confirmation Paradox Resolution
        // If the user already confirmed data loss for another guard in this same event loop,
        // we silently mark this guard as clean and exit to prevent spamming confirm dialogs.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((e as any)._nmUserConfirmedLeave) {
          this.markClean();
          return;
        }

        const confirmLoss = window.confirm(
          t('confirm_unsaved_leave', 'لديك بيانات غير محفوظة. هل أنت متأكد من رغبتك في المغادرة؟'),
        );
        if (!confirmLoss) {
          e.preventDefault();
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (e as any)._nmUserConfirmedLeave = true;
          this.markClean();
        }
      }
    };
  }

  /**
   * Marks the state as dirty.
   * Dynamically attaches the beforeunload listener to protect data.
   */
  public markDirty(): void {
    if (!this.isDirty) {
      this.isDirty = true;
      activeGuardsCount++;

      if (activeGuardsCount === 1) {
        // First guard being marked dirty, attach the global beforeunload
        _globalUnloadListener = (e: BeforeUnloadEvent) => {
          e.preventDefault();
          e.returnValue = '';
        };
        window.addEventListener('beforeunload', _globalUnloadListener);
      }
      window.addEventListener('nm_internal_navigate', this._internalNavListener);
    }
  }

  /**
   * Marks the state as clean.
   * Removes the beforeunload listener to restore bfcache eligibility.
   */
  public markClean(): void {
    if (this.isDirty) {
      this.isDirty = false;
      window.removeEventListener('nm_internal_navigate', this._internalNavListener);

      activeGuardsCount--;

      // Ensure we don't go below 0 and clean up listener
      if (activeGuardsCount <= 0) {
        activeGuardsCount = 0;
        if (_globalUnloadListener) {
          window.removeEventListener('beforeunload', _globalUnloadListener);
          _globalUnloadListener = null;
        }
      }
    }
  }

  /**
   * Checks if the state is currently dirty.
   */
  public get isCurrentlyDirty(): boolean {
    return this.isDirty;
  }
}
