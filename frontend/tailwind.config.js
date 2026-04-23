/** @type {import('tailwindcss').Config} */
export default {
    future: { hoverOnlyWhenSupported: true },
    content: [
        './*.html',
        './src/**/*.{ts,js}',
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
