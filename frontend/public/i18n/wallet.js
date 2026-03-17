/**
 * Nammerha i18n — wallet dictionary chunk
 * INC-002 FIX: Dedicated wallet page dictionary (was incorrectly loading profile.js).
 * Keys: 15 (wallet-specific keys extracted from profile.js + new keys)
 */
(function () {
    'use strict';
    if (typeof window.__nmDictMerge === 'function') {
        window.__nmDictMerge({
        'wallet_title': { ar: 'المحفظة', de: 'Geldbörse', fr: 'Portefeuille', tr: 'Cüzdan' },
        'total_escrow': { ar: 'إجمالي رصيد الضمان', de: 'Gesamtes Treuhandguthaben', fr: 'Solde total d\'entiercement', tr: 'Toplam Emanet Bakiyesi' },
        'locked_items': { ar: '0 محجوز', de: '0 gesperrt', fr: '0 verrouillé', tr: '0 kilitli' },
        'released_items': { ar: '0 محرر', de: '0 freigegeben', fr: '0 libéré', tr: '0 serbest' },
        'donate': { ar: 'تبرّع', de: 'Spenden', fr: 'Donner', tr: 'Bağışla' },
        'receipts': { ar: 'إيصالات', de: 'Quittungen', fr: 'Reçus', tr: 'Makbuzlar' },
        'impact': { ar: 'الأثر', de: 'Wirkung', fr: 'Impact', tr: 'Etki' },
        'recent_transactions': { ar: 'المعاملات الأخيرة', de: 'Letzte Transaktionen', fr: 'Transactions récentes', tr: 'Son İşlemler' },
        'wallet_locked': { ar: 'محجوز', de: 'gesperrt', fr: 'verrouillé', tr: 'kilitli' },
        'wallet_released': { ar: 'محرّر', de: 'freigegeben', fr: 'libéré', tr: 'serbest' },
        'wallet_status_locked': { ar: 'محجوز', de: 'Gesperrt', fr: 'Verrouillé', tr: 'Kilitli' },
        'wallet_status_released': { ar: 'محرّر', de: 'Freigegeben', fr: 'Libéré', tr: 'Serbest' },
        'wallet_status_refunded': { ar: 'مُستردّ', de: 'Erstattet', fr: 'Remboursé', tr: 'İade Edildi' },
        'wallet_status_completed': { ar: 'مكتمل', de: 'Abgeschlossen', fr: 'Terminé', tr: 'Tamamlandı' },
        'wallet_status_pending': { ar: 'معلّق', de: 'Ausstehend', fr: 'En attente', tr: 'Beklemede' },
        'wallet_transaction': { ar: 'معاملة', de: 'Transaktion', fr: 'Transaction', tr: 'İşlem' },
        'wallet_no_transactions': { ar: 'لا توجد معاملات بعد', de: 'Noch keine Transaktionen', fr: 'Aucune transaction pour le moment', tr: 'Henüz işlem yok' },
        'wallet_history_description': { ar: 'سيظهر سجل تبرعاتك ومدفوعاتك هنا', de: 'Ihr Spenden- und Zahlungsverlauf erscheint hier', fr: 'Votre historique de dons et paiements apparaîtra ici', tr: 'Bağış ve ödeme geçmişiniz burada görünecek' },
        'wallet_load_failed': { ar: 'تعذّر تحميل المعاملات. يرجى تسجيل الدخول.', de: 'Transaktionen konnten nicht geladen werden. Bitte melden Sie sich an.', fr: 'Impossible de charger les transactions. Veuillez vous connecter.', tr: 'İşlemler yüklenemedi. Lütfen giriş yapın.' },
        'wallet_sign_in': { ar: 'تسجيل الدخول', de: 'Anmelden', fr: 'Se connecter', tr: 'Giriş Yap' }
        });
    }
})();
