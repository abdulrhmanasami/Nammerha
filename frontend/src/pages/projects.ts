/**
 * projects.ts — Project Listing Page
 *
 * GAP-001 FIX: Implements the missing project browsing page.
 * Fetches projects from the marketplace API, renders project cards,
 * and supports filtering by damage type, search, and sort.
 *
 * API: marketplace.getProjects() — /api/marketplace/projects
 * Standard: OCDS-compliant project card rendering.
 */
import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { marketplace } from '../api';
import { escapeHtml as esc } from '../utils/xss';
import { formatCents } from '../utils/format';
import { t } from '../utils/i18n';
// UX-004 FIX: Centralized haptic module (replaces inline navigator.vibrate)
import { haptic } from '../utils/haptic';

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════
interface ProjectCard {
    project_id: string;
    title: string;
    damage_type: string;
    address_text: string;
    funded_percentage: number;
    total_cost: number;
    total_funded: number;
    status: string;
    published_at: string;
    cover_image_url?: string;
}

interface ListState {
    projects: ProjectCard[];
    filter: string;
    sort: string;
    search: string;
    offset: number;
    limit: number;
    hasMore: boolean;
    loading: boolean;
}

const state: ListState = {
    projects: [],
    filter: 'all',
    sort: 'funded_percentage',
    search: '',
    offset: 0,
    limit: 12,
    hasMore: false,
    loading: false,
};

// ═══════════════════════════════════════════════════════════════════════════
// DOM REFERENCES
// ═══════════════════════════════════════════════════════════════════════════
const skeleton = document.getElementById('projects-skeleton');
const grid = document.getElementById('projects-grid');
const emptyState = document.getElementById('projects-empty');
const errorState = document.getElementById('projects-error');
const countEl = document.getElementById('project-count');
const searchInput = document.getElementById('project-search') as HTMLInputElement | null;
const sortSelect = document.getElementById('project-sort') as HTMLSelectElement | null;
const loadMoreContainer = document.getElementById('load-more-container');
const loadMoreBtn = document.getElementById('load-more-btn');
const retryBtn = document.getElementById('projects-retry');

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGE TYPE METADATA
// ═══════════════════════════════════════════════════════════════════════════
const damageTypeConfig: Record<string, { icon: string; color: string; label: string }> = {
    structural: { icon: 'ph-buildings', color: 'text-red-500 bg-red-50', label: 'Structural' },
    plumbing: { icon: 'ph-drop', color: 'text-blue-500 bg-blue-50', label: 'Plumbing' },
    electrical: { icon: 'ph-lightning', color: 'text-amber-500 bg-amber-50', label: 'Electrical' },
    mixed: { icon: 'ph-wrench', color: 'text-purple-500 bg-purple-50', label: 'Mixed' },
    general: { icon: 'ph-hammer', color: 'text-slate-500 bg-slate-50', label: 'General' },
};

// ═══════════════════════════════════════════════════════════════════════════
// FETCH & RENDER
// ═══════════════════════════════════════════════════════════════════════════
async function fetchProjects(append = false): Promise<void> {
    if (state.loading) { return; }
    state.loading = true;

    if (!append) {
        state.offset = 0;
        showView('skeleton');
    }

    try {
        const params: { damage_type?: string; sort_by?: 'funded_percentage' | 'published_at'; limit?: number; offset?: number } = {
            limit: state.limit,
            offset: state.offset,
            sort_by: state.sort as 'funded_percentage' | 'published_at',
        };
        if (state.filter !== 'all') {
            params.damage_type = state.filter;
        }

        const response = await marketplace.getProjects(params);

        if (response.success && Array.isArray(response.data)) {
            const newProjects = response.data as ProjectCard[];

            if (append) {
                state.projects = [...state.projects, ...newProjects];
            } else {
                state.projects = newProjects;
            }

            state.hasMore = newProjects.length >= state.limit;
            state.offset += newProjects.length;

            // Apply client-side search filter
            const displayed = applySearch(state.projects);

            if (displayed.length === 0) {
                showView('empty');
            } else {
                renderProjects(displayed);
                showView('grid');
            }
        } else {
            if (!append) { showView('empty'); }
        }
    } catch {
        if (!append) { showView('error'); }
    } finally {
        state.loading = false;
    }
}

function applySearch(projects: ProjectCard[]): ProjectCard[] {
    if (!state.search) { return projects; }
    const q = state.search.toLowerCase();
    return projects.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.address_text?.toLowerCase().includes(q) ||
        p.damage_type.toLowerCase().includes(q)
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
function showView(view: 'skeleton' | 'grid' | 'empty' | 'error'): void {
    skeleton?.classList.toggle('hidden', view !== 'skeleton');
    grid?.classList.toggle('hidden', view !== 'grid');
    emptyState?.classList.toggle('hidden', view !== 'empty');
    errorState?.classList.toggle('hidden', view !== 'error');
    loadMoreContainer?.classList.toggle('hidden', view !== 'grid' || !state.hasMore);

    // Update count
    if (countEl) {
        const displayed = applySearch(state.projects);
        countEl.textContent = view === 'skeleton'
            ? t('projects_loading', 'Loading...')
            : `${displayed.length} ${t('projects_count', 'projects')}`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER PROJECT CARDS
// ═══════════════════════════════════════════════════════════════════════════
function renderProjects(projects: ProjectCard[]): void {
    if (!grid) { return; }
    grid.innerHTML = '';

    projects.forEach((project, i) => {
        const card = createProjectCard(project, i);
        grid.appendChild(card);
    });
}

function createProjectCard(project: ProjectCard, index: number): HTMLElement {
    const card = document.createElement('a');
    card.href = `project-details.html?id=${encodeURIComponent(project.project_id)}`;
    card.className = 'block glass-card rounded-xl overflow-hidden border border-slate-100 hover:shadow-lg transition-all duration-200 animate-fade-in-up';
    // DEF-REM-004 FIX: CSS custom property replaces inline style.animationDelay.
    // Previous: card.style.animationDelay — violated P1-SST-001.
    card.style.setProperty('--anim-delay', `${index * 0.05}s`);

    const config = damageTypeConfig[project.damage_type] ?? damageTypeConfig['general'] ?? { icon: 'ph-hammer', color: 'text-slate-500 bg-slate-50', label: 'General' };
    const pct = Math.min(100, Math.round(project.funded_percentage ?? 0));
    const urgencyClass = pct < 30 ? 'bg-red-500' : pct < 70 ? 'bg-amber-500' : 'bg-smoky-jade';

    card.innerHTML = `
        <!-- Cover -->
        <div class="relative h-32 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">
            ${project.cover_image_url
                ? `<img src="${esc(project.cover_image_url)}" class="w-full h-full object-cover" alt="" loading="lazy" />`
                : `<div class="flex items-center justify-center h-full"><i class="ph ${esc(config.icon)} text-slate-300 nm-icon-48"  aria-hidden="true"></i></div>`
            }
            <!-- Damage type badge -->
            <span class="absolute top-2 start-2 text-3xs font-bold uppercase px-2 py-0.5 rounded-full ${esc(config.color)}">
                ${esc(project.damage_type)}
            </span>
            <!-- Status badge -->
            ${project.status === 'published'
                ? `<span class="absolute top-2 end-2 text-3xs font-bold uppercase px-2 py-0.5 rounded-full bg-smoky-jade/10 text-smoky-jade">${t('projects_active', 'Active')}</span>`
                : ''
            }
        </div>
        <!-- Content -->
        <div class="p-4">
            <h3 class="text-sm font-bold text-slate-900 mb-1 line-clamp-2">${esc(project.title)}</h3>
            <p class="text-xs text-slate-400 flex items-center gap-1 mb-3">
                <i class="ph ph-map-pin" aria-hidden="true"></i>
                ${esc(project.address_text || t('projects_unknown_location', 'Location not specified'))}
            </p>
            <!-- Funding progress -->
            <div class="flex items-center justify-between text-3xs mb-1.5">
                <span class="font-bold text-slate-700">${pct}% ${t('projects_funded', 'funded')}</span>
                <span class="text-slate-400">${formatCents(project.total_funded ?? 0)} / ${formatCents(project.total_cost ?? 0)}</span>
            </div>
            <div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div class="h-full ${urgencyClass} rounded-full transition-all duration-700 nm-progress-bar" style="--progress:${pct}%"></div>
            </div>
            ${pct < 30 ? `<span class="inline-block mt-2 text-3xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">${t('projects_most_needed', '⚡ Most Needed')}</span>` : ''}
        </div>
    `;

    return card;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// Filter pills
document.querySelectorAll<HTMLButtonElement>('.filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
        // Update active state
        document.querySelectorAll('.filter-pill').forEach((p) => {
            p.classList.remove('filter-pill-active');
            p.classList.add('border-slate-200', 'text-slate-500');
        });
        pill.classList.add('filter-pill-active');
        pill.classList.remove('border-slate-200', 'text-slate-500');

        state.filter = pill.dataset['filter'] ?? 'all';
        void fetchProjects();

        // UX-004 FIX: Centralized haptic feedback (was inline navigator.vibrate(20))
        haptic.light();
    });
});

// Sort
sortSelect?.addEventListener('change', () => {
    state.sort = sortSelect.value;
    void fetchProjects();
});

// Search (debounced)
let searchTimer: ReturnType<typeof setTimeout> | null = null;
searchInput?.addEventListener('input', () => {
    if (searchTimer) { clearTimeout(searchTimer); }
    searchTimer = setTimeout(() => {
        state.search = searchInput.value.trim();
        const displayed = applySearch(state.projects);
        if (displayed.length === 0 && state.projects.length > 0) {
            showView('empty');
        } else if (displayed.length > 0) {
            renderProjects(displayed);
            showView('grid');
        }
    }, 300);
});

// Load more
loadMoreBtn?.addEventListener('click', () => {
    void fetchProjects(true);
});

// Retry
retryBtn?.addEventListener('click', () => {
    void fetchProjects();
});

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
void fetchProjects();
