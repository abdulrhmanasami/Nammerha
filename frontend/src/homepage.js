// ============================================================================
// Nammerha Frontend — Homepage Data Loader (HGH-AUD-001 FIX)
// Replaces hardcoded mock data with API-driven content.
// ============================================================================
// This module loads:
//   1. Featured projects from /api/marketplace (carousel cards)
//   2. Dashboard stats from /api/dashboard/stats (total impact, trend)
//   3. Map active region data
// ============================================================================

const API_BASE = window.location.origin;

// ─── Project Card Renderer ──────────────────────────────────────────────────
// Generates an OCDS-verified project card with live funding circle.
function renderProjectCard(project, index) {
    const funded = project.funded_percentage ?? 0;
    const circumference = 100.53; // 2 * π * 16
    const offset = circumference - (circumference * funded / 100);
    const delay = index * 0.1;

    const iconMap = {
        structural: 'ph-house-line',
        plumbing: 'ph-drop',
        electrical: 'ph-lightning',
        mixed: 'ph-buildings',
    };
    const icon = iconMap[project.damage_type] || 'ph-building-office';
    const colorMap = {
        structural: 'warm-earth',
        plumbing: 'trust-blue',
        electrical: 'warning-yellow',
        mixed: 'smoky-jade',
    };
    const color = colorMap[project.damage_type] || 'smoky-jade';

    return `
    <div class="min-w-[280px] w-[280px] glass-card card-hover-lift rounded-2xl overflow-hidden shadow-md flex flex-col animate-fade-in-up" style="animation-delay: ${delay}s">
      <div class="relative h-44 overflow-hidden bg-gradient-to-br from-${color}/10 to-slate-200">
        ${project.cover_image_url
            ? `<img src="${project.cover_image_url}" alt="${project.title}" class="w-full h-full object-cover" loading="lazy">`
            : `<div class="absolute inset-0 flex items-center justify-center">
                <i class="ph ${icon} text-${color}/50" style="font-size:48px" aria-hidden="true"></i>
              </div>`}
        <div class="absolute top-3 right-3 bg-white/90 backdrop-blur rounded-full px-2 py-1 flex items-center gap-1 shadow-sm">
          <i class="ph ph-seal-check text-smoky-jade" style="font-size:14px" aria-hidden="true"></i>
          <span class="text-[10px] font-bold text-smoky-jade">VERIFIED OCDS</span>
        </div>
      </div>
      <div class="p-4 flex flex-col flex-1">
        <div class="flex justify-between items-start mb-2">
          <h3 class="font-bold text-base leading-tight">${escapeHtml(project.title)}</h3>
          <div class="relative size-10 shrink-0">
            <svg class="size-full -rotate-90" viewBox="0 0 36 36">
              <circle class="stroke-slate-200" cx="18" cy="18" fill="none" r="16" stroke-width="3"></circle>
              <circle class="stroke-smoky-jade" cx="18" cy="18" fill="none" r="16"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-width="3"></circle>
            </svg>
            <span class="absolute inset-0 flex items-center justify-center text-[9px] font-bold">${Math.round(funded)}%</span>
          </div>
        </div>
        <p class="text-slate-500 text-xs line-clamp-2 mb-4">${escapeHtml(project.description || '')}</p>
        <a href="project-details.html?id=${project.project_id}"
           class="btn-primary mt-auto text-sm !py-2.5"
           data-i18n="fund_project">Fund This Project</a>
      </div>
    </div>`;
}

// ─── Escape HTML (XSS prevention) ───────────────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Format Currency ────────────────────────────────────────────────────────
function formatCurrency(cents) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(cents / 100);
}

// ─── Load Featured Projects ─────────────────────────────────────────────────
async function loadFeaturedProjects() {
    const carousel = document.getElementById('projects-carousel');
    const skeleton = document.getElementById('projects-skeleton');
    const emptyState = document.getElementById('projects-empty');
    if (!carousel) return;

    try {
        const res = await fetch(`${API_BASE}/api/marketplace`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        const projects = data.data ?? data ?? [];

        if (skeleton) skeleton.remove();

        if (!Array.isArray(projects) || projects.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        // Render up to 6 featured projects
        const html = projects.slice(0, 6).map((p, i) => renderProjectCard(p, i)).join('');
        carousel.insertAdjacentHTML('beforeend', html);

        // Re-run i18n on new DOM nodes
        if (typeof window.applyI18n === 'function') window.applyI18n();
    } catch (err) {
        console.warn('[Homepage] Failed to load projects:', err.message);
        // Keep skeleton visible as degraded state
    }
}

// ─── Load Dashboard Stats ───────────────────────────────────────────────────
async function loadDashboardStats() {
    const impactEl = document.getElementById('total-impact-value');
    const trendEl = document.getElementById('impact-trend');
    const regionEl = document.getElementById('map-active-region');
    const countEl = document.getElementById('map-active-count');

    try {
        const res = await fetch(`${API_BASE}/api/dashboard/stats`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        const stats = data.data ?? data ?? {};

        if (impactEl && stats.total_funded != null) {
            impactEl.textContent = formatCurrency(stats.total_funded);
        }
        if (trendEl && stats.trend != null) {
            const sign = stats.trend >= 0 ? '+' : '';
            trendEl.textContent = `${sign}${stats.trend.toFixed(1)}%`;
        }
        if (regionEl && stats.active_region) {
            regionEl.textContent = stats.active_region;
        }
        if (countEl && stats.active_projects_count != null) {
            countEl.textContent = `${stats.active_projects_count} Active Projects`;
        }
    } catch (err) {
        console.warn('[Homepage] Failed to load stats:', err.message);
        // Keep dash placeholders as graceful degradation
    }
}

// ─── Initialize ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadFeaturedProjects();
    loadDashboardStats();
});
