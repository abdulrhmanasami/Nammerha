import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// EPA Pricing Oracle — FIDIC 13.8 Price Adjustment Engine
/// ═══════════════════════════════════════════════════════════════════════════
/// Mirrors web: frontend/src/pages/admin-oracle.ts
/// Live material price ticker + adjustment calculator + approval flow
/// ═══════════════════════════════════════════════════════════════════════════
class EpaOracleScreen extends StatefulWidget {
  final String? projectId;

  const EpaOracleScreen({super.key, this.projectId});

  @override
  State<EpaOracleScreen> createState() => _EpaOracleScreenState();
}

class _EpaOracleScreenState extends State<EpaOracleScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  final NammerhaApiClient _api = NammerhaApiClient.instance;

  List<Map<String, dynamic>> _prices = [];
  List<Map<String, dynamic>> _history = [];
  Map<String, dynamic>? _adjustmentResult;
  bool _isLoading = true;
  bool _isCalculating = false;

  // FIDIC 13.8 coefficients
  final _aController = TextEditingController(text: '0.35');
  final _bController = TextEditingController(text: '0.25');
  final _cController = TextEditingController(text: '0.25');
  final _dController = TextEditingController(text: '0.15');
  final _amountController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) _loadTabData(_tabController.index);
    });
    _loadTabData(0);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _aController.dispose();
    _bController.dispose();
    _cController.dispose();
    _dController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _loadTabData(int index) async {
    setState(() => _isLoading = true);
    try {
      switch (index) {
        case 0:
          final response = await _api.request<List<dynamic>>(
            '/oracle/prices',
            fromData: (d) => d as List<dynamic>,
          );
          _prices = response.data?.cast<Map<String, dynamic>>() ?? [];
          break;
        case 2:
          if (widget.projectId != null) {
            final response = await _api.request<List<dynamic>>(
              '/oracle/history/${widget.projectId}',
              fromData: (d) => d as List<dynamic>,
            );
            _history = response.data?.cast<Map<String, dynamic>>() ?? [];
          }
          break;
      }
    } on ApiException catch (_) {} catch (_) {}
    if (mounted) setState(() => _isLoading = false);
  }

  Future<void> _calculateAdjustment() async {
    if (_isCalculating || widget.projectId == null) return;
    final amount = int.tryParse(_amountController.text);
    if (amount == null || amount <= 0) return;

    setState(() => _isCalculating = true);
    try {
      final a = double.tryParse(_aController.text) ?? 0.35;
      final b = double.tryParse(_bController.text) ?? 0.25;
      final c = double.tryParse(_cController.text) ?? 0.25;
      final d = double.tryParse(_dController.text) ?? 0.15;

      final response = await _api.request<Map<String, dynamic>>(
        '/oracle/calculate',
        method: 'POST',
        body: {
          'project_id': widget.projectId,
          'fidic_params': {
            'a': a, 'b': b, 'c': c, 'd': d,
            'Ln': 105, 'En': 110, 'Mn': 108,
            'Lo': 100, 'Eo': 100, 'Mo': 100,
          },
          'original_amount': amount * 100,
        },
        fromData: (d) => d as Map<String, dynamic>,
      );
      _adjustmentResult = response.data;
    } catch (_) {}
    if (mounted) setState(() => _isCalculating = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('أوراكل التسعير — FIDIC 13.8'),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: colors.primaryBrand,
          labelColor: colors.primaryBrand,
          unselectedLabelColor: colors.textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: const [
            Tab(text: 'الأسعار الحية'),
            Tab(text: 'حاسبة EPA'),
            Tab(text: 'السجل'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildPriceTicker(colors),
          _buildCalculator(colors),
          _buildHistory(colors),
        ],
      ),
    );
  }

  // ─── Tab 1: Live Price Ticker ─────────────────────────────────────────

  Widget _buildPriceTicker(SemanticColors colors) {
    if (_isLoading && _prices.isEmpty) return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    if (_prices.isEmpty) return _emptyState(colors, Icons.show_chart_rounded, 'لا تتوفر بيانات أسعار', 'سيتم تحديث الأسعار تلقائياً');
    return RefreshIndicator(
      onRefresh: () => _loadTabData(0),
      color: colors.primaryBrand,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Ticker header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: NammerhaGradients.brandPrimary,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusXl),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.trending_up_rounded, color: Colors.white, size: 20),
                const SizedBox(width: 8),
                Text('مؤشر أسعار المواد', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white.withAlpha(230))),
                const SizedBox(width: 4),
                Text('— LIVE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white.withAlpha(150))),
              ],
            ),
          ).animate().fadeIn(),
          const SizedBox(height: 16),

          // Price cards
          ..._prices.asMap().entries.map((e) {
            final p = e.value;
            final changePct = (p['price_change_pct'] as num?)?.toDouble() ?? 0.0;
            final isPositive = changePct >= 0;
            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: colors.surfaceElevated,
                borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
                border: Border.all(color: colors.strokeSubtle),
              ),
              child: Row(
                children: [
                  Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      color: (isPositive ? colors.success : colors.error).withAlpha(12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      isPositive ? Icons.trending_up_rounded : Icons.trending_down_rounded,
                      color: isPositive ? colors.success : colors.error, size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p['material_name']?.toString() ?? '', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.textPrimary)),
                        Text('${p['unit'] ?? ''}', style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(formatCurrency(p['current_price'] ?? 0), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: colors.textPrimary)),
                      Text(
                        '${isPositive ? '+' : ''}${changePct.toStringAsFixed(1)}%',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: isPositive ? colors.success : colors.error),
                      ),
                    ],
                  ),
                ],
              ),
            ).animate(delay: (e.key * 60).ms).fadeIn();
          }),
        ],
      ),
    );
  }

  // ─── Tab 2: FIDIC Calculator ──────────────────────────────────────────

  Widget _buildCalculator(SemanticColors colors) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Formula info banner
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: colors.info.withAlpha(8),
            borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
            border: Border.all(color: colors.info.withAlpha(20)),
          ),
          child: Row(
            children: [
              Icon(Icons.info_rounded, size: 20, color: colors.info),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'معادلة FIDIC 13.8:\nPn = a + b(Ln/Lo) + c(En/Eo) + d(Mn/Mo)',
                  style: TextStyle(fontSize: 12, color: colors.info, fontFamily: 'monospace', fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ).animate().fadeIn(),
        const SizedBox(height: 16),

        Text('معاملات التعديل', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        const SizedBox(height: 12),

        Row(children: [
          _coeffField(_aController, 'a (ثابت)', colors),
          const SizedBox(width: 8),
          _coeffField(_bController, 'b (عمالة)', colors),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          _coeffField(_cController, 'c (طاقة)', colors),
          const SizedBox(width: 8),
          _coeffField(_dController, 'd (مواد)', colors),
        ]),
        const SizedBox(height: 16),

        TextField(
          controller: _amountController,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: 'المبلغ الأصلي (ل.س)',
            filled: true,
            fillColor: colors.surfaceElevated,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.strokeSubtle)),
          ),
        ),
        const SizedBox(height: 16),

        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _isCalculating ? null : _calculateAdjustment,
            icon: Icon(_isCalculating ? Icons.hourglass_top_rounded : Icons.calculate_rounded, size: 18),
            label: Text(_isCalculating ? 'جارِ الحساب...' : 'احسب التعديل'),
            style: ElevatedButton.styleFrom(
              backgroundColor: colors.primaryBrand,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),

        // Result
        if (_adjustmentResult != null) ...[
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: colors.success.withAlpha(8),
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
              border: Border.all(color: colors.success.withAlpha(25)),
            ),
            child: Column(
              children: [
                Text('نتيجة التعديل', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.success)),
                const SizedBox(height: 10),
                _resultRow('المبلغ الأصلي', formatCurrency(_adjustmentResult!['original_amount'] ?? 0), colors),
                _resultRow('المبلغ المعدّل', formatCurrency(_adjustmentResult!['adjusted_amount'] ?? 0), colors),
                _resultRow('نسبة التغيير', '${(_adjustmentResult!['adjustment_factor'] as num?)?.toStringAsFixed(4) ?? '—'}', colors),
                _resultRow('الفرق', formatCurrency((_adjustmentResult!['adjusted_amount'] ?? 0) - (_adjustmentResult!['original_amount'] ?? 0)), colors),
              ],
            ),
          ).animate().fadeIn().slideY(begin: 0.05, end: 0),
        ],
      ],
    );
  }

  Widget _coeffField(TextEditingController controller, String label, SemanticColors colors) {
    return Expanded(
      child: TextField(
        controller: controller,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: colors.surfaceElevated,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.strokeSubtle)),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        ),
      ),
    );
  }

  Widget _resultRow(String label, String value, SemanticColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 13, color: colors.textSecondary)),
          Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
        ],
      ),
    );
  }

  // ─── Tab 3: History ───────────────────────────────────────────────────

  Widget _buildHistory(SemanticColors colors) {
    if (widget.projectId == null) return _emptyState(colors, Icons.history_rounded, 'اختر مشروعاً لعرض السجل', '');
    if (_isLoading && _history.isEmpty) return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
    if (_history.isEmpty) return _emptyState(colors, Icons.history_rounded, 'لا توجد تعديلات سابقة', '');
    return RefreshIndicator(
      onRefresh: () => _loadTabData(2),
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _history.length,
        itemBuilder: (_, i) {
          final h = _history[i];
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.surfaceElevated,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
              border: Border.all(color: colors.strokeSubtle),
            ),
            child: Row(
              children: [
                Icon(Icons.timeline_rounded, color: colors.primaryBrand),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('تعديل #${i + 1}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
                      Text(h['created_at']?.toString() ?? '', style: TextStyle(fontSize: 11, color: colors.textSubtle)),
                    ],
                  ),
                ),
                Text(formatCurrency(h['adjusted_amount'] ?? 0), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: colors.secondaryAccent)),
              ],
            ),
          ).animate(delay: (i * 60).ms).fadeIn();
        },
      ),
    );
  }

  Widget _emptyState(SemanticColors colors, IconData icon, String title, String subtitle) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 56, color: colors.textSubtle),
            const SizedBox(height: 16),
            Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.textPrimary), textAlign: TextAlign.center),
            if (subtitle.isNotEmpty) ...[const SizedBox(height: 6), Text(subtitle, style: TextStyle(fontSize: 13, color: colors.textSecondary), textAlign: TextAlign.center)],
          ],
        ),
      ),
    );
  }
}
