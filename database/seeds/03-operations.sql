-- Nammerha Demo Seed Part 3: Operations (FIXED schema)

-- PRODUCTION SAFETY GUARD: Prevent accidental execution in production
DO $$
BEGIN
  IF current_setting('server_version_num')::int > 0 THEN
    IF EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datname LIKE '%prod%') THEN
      RAISE EXCEPTION '[SAFETY] 03-operations.sql must NEVER run in production. Aborting.';
    END IF;
  END IF;
  IF current_setting('app.environment', true) = 'production' THEN
    RAISE EXCEPTION '[SAFETY] 03-operations.sql must NEVER run in production. Aborting.';
  END IF;
END $$;

BEGIN;

-- ═══ MILESTONES ═══
INSERT INTO project_milestones (project_id, title, description, sequence_number, status, estimated_cost, actual_cost, started_at, completed_at) VALUES
('DEMO-ALP-001','تقييم الأضرار الهيكلية','فحص شامل للأعمدة والجسور',1,'completed',180000,175000,NOW()-INTERVAL '55 days',NOW()-INTERVAL '48 days'),
('DEMO-ALP-001','تعزيز الأساسات','حقن الأساسات بالخرسانة',2,'completed',520000,535000,NOW()-INTERVAL '47 days',NOW()-INTERVAL '30 days'),
('DEMO-ALP-001','إعادة بناء الجدران','بناء الجدران المتضررة',3,'in_progress',650000,NULL,NOW()-INTERVAL '29 days',NULL),
('DEMO-ALP-001','التشطيبات','كهرباء، سباكة، دهان',4,'pending',500000,NULL,NULL,NULL),
('DEMO-ALP-002','تحضير الموقع','إزالة الأنقاض',1,'completed',200000,195000,NOW()-INTERVAL '140 days',NOW()-INTERVAL '125 days'),
('DEMO-ALP-002','الهيكل الإنشائي','صب الأساسات والأعمدة',2,'completed',650000,670000,NOW()-INTERVAL '124 days',NOW()-INTERVAL '80 days'),
('DEMO-ALP-002','المرافق الصحية','دورات المياه والمطبخ',3,'completed',350000,340000,NOW()-INTERVAL '79 days',NOW()-INTERVAL '40 days'),
('DEMO-ALP-002','التأثيث والتسليم','تأثيث الوحدات',4,'completed',350000,345000,NOW()-INTERVAL '39 days',NOW()-INTERVAL '15 days'),
('DEMO-HMS-001','إزالة الأنقاض','إزالة 2000 م³',1,'completed',3500000,3400000,NOW()-INTERVAL '38 days',NOW()-INTERVAL '25 days'),
('DEMO-HMS-001','الأساسات الجديدة','حفر وصب أساسات',2,'in_progress',8500000,NULL,NOW()-INTERVAL '24 days',NULL),
('DEMO-HMS-001','البناء الهيكلي','بناء الهيكل الخرساني',3,'pending',14000000,NULL,NULL,NULL),
('DEMO-HMS-001','التشطيب والتسليم','تشطيبات وتسليم',4,'pending',8000000,NULL,NULL,NULL),
('DEMO-RQA-001','مسح الشبكة','مسح كامل لشبكة المياه',1,'completed',400000,380000,NOW()-INTERVAL '33 days',NOW()-INTERVAL '28 days'),
('DEMO-RQA-001','استبدال الأنابيب','استبدال 8 كم أنابيب',2,'completed',2800000,2900000,NOW()-INTERVAL '27 days',NOW()-INTERVAL '12 days'),
('DEMO-RQA-001','محطة التنقية','تركيب محطة تنقية',3,'in_progress',1500000,NULL,NOW()-INTERVAL '11 days',NULL),
('DEMO-RQA-001','الاختبار والتشغيل','اختبار ضغط وتشغيل',4,'pending',500000,NULL,NULL,NULL),
('DEMO-DRA-001','تقييم المعدات','فحص الأفران',1,'completed',80000,75000,NOW()-INTERVAL '26 days',NOW()-INTERVAL '23 days'),
('DEMO-DRA-001','إصلاح الأفران','إصلاح 4 أفران',2,'completed',450000,460000,NOW()-INTERVAL '22 days',NOW()-INTERVAL '12 days'),
('DEMO-DRA-001','الكهرباء والتحكم','لوحات التحكم',3,'in_progress',350000,NULL,NOW()-INTERVAL '11 days',NULL),
('DEMO-DRA-001','التشغيل التجريبي','تشغيل تجريبي أسبوع',4,'pending',220000,NULL,NULL,NULL),
('DEMO-TRT-001','تحضير الموقع','تنظيف وتسوية',1,'completed',120000,115000,NOW()-INTERVAL '16 days',NOW()-INTERVAL '12 days'),
('DEMO-TRT-001','الألعاب والمرافق','تركيب الألعاب',2,'in_progress',380000,NULL,NOW()-INTERVAL '11 days',NULL),
('DEMO-TRT-001','المساحات الخضراء','زراعة أشجار',3,'pending',250000,NULL,NULL,NULL),
('DEMO-TRT-001','السلامة والتسليم','أرضيات مطاطية',4,'pending',200000,NULL,NULL,NULL)
ON CONFLICT DO NOTHING;

-- ═══ BOQ ITEMS (material_name is NOT NULL) ═══
INSERT INTO itemized_boq (item_id, project_id, material_name, material_category, description, unit, unit_price, required_quantity, funded_amount, status, created_by) VALUES
(gen_random_uuid(),'DEMO-ALP-001','حديد تسليح Ø12','structural','حديد تسليح قطر 12 مم للتعزيز الهيكلي','طن',85000,3.50,297500,'verified','d0000003-0000-0000-0000-000000000001'),
(gen_random_uuid(),'DEMO-ALP-001','إسمنت بورتلاندي','structural','إسمنت عالي الجودة للصب','طن',12000,12.00,144000,'verified','d0000003-0000-0000-0000-000000000001'),
(gen_random_uuid(),'DEMO-ALP-001','بلوك إسمنتي 20×20×40','structural','بلوك بناء قياسي','قطعة',85,2500.00,150000,'verified','d0000003-0000-0000-0000-000000000001'),
(gen_random_uuid(),'DEMO-ALP-001','رمل مغسول','structural','رمل نظيف للخرسانة','م³',2500,18.00,45000,'verified','d0000003-0000-0000-0000-000000000001'),
(gen_random_uuid(),'DEMO-ALP-001','أعمال كهرباء كاملة','electrical','تمديدات ولوحات كهربائية','مقطوعية',180000,1.00,0,'pending_verification','d0000003-0000-0000-0000-000000000001'),
(gen_random_uuid(),'DEMO-ALP-001','أعمال صحية كاملة','plumbing','تمديدات مياه وصرف صحي','مقطوعية',220000,1.00,100000,'pending_verification','d0000003-0000-0000-0000-000000000001'),
(gen_random_uuid(),'DEMO-ALP-001','دهان أكريليك','finishing','دهان داخلي وخارجي','م²',450,350.00,0,'pending_verification','d0000003-0000-0000-0000-000000000001'),
(gen_random_uuid(),'DEMO-HMS-001','حديد تسليح Ø16','structural','حديد تسليح قطر 16 للأعمدة','طن',90000,45.00,2000000,'verified','d0000003-0000-0000-0000-000000000001'),
(gen_random_uuid(),'DEMO-HMS-001','خرسانة جاهزة B350','structural','خرسانة جاهزة عالية المقاومة','م³',15000,280.00,1500000,'verified','d0000003-0000-0000-0000-000000000001'),
(gen_random_uuid(),'DEMO-HMS-001','طابوق حراري','structural','طابوق مقاوم للحرارة','قطعة',120,15000.00,500000,'verified','d0000003-0000-0000-0000-000000000001'),
(gen_random_uuid(),'DEMO-HMS-001','ألمنيوم نوافذ','finishing','نوافذ ألمنيوم مزدوجة','م²',25000,320.00,0,'pending_verification','d0000003-0000-0000-0000-000000000001'),
(gen_random_uuid(),'DEMO-RQA-001','أنابيب PVC Ø200','plumbing','أنابيب مياه بقطر 200 مم','م.ط',350,8000.00,2800000,'verified','d0000003-0000-0000-0000-000000000003'),
(gen_random_uuid(),'DEMO-RQA-001','محطة تنقية مياه','equipment','محطة تنقية كاملة','وحدة',1500000,1.00,400000,'verified','d0000003-0000-0000-0000-000000000003'),
(gen_random_uuid(),'DEMO-RQA-001','حفر وردم','earthwork','أعمال حفر وردم للأنابيب','م³',250,1200.00,284000,'verified','d0000003-0000-0000-0000-000000000003'),
(gen_random_uuid(),'DEMO-DRA-001','فرن صناعي آلي','equipment','فرن خبز صناعي','وحدة',200000,2.00,400000,'verified','d0000003-0000-0000-0000-000000000002'),
(gen_random_uuid(),'DEMO-DRA-001','لوحة تحكم كهربائي','electrical','لوحة تحكم رئيسية PLC','وحدة',180000,1.00,150000,'verified','d0000003-0000-0000-0000-000000000002'),
(gen_random_uuid(),'DEMO-DRA-001','كابلات نحاسية 16mm²','electrical','كابلات طاقة نحاسية','م.ط',300,500.00,100000,'verified','d0000003-0000-0000-0000-000000000002'),
(gen_random_uuid(),'DEMO-TRT-001','أرضية مطاطية أمان','safety','أرضية مطاطية للأطفال','م²',1500,200.00,200000,'verified','d0000003-0000-0000-0000-000000000003'),
(gen_random_uuid(),'DEMO-TRT-001','ألعاب أطفال معدنية','equipment','مجموعة ألعاب معدنية','مجموعة',250000,1.00,100000,'verified','d0000003-0000-0000-0000-000000000003'),
(gen_random_uuid(),'DEMO-TRT-001','إنارة LED خارجية','electrical','أعمدة إنارة LED','وحدة',8000,12.00,0,'pending_verification','d0000003-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

-- ═══ CONTRACTOR BIDS ═══
INSERT INTO contractor_bids (engineer_id, project_id, proposed_cost, currency, estimated_days, cover_letter, status, engineer_score_snapshot) VALUES
('d0000004-0000-0000-0000-000000000001','DEMO-ALP-001',1750000,'USD',90,'نملك خبرة واسعة في ترميم أبنية حلب.','accepted',91.20),
('d0000004-0000-0000-0000-000000000002','DEMO-ALP-001',1920000,'USD',75,'فريقنا متخصص في الترميم السريع.','rejected',78.50),
('d0000004-0000-0000-0000-000000000001','DEMO-HMS-001',32000000,'USD',180,'مشروع كبير نملك القدرة على تنفيذه.','accepted',91.20),
('d0000004-0000-0000-0000-000000000003','DEMO-HMS-001',35500000,'USD',200,'عرض تنافسي مع التزام بالجودة.','pending',70.00),
('d0000004-0000-0000-0000-000000000002','DEMO-RQA-001',5000000,'USD',60,'متخصصون في البنية التحتية المائية.','accepted',78.50),
('d0000004-0000-0000-0000-000000000001','DEMO-DRA-001',1050000,'USD',45,'خبرة في المشاريع الصناعية.','accepted',91.20),
('d0000004-0000-0000-0000-000000000003','DEMO-DRA-001',1180000,'USD',50,'عرض شامل مع ضمان سنة.','pending',70.00),
('d0000004-0000-0000-0000-000000000001','DEMO-TRT-001',900000,'USD',30,'مشروع صغير ننجزه بسرعة.','accepted',91.20),
('d0000004-0000-0000-0000-000000000002','DEMO-HMS-002',12000000,'USD',120,'خبرة في بناء المدارس.','pending',78.50),
('d0000004-0000-0000-0000-000000000003','DEMO-DEZ-001',9200000,'USD',150,'متخصصون في المباني التجارية.','pending',70.00),
('d0000004-0000-0000-0000-000000000001','DEMO-IDL-001',4300000,'USD',90,'خبرة في بناء المرافق الصحية.','pending',91.20),
('d0000004-0000-0000-0000-000000000002','DEMO-SWD-001',21000000,'USD',240,'فريق كبير للمشاريع الصحية.','pending',78.50)
ON CONFLICT DO NOTHING;

-- ═══ PRICING ORACLE ═══
INSERT INTO pricing_oracle_entries (material_category, material_name, unit, base_price, current_price, price_change_pct, region, source, volatility_index, confidence_score, valid_until) VALUES
('structural','حديد تسليح Ø12','طن',80000,85000,6.25,'حلب','وزارة التجارة الداخلية',12.50,85.00,NOW()+INTERVAL '30 days'),
('structural','حديد تسليح Ø16','طن',85000,90000,5.88,'دمشق','بورصة المعادن',10.20,88.00,NOW()+INTERVAL '30 days'),
('structural','إسمنت بورتلاندي','طن',10000,12000,20.00,'حمص','غرفة التجارة',18.50,75.00,NOW()+INTERVAL '15 days'),
('structural','خرسانة جاهزة B350','م³',13000,15000,15.38,'دمشق','اتحاد المقاولين',8.30,90.00,NOW()+INTERVAL '30 days'),
('structural','بلوك إسمنتي','قطعة',75,85,13.33,'حلب','السوق المحلي',15.00,70.00,NOW()+INTERVAL '15 days'),
('structural','رمل مغسول','م³',2000,2500,25.00,'حمص','السوق المحلي',20.00,65.00,NOW()+INTERVAL '7 days'),
('plumbing','أنابيب PVC Ø200','م.ط',300,350,16.67,'الرقة','موردون محليون',14.00,72.00,NOW()+INTERVAL '30 days'),
('electrical','كابلات نحاسية','م.ط',250,300,20.00,'درعا','بورصة النحاس',22.00,80.00,NOW()+INTERVAL '15 days'),
('finishing','دهان أكريليك','لتر',800,950,18.75,'دمشق','وكلاء معتمدون',10.00,85.00,NOW()+INTERVAL '30 days'),
('finishing','بلاط سيراميك 40×40','م²',3500,4200,20.00,'حلب','مصانع محلية',12.00,78.00,NOW()+INTERVAL '30 days'),
('equipment','مولد كهرباء 50KVA','وحدة',1200000,1350000,12.50,'دمشق','وكلاء',8.00,92.00,NOW()+INTERVAL '60 days'),
('safety','أرضية مطاطية','م²',1200,1500,25.00,'طرطوس','استيراد',16.00,70.00,NOW()+INTERVAL '30 days')
ON CONFLICT DO NOTHING;

-- ═══ NOTIFICATIONS ═══
INSERT INTO notifications (user_id, type, title, body, channel, is_read, created_at) VALUES
('d0000001-0000-0000-0000-000000000001','donation_received','تبرع جديد!','تلقى مشروعك تبرعاً بقيمة $2,500 من مؤسسة الأمل','in_app',false,NOW()-INTERVAL '2 hours'),
('d0000001-0000-0000-0000-000000000001','engineer_assigned','تم تعيين مهندس','تم تعيين م. كريم البيطار لمشروعك','in_app',true,NOW()-INTERVAL '45 days'),
('d0000001-0000-0000-0000-000000000001','funds_released','تم تحرير أموال','تم تحرير $5,350 للمرحلة 2','in_app',true,NOW()-INTERVAL '30 days'),
('d0000001-0000-0000-0000-000000000003','donation_received','تبرع جديد!','تلقى مشروعك تبرعاً بقيمة $15,000','in_app',false,NOW()-INTERVAL '3 hours'),
('d0000001-0000-0000-0000-000000000003','project_published','تم نشر المشروع','مشروع حي الوعر متاح للتبرع','in_app',true,NOW()-INTERVAL '30 days'),
('d0000001-0000-0000-0000-000000000005','project_published','تم نشر المشروع','مشروع سوق الهال متاح للتبرع','in_app',false,NOW()-INTERVAL '7 days'),
('d0000002-0000-0000-0000-000000000001','funds_released','تم تحرير تبرعك','تم تحرير تبرعك $5,000 بعد التحقق الميداني','in_app',true,NOW()-INTERVAL '30 days'),
('d0000002-0000-0000-0000-000000000001','proof_submitted','دليل تقدم جديد','صور تقدم العمل في مشروع حلب — المرحلة 3','in_app',false,NOW()-INTERVAL '1 day'),
('d0000002-0000-0000-0000-000000000002','donation_received','شكراً لتبرعك!','تم استلام تبرعك €12,000 لمشروع حمص','in_app',true,NOW()-INTERVAL '5 days'),
('d0000002-0000-0000-0000-000000000003','funds_released','تم تحرير تبرعك','تم تحرير تبرعك لمشروع جوبر','in_app',true,NOW()-INTERVAL '10 days'),
('d0000002-0000-0000-0000-000000000004','donation_received','شكراً لتبرعك!','تم استلام تبرعك £3,000 لمعرة النعمان','in_app',false,NOW()-INTERVAL '3 days'),
('d0000002-0000-0000-0000-000000000005','proof_submitted','تقرير شفافية','تقرير التقدم الشهري للرقة','in_app',false,NOW()-INTERVAL '4 days'),
('d0000003-0000-0000-0000-000000000001','engineer_assigned','مشروع جديد','تم تعيينك لمشروع حي الوعر','in_app',true,NOW()-INTERVAL '40 days'),
('d0000003-0000-0000-0000-000000000001','po_generated','أمر شراء','أمر شراء للحديد — DEMO-ALP-001','in_app',false,NOW()-INTERVAL '6 days'),
('d0000003-0000-0000-0000-000000000002','engineer_assigned','مشروع جديد','تم تعيينك لمشروع جوبر','in_app',true,NOW()-INTERVAL '100 days'),
('d0000003-0000-0000-0000-000000000002','engineer_assigned','مشروع جديد','تم تعيينك لمشروع مخبز درعا','in_app',true,NOW()-INTERVAL '28 days'),
('d0000003-0000-0000-0000-000000000003','engineer_assigned','مشروع جديد','تم تعيينك لمشروع مياه الرقة','in_app',true,NOW()-INTERVAL '35 days'),
('d0000004-0000-0000-0000-000000000001','kyc_approved','تم التحقق','تمت الموافقة على وثائقك','in_app',true,NOW()-INTERVAL '60 days'),
('d0000004-0000-0000-0000-000000000001','delivery_confirmed','عرض مقبول','تم قبول عرضك لمشروع حلب!','in_app',true,NOW()-INTERVAL '44 days'),
('d0000004-0000-0000-0000-000000000002','delivery_confirmed','عرض مقبول','تم قبول عرضك لمشروع الرقة','in_app',true,NOW()-INTERVAL '24 days'),
('d0000004-0000-0000-0000-000000000003','kyc_approved','تم التحقق','تمت الموافقة على وثائقك التجارية','in_app',true,NOW()-INTERVAL '50 days')
ON CONFLICT DO NOTHING;

-- ═══ IMPACT MESSAGES ═══
INSERT INTO impact_messages (donor_id, project_id, event_type, title_en, title_ar, body_en, body_ar, created_at) VALUES
('d0000002-0000-0000-0000-000000000001','DEMO-ALP-001','milestone_completed','Milestone Completed','اكتمال مرحلة','Phase 2 foundation work completed successfully','تم إنجاز المرحلة 2 — تعزيز الأساسات بنجاح',NOW()-INTERVAL '30 days'),
('d0000002-0000-0000-0000-000000000002','DEMO-HMS-001','construction_started','Construction Started','بدء البناء','Construction has started on Al-Waer housing project','بدأت أعمال البناء في مشروع حي الوعر',NOW()-INTERVAL '24 days'),
('d0000002-0000-0000-0000-000000000003','DEMO-DMS-001','project_completed','Project Completed!','اكتمل المشروع!','The Jobar residential building has been fully restored','تم ترميم بناء جوبر السكني بالكامل',NOW()-INTERVAL '10 days'),
('d0000002-0000-0000-0000-000000000004','DEMO-IDL-001','donation_received','Thank You!','شكراً!','Your donation of £3,000 has been received for the clinic','تم استلام تبرعك £3,000 لمشروع العيادة',NOW()-INTERVAL '3 days'),
('d0000002-0000-0000-0000-000000000005','DEMO-RQA-001','escrow_released','Funds Released','تحرير أموال','Escrow funds released for water network phase 2','تم تحرير أموال الضمان للمرحلة 2 من شبكة المياه',NOW()-INTERVAL '12 days')
ON CONFLICT DO NOTHING;

COMMIT;
