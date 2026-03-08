/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './*.html',
        './src/**/*.{ts,js}',
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                /* ─── Brand Identity (Visual Identity PDF — Source of Truth) ─── */
                'trust-blue': '#1A73E8',  // Primary: CTAs, financial buttons
                'smoky-jade': '#109173',  // Progress bars, success states, milestones
                'cloud-white': '#F4F6F8',  // Backgrounds — "Radical Transparency"
                'warm-earth': '#D59F80',  // Accent — Syrian stone (emotional bridge)
                'dark-tech': '#242424',  // Engineer dark mode background
                'warning-yellow': '#FCC934',  // Red flags, snagging reports

                /* ─── Semantic Aliases ─── */
                'primary': '#1A73E8',
                'primary-hover': '#1557B0',
                'background-light': '#F4F6F8',
                'background-dark': '#242424',
                'surface': '#FFFFFF',
                'surface-dark': '#2A2A2A',
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
                'glass': '0 8px 32px 0 rgba(26, 115, 232, 0.05)',
                'glass-lg': '0 8px 32px 0 rgba(26, 115, 232, 0.1)',
                'elevation': '0 2px 8px rgba(0, 0, 0, 0.08)',
                'cta': '0 4px 16px rgba(26, 115, 232, 0.25)',
            },
            spacing: {
                '18': '4.5rem',
                '22': '5.5rem',
            },
        },
    },
    plugins: [],
};
