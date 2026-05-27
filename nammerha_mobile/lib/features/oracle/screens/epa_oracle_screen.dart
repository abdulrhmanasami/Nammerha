import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/i18n/t.dart';
import '../bloc/oracle_bloc.dart';
import '../../../core/utils/format_utils.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';
import '../../../core/utils/animation_budget.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// EPA Pricing Oracle — FIDIC 13.8 Price Adjustment Engine
/// ═══════════════════════════════════════════════════════════════════════════
/// Mirrors web: frontend/src/pages/admin-oracle.ts
/// Live material price ticker + adjustment calculator + approval flow
/// Platinum BLoC integration: Zero data setState.
/// ═══════════════════════════════════════════════════════════════════════════
class EpaOracleScreen extends StatelessWidget {
  final String? projectId;

  const EpaOracleScreen({super.key, this.projectId});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => OracleBloc(),
      child: _EpaOracleScreenContent(projectId: projectId),
    );
  }
}

class _EpaOracleScreenContent extends StatefulWidget {
  final String? projectId;

  const _EpaOracleScreenContent({this.projectId});

  @override
  State<_EpaOracleScreenContent> createState() => _EpaOracleScreenContentState();
}

class _EpaOracleScreenContentState extends State<_EpaOracleScreenContent>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

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
    
    // Initial load
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadTabData(0);
    });
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

  void _loadTabData(int index) {
    final bloc = context.read<OracleBloc>();
    switch (index) {
      case 0:
        bloc.add(LoadOraclePrices());
        break;
      case 2:
        if (widget.projectId != null) {
          bloc.add(LoadAdjustmentHistory(widget.projectId!));
        }
        break;
    }
  }

  void _calculateAdjustment() {
    if (widget.projectId == null) return;
    final amount = int.tryParse(_amountController.text);
    if (amount == null || amount <= 0) return;

    final a = double.tryParse(_aController.text) ?? 0.35;
    final b = double.tryParse(_bController.text) ?? 0.25;
    final c = double.tryParse(_cController.text) ?? 0.25;
    final d = double.tryParse(_dController.text) ?? 0.15;

    context.read<OracleBloc>().add(
      CalculateEPAAdjustment(
        projectId: widget.projectId!,
        fidicParams: {
          'a': a, 'b': b, 'c': c, 'd': d,
          'Ln': 105, 'En': 110, 'Mn': 108,
          'Lo': 100, 'Eo': 100, 'Mo': 100,
        },
        originalAmount: amount * 100, // converted to cents or lowest denom
      )
    );
  }

  String formatCurrency(num amount) => FormatUtils.currency(amount);

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(context.tr('epa_oracle_title')),
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
      body: BlocConsumer<OracleBloc, OracleState>(
        buildWhen: (previous, current) => previous != current,
        listener: (context, state) {
          if (state.error != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.error!), backgroundColor: colors.error)
            );
          }
        },
        builder: (context, state) {
          return TabBarView(
            controller: _tabController,
            children: [
              _buildPriceTicker(colors, state),
              _buildCalculator(colors, state),
              _buildHistory(colors, state),
            ],
          );
        },
      ),
    );
  }

  // ─── Tab 1: Live Price Ticker ─────────────────────────────────────────

  Widget _buildPriceTicker(SemanticColors colors, OracleState state) {
    if (state.isLoading && state.prices.isEmpty) return NammerhaShimmerLoader(colors: colors);
    if (state.prices.isEmpty) return _emptyState(colors, PhosphorIconsRegular.chartLineUp, 'لا تتوفر بيانات أسعار', 'سيتم تحديث الأسعار تلقائياً');
    return RefreshIndicator(
      onRefresh: () async => _loadTabData(0),
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
                Icon(PhosphorIconsRegular.trendUp, color: Colors.white, size: 20),
                const SizedBox(width: 8),
                Text('مؤشر أسعار المواد', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white.withAlpha(230))),
                const SizedBox(width: 4),
                Text('— LIVE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white.withAlpha(150))),
              ],
            ),
          ).nmAnimate(context).fadeIn(),
          const SizedBox(height: 16),

          // Price cards
          ...state.prices.asMap().entries.map((e) {
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
                      isPositive ? PhosphorIconsRegular.trendUp : PhosphorIconsRegular.trendDown,
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
            ).nmAnimate(context, delay: (e.key * 60).ms).fadeIn();
          }),
        ],
      ),
    );
  }

  // ─── Tab 2: FIDIC Calculator ──────────────────────────────────────────

  Widget _buildCalculator(SemanticColors colors, OracleState state) {
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
              Icon(PhosphorIconsRegular.info, size: 20, color: colors.info),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'معادلة FIDIC 13.8:\nPn = a + b(Ln/Lo) + c(En/Eo) + d(Mn/Mo)',
                  style: TextStyle(fontSize: 12, color: colors.info, fontFamily: 'monospace', fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ).nmAnimate(context).fadeIn(),
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
            onPressed: state.isLoading ? null : _calculateAdjustment,
            icon: Icon(state.isLoading ? PhosphorIconsRegular.hourglassHigh : PhosphorIconsRegular.calculator, size: 18),
            label: Text(state.isLoading ? 'جارِ الحساب...' : 'احسب التعديل'),
            style: ElevatedButton.styleFrom(
              backgroundColor: colors.primaryBrand,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),

        // Result
        if (state.calculationResult != null) ...[
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
                _resultRow('المبلغ الأصلي', formatCurrency(state.calculationResult!['original_amount'] ?? 0), colors),
                _resultRow('المبلغ المعدّل', formatCurrency(state.calculationResult!['adjusted_amount'] ?? 0), colors),
                _resultRow('نسبة التغيير', (state.calculationResult!['adjustment_factor'] as num?)?.toStringAsFixed(4) ?? '—', colors),
                _resultRow(context.tr('difference'), formatCurrency((state.calculationResult!['adjusted_amount'] ?? 0) - (state.calculationResult!['original_amount'] ?? 0)), colors),
              ],
            ),
          ).nmAnimate(context).fadeIn().slideY(begin: 0.05, end: 0),
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

  Widget _buildHistory(SemanticColors colors, OracleState state) {
    if (widget.projectId == null) return _emptyState(colors, PhosphorIconsRegular.clockCounterClockwise, 'اختر مشروعاً لعرض السجل', '');
    if (state.isLoading && state.history.isEmpty) return NammerhaShimmerLoader(colors: colors);
    if (state.history.isEmpty) return _emptyState(colors, PhosphorIconsRegular.clockCounterClockwise, context.tr('no_adjustments_yet'), '');
    return RefreshIndicator(
      onRefresh: () async => _loadTabData(2),
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: state.history.length,
        itemBuilder: (_, i) {
          final h = state.history[i];
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
                Icon(PhosphorIconsRegular.chartBar, color: colors.primaryBrand),
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
          ).nmAnimate(context, delay: (i * 60).ms).fadeIn();
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
