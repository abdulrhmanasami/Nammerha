/**
 * Nammerha — About Us Page Interactions
 * ═══════════════════════════════════════════════════════════════
 * Report Implementation: "صياغة الهوية السردية لمنظمة غير ربحية"
 *
 * Features:
 *   - Intersection Observer scroll-reveal animations
 *   - Staggered timeline item reveals
 *   - No external dependencies — uses native Web APIs
 *
 * Sustainable UX: Respects prefers-reduced-motion for Syria
 * low-bandwidth/accessibility environments.
 */
import '../styles/main.css';

(function initAboutPage(): void {
    // ─── Respect reduced motion preferences ─────────────────────────────
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
        // Make all sections visible immediately
        document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
            el.style.opacity = '1';
            el.style.transform = 'none';
        });
        return;
    }

    // ─── Initial State: hide elements for reveal ────────────────────────
    const revealTargets = document.querySelectorAll<HTMLElement>('[data-reveal]');
    revealTargets.forEach((el) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    });

    // ─── Intersection Observer: Scroll-Reveal ───────────────────────────
    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const target = entry.target as HTMLElement;
                    target.style.opacity = '1';
                    target.style.transform = 'translateY(0)';
                    revealObserver.unobserve(target);
                }
            });
        },
        {
            threshold: 0.15,
            rootMargin: '0px 0px -40px 0px',
        }
    );

    revealTargets.forEach((el) => {
        revealObserver.observe(el);
    });

    // ─── Timeline Items: Staggered Delay ────────────────────────────────
    const timelineItems = document.querySelectorAll<HTMLElement>('.about-timeline-item');
    timelineItems.forEach((item, index) => {
        item.style.transitionDelay = `${index * 150}ms`;
    });
})();
