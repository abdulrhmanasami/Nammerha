// ============================================================================
// Nammerha Frontend — Upload Progress Indicator Component
// CRIT-UX-011 FIX: Visual progress indicator for file uploads.
// Previous: No progress feedback — users saw nothing during uploads on Syrian
// 3G networks, leading to duplicate submissions and abandoned sessions.
// Now: Animated progress bar with file name, size, percentage, and cancel.
// Standard: Nielsen #1 (System Status Visibility), Apple HIG (Progress).
// ============================================================================

import { t } from '../utils/i18n';
import { escapeHtml } from '../utils/xss';

/** Upload state for a single file */
export interface UploadState {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number; // 0-100
  status: 'uploading' | 'complete' | 'error' | 'cancelled';
  error?: string;
}

/**
 * Format file size to human-readable string.
 * Syrian networks are slow — showing MB helps set expectations.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * Create or update an upload progress indicator in the DOM.
 * Call this repeatedly with updated progress to animate.
 *
 * @param containerId - ID of the container to inject the indicator into
 * @param state - Current upload state
 * @returns The indicator element
 */
export function updateUploadProgress(containerId: string, state: UploadState): HTMLElement | null {
  const container = document.getElementById(containerId);
  if (!container) return null;

  let indicator = document.getElementById(`nm-upload-${state.id}`);

  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = `nm-upload-${state.id}`;
    indicator.className = 'nm-upload-indicator animate-fade-in-up';
    indicator.setAttribute('role', 'progressbar');
    indicator.setAttribute('aria-valuemin', '0');
    indicator.setAttribute('aria-valuemax', '100');
    container.appendChild(indicator);
  }

  const statusClass =
    state.status === 'complete'
      ? 'nm-upload--complete'
      : state.status === 'error'
        ? 'nm-upload--error'
        : state.status === 'cancelled'
          ? 'nm-upload--cancelled'
          : '';

  const statusIcon =
    state.status === 'complete'
      ? 'ph-check-circle'
      : state.status === 'error'
        ? 'ph-warning-circle'
        : state.status === 'cancelled'
          ? 'ph-x-circle'
          : 'ph-cloud-arrow-up';

  const statusLabel =
    state.status === 'complete'
      ? escapeHtml(t('upload_complete', 'اكتمل الرفع'))
      : state.status === 'error'
        ? escapeHtml(state.error ?? t('upload_error', 'خطأ في الرفع'))
        : state.status === 'cancelled'
          ? escapeHtml(t('upload_cancelled', 'تم الإلغاء'))
          : `${state.progress}%`;

  indicator.setAttribute('aria-valuenow', String(state.progress));
  indicator.setAttribute('aria-label', `${escapeHtml(state.fileName)} — ${statusLabel}`);

  indicator.innerHTML = `
    <div class="nm-upload-header ${statusClass}">
      <i class="ph ${statusIcon} nm-upload-icon" aria-hidden="true"></i>
      <div class="nm-upload-info">
        <span class="nm-upload-name">${escapeHtml(state.fileName)}</span>
        <span class="nm-upload-meta">${formatFileSize(state.fileSize)} · ${statusLabel}</span>
      </div>
      ${
        state.status === 'uploading'
          ? `
        <button type="button" class="nm-upload-cancel" data-upload-id="${escapeHtml(state.id)}"
                aria-label="${escapeHtml(t('upload_cancel', 'إلغاء الرفع'))}"
                title="${escapeHtml(t('upload_cancel', 'إلغاء الرفع'))}">
          <i class="ph ph-x" aria-hidden="true"></i>
        </button>
      `
          : ''
      }
    </div>
    <div class="nm-upload-track">
      <div class="nm-upload-fill ${statusClass}" style="width: ${Math.min(state.progress, 100)}%"></div>
    </div>
  `;

  // Auto-remove completed uploads after 3 seconds
  if (state.status === 'complete') {
    setTimeout(() => {
      indicator?.classList.add('nm-upload--fade-out');
      indicator?.addEventListener('animationend', () => indicator?.remove(), { once: true });
    }, 3000);
  }

  return indicator;
}

/**
 * Remove an upload progress indicator.
 */
export function removeUploadProgress(uploadId: string): void {
  const el = document.getElementById(`nm-upload-${uploadId}`);
  if (el) {
    el.classList.add('nm-upload--fade-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }
}

/**
 * Create an upload container element for a given mount point.
 * Call this once per page to set up the upload progress area.
 */
export function createUploadContainer(mountPointId: string): HTMLElement | null {
  const mount = document.getElementById(mountPointId);
  if (!mount) return null;

  // Prevent duplicate containers
  const existing = mount.querySelector('.nm-upload-container');
  if (existing) return existing as HTMLElement;

  const container = document.createElement('div');
  container.id = `nm-uploads-${mountPointId}`;
  container.className = 'nm-upload-container';
  mount.appendChild(container);
  return container;
}
