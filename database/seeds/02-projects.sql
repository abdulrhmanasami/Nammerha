-- Nammerha Demo Seed: Projects with real GPS coordinates across Syria

-- PRODUCTION SAFETY GUARD: Prevent accidental execution in production
DO $$
BEGIN
  IF current_setting('server_version_num')::int > 0 THEN
    IF EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datname LIKE '%prod%') THEN
      RAISE EXCEPTION '[SAFETY] 02-projects.sql must NEVER run in production. Aborting.';
    END IF;
  END IF;
  IF current_setting('app.environment', true) = 'production' THEN
    RAISE EXCEPTION '[SAFETY] 02-projects.sql must NEVER run in production. Aborting.';
  END IF;
END $$;

BEGIN;

INSERT INTO projects (project_id, homeowner_id, assigned_engineer_id, title, description, cover_image_url, gps_location, address_text, damage_type, damage_severity, status, is_public, total_estimated_cost, total_funded_amount, ocds_release_id, published_at, completed_at, created_at, updated_at, project_type) VALUES
('DEMO-ALP-001','d0000001-0000-0000-0000-000000000001','d0000003-0000-0000-0000-000000000001',
 'ترميم منزل عائلة الحلبي — صلاح الدين',
 'ترميم منزل سكني مؤلف من 3 طوابق تعرض لأضرار هيكلية جزئية. يشمل تعزيز الأعمدة والجسور، إعادة البناء الجزئي للجدران، وإصلاح شبكات الكهرباء والمياه.',
 'https://images.unsplash.com/photo-1542621334-a254cf47733d?w=800',
 ST_SetSRID(ST_MakePoint(37.1543,36.2121),4326),'حلب — صلاح الدين','structural','severe','in_progress',true,
 1850000,1350500,'ocds-nm-ALP001',NOW()-INTERVAL '45 days',NULL,NOW()-INTERVAL '60 days',NOW()-INTERVAL '2 days','humanitarian'),

('DEMO-ALP-002','d0000001-0000-0000-0000-000000000001',NULL,
 'مركز إيواء مؤقت — الأعظمية',
 'بناء مركز إيواء مؤقت يتسع لـ 50 عائلة نازحة، مع مرافق صحية ومطبخ مشترك.',
 'https://images.unsplash.com/photo-1590074072786-a66914d668f1?w=800',
 ST_SetSRID(ST_MakePoint(37.1200,36.2300),4326),'حلب — الأعظمية','structural','total_destruction','completed',true,
 1550000,1550000,'ocds-nm-ALP002',NOW()-INTERVAL '120 days',NOW()-INTERVAL '15 days',NOW()-INTERVAL '150 days',NOW()-INTERVAL '15 days','humanitarian'),

('DEMO-DMS-001','d0000001-0000-0000-0000-000000000002','d0000003-0000-0000-0000-000000000002',
 'إصلاح بناء سكني — جوبر',
 'إصلاح أضرار سطحية في بناء من 5 طوابق. تشقق جدران، أضرار في الواجهة، وإصلاح نوافذ.',
 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800',
 ST_SetSRID(ST_MakePoint(36.3465,33.5238),4326),'دمشق — جوبر','mixed','moderate','completed',true,
 820000,820000,'ocds-nm-DMS001',NOW()-INTERVAL '90 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '100 days',NOW()-INTERVAL '10 days','commercial'),

('DEMO-DMS-002','d0000001-0000-0000-0000-000000000002',NULL,
 'ترميم منزل تراثي — باب توما',
 'ترميم منزل عربي تراثي بفناء داخلي. الحفاظ على الطابع المعماري مع تحديث البنية التحتية.',
 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800',
 ST_SetSRID(ST_MakePoint(36.3165,33.5120),4326),'دمشق — باب توما','mixed','minor','published',true,
 2300000,184000,'ocds-nm-DMS002',NOW()-INTERVAL '5 days',NULL,NOW()-INTERVAL '10 days',NOW()-INTERVAL '1 day','commercial'),

('DEMO-HMS-001','d0000001-0000-0000-0000-000000000003','d0000003-0000-0000-0000-000000000001',
 'ترميم حي الوعر — المرحلة الأولى',
 'إعادة إعمار مجمع سكني من 8 شقق في حي الوعر. تدمير شبه كامل يتطلب إعادة بناء.',
 'https://images.unsplash.com/photo-1569982175971-d92b01cf8694?w=800',
 ST_SetSRID(ST_MakePoint(36.6837,34.7524),4326),'حمص — الوعر','structural','total_destruction','in_progress',true,
 34000000,10540000,'ocds-nm-HMS001',NOW()-INTERVAL '30 days',NULL,NOW()-INTERVAL '40 days',NOW()-INTERVAL '3 days','humanitarian'),

('DEMO-HMS-002','d0000001-0000-0000-0000-000000000003',NULL,
 'إعادة بناء مدرسة الأمل — بابا عمرو',
 'إعادة بناء مدرسة ابتدائية تتسع لـ 400 طالب. تشمل 12 فصلاً دراسياً ومختبراً وملعباً.',
 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800',
 ST_SetSRID(ST_MakePoint(36.6500,34.7200),4326),'حمص — بابا عمرو','structural','total_destruction','published',true,
 12500000,5625000,'ocds-nm-HMS002',NOW()-INTERVAL '15 days',NULL,NOW()-INTERVAL '20 days',NOW()-INTERVAL '2 days','humanitarian'),

('DEMO-HMA-001','d0000001-0000-0000-0000-000000000008',NULL,
 'ترميم جامع أبي الفداء — حماة',
 'ترميم مسجد تاريخي يعود للقرن الـ 14. تعزيز الأساسات وإصلاح القبة والمئذنة.',
 'https://images.unsplash.com/photo-1564769625905-50e93615e769?w=800',
 ST_SetSRID(ST_MakePoint(36.7575,35.1318),4326),'حماة — المدينة القديمة','structural','severe','published',true,
 6700000,1876000,'ocds-nm-HMA001',NOW()-INTERVAL '8 days',NULL,NOW()-INTERVAL '12 days',NOW()-INTERVAL '1 day','humanitarian'),

('DEMO-RQA-001','d0000001-0000-0000-0000-000000000004','d0000003-0000-0000-0000-000000000003',
 'إصلاح شبكة مياه — الرقة',
 'إعادة تأهيل شبكة المياه المركزية. استبدال 8 كم من الأنابيب المتضررة وتركيب محطة تنقية.',
 'https://images.unsplash.com/photo-1504308805006-0f7a5f1f0f71?w=800',
 ST_SetSRID(ST_MakePoint(39.0068,35.9528),4326),'الرقة — المركز','plumbing','severe','in_progress',true,
 5200000,3484000,'ocds-nm-RQA001',NOW()-INTERVAL '25 days',NULL,NOW()-INTERVAL '35 days',NOW()-INTERVAL '4 days','humanitarian'),

('DEMO-DEZ-001','d0000001-0000-0000-0000-000000000005',NULL,
 'ترميم سوق الهال — دير الزور',
 'ترميم السوق المركزي التاريخي. إعادة بناء 25 محلاً تجارياً مع بنية تحتية حديثة.',
 'https://images.unsplash.com/photo-1567449303078-57ad995bd17a?w=800',
 ST_SetSRID(ST_MakePoint(40.1408,35.3359),4326),'دير الزور — المركز','mixed','severe','published',true,
 9500000,2850000,'ocds-nm-DEZ001',NOW()-INTERVAL '7 days',NULL,NOW()-INTERVAL '14 days',NOW()-INTERVAL '1 day','commercial'),

('DEMO-IDL-001','d0000001-0000-0000-0000-000000000007',NULL,
 'بناء عيادة صحية — معرة النعمان',
 'بناء عيادة صحية أولية تخدم 15,000 نسمة. تشمل عيادة أطفال، مختبر، وصيدلية.',
 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800',
 ST_SetSRID(ST_MakePoint(36.6747,35.6506),4326),'إدلب — معرة النعمان','structural','total_destruction','published',true,
 4500000,540000,'ocds-nm-IDL001',NOW()-INTERVAL '3 days',NULL,NOW()-INTERVAL '7 days',NOW(),'humanitarian'),

('DEMO-DRA-001','d0000001-0000-0000-0000-000000000006','d0000003-0000-0000-0000-000000000002',
 'ترميم مخبز آلي — درعا',
 'إعادة تأهيل مخبز آلي يخدم 10,000 شخص يومياً. إصلاح الأفران وخطوط الإنتاج.',
 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800',
 ST_SetSRID(ST_MakePoint(36.1050,32.6265),4326),'درعا — المركز','electrical','moderate','in_progress',true,
 1100000,979000,'ocds-nm-DRA001',NOW()-INTERVAL '20 days',NULL,NOW()-INTERVAL '28 days',NOW()-INTERVAL '5 days','commercial'),

('DEMO-QNT-001','d0000001-0000-0000-0000-000000000006',NULL,
 'إعادة بناء مدرسة — القنيطرة',
 'بناء مدرسة إعدادية جديدة تتسع لـ 300 طالب في القنيطرة.',
 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800',
 ST_SetSRID(ST_MakePoint(35.8237,33.1260),4326),'القنيطرة','structural','total_destruction','published',true,
 18000000,900000,'ocds-nm-QNT001',NOW()-INTERVAL '2 days',NULL,NOW()-INTERVAL '5 days',NOW(),'humanitarian'),

('DEMO-LAT-001','d0000001-0000-0000-0000-000000000008',NULL,
 'ترميم جسر المشاة — اللاذقية',
 'ترميم جسر مشاة يربط حيين سكنيين فوق نهر.',
 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=800',
 ST_SetSRID(ST_MakePoint(35.7796,35.5317),4326),'اللاذقية','structural','minor','completed',true,
 2800000,2800000,'ocds-nm-LAT001',NOW()-INTERVAL '180 days',NOW()-INTERVAL '30 days',NOW()-INTERVAL '200 days',NOW()-INTERVAL '30 days','commercial'),

('DEMO-TRT-001','d0000001-0000-0000-0000-000000000004','d0000003-0000-0000-0000-000000000003',
 'بناء ملعب أطفال — طرطوس',
 'بناء ملعب أطفال آمن مع مساحات خضراء في حي سكني.',
 'https://images.unsplash.com/photo-1596997000103-e597b3ca50df?w=800',
 ST_SetSRID(ST_MakePoint(35.8867,34.8959),4326),'طرطوس','mixed','minor','in_progress',true,
 950000,399000,'ocds-nm-TRT001',NOW()-INTERVAL '12 days',NULL,NOW()-INTERVAL '18 days',NOW()-INTERVAL '2 days','commercial'),

('DEMO-SWD-001','d0000001-0000-0000-0000-000000000005',NULL,
 'ترميم مستشفى — السويداء',
 'ترميم جناح الطوارئ في المستشفى الوطني. إصلاح غرف العمليات والأجهزة الطبية.',
 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?w=800',
 ST_SetSRID(ST_MakePoint(36.5631,32.7088),4326),'السويداء','electrical','severe','published',true,
 22000000,3300000,'ocds-nm-SWD001',NOW()-INTERVAL '4 days',NULL,NOW()-INTERVAL '8 days',NOW(),'humanitarian')
ON CONFLICT (project_id) DO NOTHING;

COMMIT;
