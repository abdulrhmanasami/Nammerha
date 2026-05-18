/** @type {import('tailwindcss').Config} */
export default {
    future: { hoverOnlyWhenSupported: true },
    content: [
        './*.html',
        './src/**/*.{ts,js}',
    ],

    // ─── SYS-003 FIX: PurgeCSS Dynamic Class Safelist (Defense-in-Depth) ────
    // WHY: Tailwind's JIT scanner matches class names via static regex in content
    // files. It CAN find string literals inside TS Record maps and ternaries.
    // HOWEVER: This safelist guarantees survival of dynamically-applied classes
    // regardless of scanner regex edge cases or Tailwind version upgrades.
    //
    // SOURCES AUDITED:
    //   - status-colors.ts: statusColor, escrowColor, tradeColor, urgencyColor,
    //     bidColor, phaseColor, availabilityColor, supplierStatusColor
    //   - admin-dashboard.ts: progressColor, textColor, auditIcon()
    //   - project-details.ts: COLOR_CLASSES, ACTION_COLORS
    //   - projects.ts: urgencyClass
    //   - welcome-chooser.ts: bgClass, colorClass
    //   - notification-panel.ts: TYPE_CONFIG
    //   - admin-kyc.ts: bgClass, iconClass, textClass
    //   - admin-oracle.ts: colorClass
    //   - admin-revenue.ts: statusClass
    //   - workspace-map.ts: colorClass
    //   - contractor-dashboard.ts / admin-dashboard.ts: progressColor
    //
    // RULE: When adding a new dynamic class in a TS file, ADD IT HERE.
    // ────────────────────────────────────────────────────────────────────────────
    safelist: [
        // ── Custom Brand Colors (all dynamic utility variants) ──────────────
        // trust-blue
        'bg-trust-blue', 'text-trust-blue', 'from-trust-blue/10',
        'bg-trust-blue/10', 'text-trust-blue/40',
        'dark:bg-trust-blue/20',
        // smoky-jade
        'bg-smoky-jade', 'text-smoky-jade', 'from-smoky-jade/10',
        'bg-smoky-jade/10', 'text-smoky-jade/40',
        'dark:bg-smoky-jade/10',
        // warm-earth
        'text-warm-earth', 'from-warm-earth/10',
        'bg-warm-earth/10', 'text-warm-earth/40',
        'dark:bg-warm-earth/20',
        // warning-yellow
        'bg-warning-yellow', 'text-warning-yellow',
        'bg-warning-yellow/10', 'text-warning-yellow',

        // ── Status Badge Colors (status-colors.ts) ──────────────────────────
        // Used in statusColor(), bidColor(), phaseColor(), escrowColor(), etc.
        // These appear inside Record<string, string> maps and are interpolated
        // into template literals via ${statusColor(s)} — scanner may miss.
        'bg-slate-100', 'text-slate-400', 'text-slate-500', 'text-slate-600',
        'bg-blue-100', 'text-blue-700',
        'bg-amber-100', 'text-amber-700',
        'bg-indigo-100', 'text-indigo-700',
        'bg-purple-100', 'text-purple-700',
        'bg-cyan-100', 'text-cyan-700',
        'bg-teal-100', 'text-teal-700',
        'bg-green-100', 'text-green-700',
        'bg-red-100', 'text-red-600', 'text-red-700',
        'bg-emerald-100', 'text-emerald-700',
        'bg-yellow-100', 'text-yellow-700',
        'bg-orange-100', 'text-orange-700',
        'bg-stone-200', 'text-stone-700',
        'bg-sky-100', 'text-sky-700',

        // ── Progress Bar Dynamic Colors (admin/contractor dashboards) ───────
        'bg-red-500', 'bg-amber-500',

        // ── Admin Audit Icon Colors (admin-dashboard.ts auditIcon()) ────────
        'bg-rose-50', 'text-rose-500', 'text-rose-600',

        // ── Welcome Chooser Dynamic Classes ─────────────────────────────────
        'text-purple-600', 'dark:text-purple-400',
        'bg-purple-600/10', 'dark:bg-purple-400/20',
        'dark:text-emerald-400', 'dark:bg-emerald-400/20',

        // ── Notification Panel TYPE_CONFIG Colors ───────────────────────────
        'text-emerald-600', 'text-green-600', 'text-amber-600',
        'text-blue-600', 'text-indigo-600', 'text-purple-600',
        'text-teal-600',

        // ── Project Activity Timeline (ACTION_COLORS) ───────────────────────
        'text-yellow-500',

        // ── Supplier PO Status (supplierStatusColor) ────────────────────────
        'bg-smoky-jade/10', 'text-smoky-jade',
    ],
    darkMode: ['selector', '[data-theme="dark"]'],
    theme: {
        extend: {
            /* TW-001 FIX: Design System Typography Floor Token.
               Previous: 390× `text-[10px]` arbitrary JIT values across 50 files.
               Now: Semantic `text-3xs` token — INC-002 governance minimum (10px).
               Standard: Design System Token Governance, Tailwind Best Practices. */
            fontSize: {
                '3xs': ['0.625rem', { lineHeight: '1rem' }],
            },
            colors: {
                /* ─── Brand Identity (Visual Identity PDF — Source of Truth) ─── */
                'trust-blue': '#1558D6',  // Primary: CTAs, financial buttons (Platinum Standard)
                'smoky-jade': '#0A6E55',  // Progress bars, success states, milestones (Platinum Standard)
                'cloud-white': '#F4F6F8',  // Backgrounds — "Radical Transparency"
                'warm-earth': '#D59F80',  // Accent — Syrian stone (emotional bridge)
                'dark-tech': '#242424',  // Engineer dark mode background
                'warning-yellow': '#FCC934',  // Red flags, snagging reports

                /* ─── Semantic Aliases ─── */
                'primary': '#1558D6',
                'primary-hover': '#0D47A1',
                'background-light': '#F4F6F8',
                'background-dark': '#242424',
                'surface': '#FFFFFF',
                'surface-dark': '#2A2A2A',

                /* ─── Dark Mode Elevational Tokens ─── */
                'dark-surface': '#1E1E1E',
                'dark-elevated': '#2A2A2A',
                'dark-base': '#242424',
                'dark-border': 'rgba(255, 255, 255, 0.08)',
                'dark-border-subtle': 'rgba(255, 255, 255, 0.06)',
                'dark-track': '#334155',
            },
            fontFamily: {
                'display': ['"Plus Jakarta Sans"', 'sans-serif'],
                'arabic': ['"IBM Plex Sans Arabic"', '"Kufam"', 'sans-serif'],
            },
            borderRadius: {
                'DEFAULT': '0.5rem',
                'lg': '0.75rem',
                'xl': '1rem',
                '2xl': '1.5rem',
                'full': '9999px',
            },
            boxShadow: {
                'glass': '0 8px 32px 0 rgba(21, 88, 214, 0.05)',
                'glass-lg': '0 8px 32px 0 rgba(21, 88, 214, 0.1)',
                'elevation': '0 2px 8px rgba(0, 0, 0, 0.08)',
                'cta': '0 4px 16px rgba(21, 88, 214, 0.25)',
            },
            spacing: {
                '18': '4.5rem',
                '22': '5.5rem',
            },
        },
    },
    plugins: [],
};
