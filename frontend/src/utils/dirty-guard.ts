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

export class DirtyStateGuard {
  private isDirty = false;
  private readonly _unloadListener: (e: BeforeUnloadEvent) => void;
  private readonly _internalNavListener: (e: Event) => void;

  constructor() {
    this._unloadListener = (e: BeforeUnloadEvent) => {
      if (this.isDirty) {
        e.preventDefault();
        // Standard requires setting returnValue in some legacy browsers,
        // though modern browsers ignore custom text.
        e.returnValue = '';
      }
    };

    this._internalNavListener = (e: Event) => {
      if (this.isDirty) {
        const confirmLoss = window.confirm(
          t('confirm_unsaved_leave', 'لديك بيانات غير محفوظة. هل أنت متأكد من رغبتك في المغادرة؟'),
        );
        if (!confirmLoss) {
          e.preventDefault();
        } else {
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
      window.addEventListener('beforeunload', this._unloadListener);
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
      window.removeEventListener('beforeunload', this._unloadListener);
      window.removeEventListener('nm_internal_navigate', this._internalNavListener);
    }
  }

  /**
   * Checks if the state is currently dirty.
   */
  public get isCurrentlyDirty(): boolean {
    return this.isDirty;
  }
}
