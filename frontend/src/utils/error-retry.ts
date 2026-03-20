/**
 * P2-U1 FIX: Shared Error Retry Utility
 * ══════════════════════════════════════════════════════════════════════════
 * Provides professional error-with-retry UI for all dashboard portals.
 * Critical for Syrian 2G/3G users who experience frequent transient failures.
 *
 * Two entry points:
 *   - renderErrorWithRetry(): For <div> container error states
 *   - renderTableErrorWithRetry(): For <tbody>/<table> error states (colspan)
 *
 * Features:
 *   - i18n-aware (uses data-i18n attributes)
 *   - Accessible (aria-live, role="alert")
 *   - Dark-mode safe (uses html[data-theme="dark"] CSS overrides in main.css)
 *   - Retry button with loading state
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * Renders an error state with a retry button inside a container element.
 *
 * @param container - The parent element to render the error into
 * @param retryFn - The async function to call when the retry button is clicked
 * @param i18nKey - Optional i18n key for the error message (default: 'failed_to_load')
 * @param fallbackText - Fallback English text if i18n is not loaded
 */
export function renderErrorWithRetry(
    container: HTMLElement,
    retryFn: () => Promise<void>,
    i18nKey: string = 'failed_to_load',
    fallbackText: string = 'Failed to load'
): void {
    container.innerHTML = `
        <div class="p-8 text-center" role="alert" aria-live="polite">
            <i class="ph ph-warning-circle text-red-400 text-3xl" aria-hidden="true"></i>
            <p class="mt-2 text-sm text-red-400" data-i18n="${i18nKey}">${fallbackText}</p>
            <button type="button" class="retry-btn mt-3 px-4 py-2 text-xs font-semibold rounded-lg bg-trust-blue text-white hover:bg-trust-blue/90 transition-colors touch-safe" data-i18n="retry">
                Retry
            </button>
        </div>
    `;
    const btn = container.querySelector('.retry-btn') as HTMLButtonElement | null;
    if (btn) {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin" aria-hidden="true"></i>';
            try {
                await retryFn();
            } catch {
                /* Intentional: Retry also failed → re-render error state.
                   This is the terminal recovery path — user can retry again. */
                // If retry also fails, re-render the error state
                renderErrorWithRetry(container, retryFn, i18nKey, fallbackText);
            }
        });
    }
}

/**
 * Renders an error state with a retry button inside a table body.
 * Uses a full-width <td colspan> to span the table.
 *
 * @param tbody - The <tbody> element to render the error into
 * @param retryFn - The async function to call when the retry button is clicked
 * @param colspan - Number of columns the error should span
 * @param i18nKey - Optional i18n key for the error message
 * @param fallbackText - Fallback English text
 */
export function renderTableErrorWithRetry(
    tbody: HTMLElement,
    retryFn: () => Promise<void>,
    colspan: number = 5,
    i18nKey: string = 'failed_to_load',
    fallbackText: string = 'Failed to load'
): void {
    tbody.innerHTML = `
        <tr>
            <td colspan="${colspan}" class="px-5 py-8 text-center" role="alert" aria-live="polite">
                <i class="ph ph-warning-circle text-red-400 text-2xl" aria-hidden="true"></i>
                <p class="mt-2 text-sm text-red-400" data-i18n="${i18nKey}">${fallbackText}</p>
                <button type="button" class="retry-btn mt-3 px-4 py-2 text-xs font-semibold rounded-lg bg-trust-blue text-white hover:bg-trust-blue/90 transition-colors touch-safe" data-i18n="retry">
                    Retry
                </button>
            </td>
        </tr>
    `;
    const btn = tbody.querySelector('.retry-btn') as HTMLButtonElement | null;
    if (btn) {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin" aria-hidden="true"></i>';
            try {
                await retryFn();
            } catch {
                /* Intentional: Retry also failed → re-render error state.
                   This is the terminal recovery path — user can retry again. */
                renderTableErrorWithRetry(tbody, retryFn, colspan, i18nKey, fallbackText);
            }
        });
    }
}
