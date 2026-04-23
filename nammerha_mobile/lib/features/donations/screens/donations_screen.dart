import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart';

class DonationsScreen extends StatefulWidget {
  const DonationsScreen({super.key});

  @override
  State<DonationsScreen> createState() => _DonationsScreenState();
}

class _DonationsScreenState extends State<DonationsScreen> {
  final DonorApi _donorApi = DonorApi();
  final DonationsApi _donationsApi = DonationsApi();

  List<Map<String, dynamic>> _donations = [];
  Map<String, dynamic> _summary = {};
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      final results = await Future.wait([
        _donorApi.getDonations(),
        _donationsApi.getMyEscrow(),
      ]);
      setState(() {
        _donations = results[0] as List<Map<String, dynamic>>;
        _summary = results[1] as Map<String, dynamic>;
        _isLoading = false;
      });
    } on ApiException catch (e) {
      setState(() { _error = e.message; _isLoading = false; });
    } catch (e) {
      setState(() { _error = 'حدث خطأ في تحميل بيانات التبرعات'; _isLoading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('تبرعاتي'),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh_rounded, color: colors.textSecondary),
            onPressed: _loadData,
          ),
        ],
      ),
      body: _buildBody(colors),
    );
  }

  Widget _buildBody(SemanticColors colors) {
    if (_isLoading) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: colors.primaryBrand),
            const SizedBox(height: 16),
            Text('جارٍ تحميل التبرعات...', style: TextStyle(color: colors.textSecondary)),
          ],
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cloud_off_rounded, size: 64, color: colors.textSecondary),
              const SizedBox(height: 16),
              Text(_error!, style: TextStyle(color: colors.error, fontSize: 16), textAlign: TextAlign.center),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _loadData,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('إعادة المحاولة'),
                style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      color: colors.primaryBrand,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Summary Cards Row
            Row(
              children: [
                _buildSummaryCard(
                  context,
                  'مُؤمّن في الضمان',
                  formatCurrency(_summary['total_locked'] ?? _summary['totalLocked'] ?? 0),
                  Icons.lock_clock_rounded,
                  colors.success,
                  colors.successLight,
                ),
                const SizedBox(width: 12),
                _buildSummaryCard(
                  context,
                  'تم الإفراج',
                  formatCurrency(_summary['total_released'] ?? _summary['totalReleased'] ?? 0),
                  Icons.check_circle_rounded,
                  colors.primaryBrand,
                  colors.primaryBrandLight,
                ),
              ],
            )
                .animate()
                .fadeIn()
                .slideY(begin: -0.1, end: 0),
            const SizedBox(height: 24),

            // Donations List Header
            Text(
              'سجل التبرعات',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.textPrimary),
            ),
            const SizedBox(height: 14),

            if (_donations.isEmpty)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    children: [
                      Icon(Icons.volunteer_activism_rounded, size: 48, color: colors.textSecondary),
                      const SizedBox(height: 12),
                      Text('لا توجد تبرعات بعد', style: TextStyle(color: colors.textSecondary)),
                    ],
                  ),
                ),
              )
            else
              ...List.generate(_donations.length, (index) {
                final d = _donations[index];
                return _buildDonationItem(d, colors, index);
              }),

            const SizedBox(height: 16),

            // Trust Badge
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.primaryBrandLight,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: colors.primaryBrand.withAlpha(30)),
              ),
              child: Row(
                children: [
                  Icon(Icons.shield_rounded, color: colors.primaryBrand, size: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'أموالك مؤمّنة بنظام الضمان المشفّر. لا يتم الإفراج إلا بإثبات مكاني مُوثّق.',
                      style: TextStyle(fontSize: 12, color: colors.primaryBrand, height: 1.6),
                    ),
                  ),
                ],
              ),
            )
                .animate(delay: 600.ms)
                .fadeIn(),
          ],
        ),
      ),
    );
  }

  Widget _buildDonationItem(Map<String, dynamic> d, SemanticColors colors, int index) {
    final status = (d['payment_status'] ?? d['paymentStatus'] ?? '') as String;
    final materialName = d['material_name'] ?? d['materialName'] ?? '';
    final projectTitle = d['project_title'] ?? d['projectTitle'] ?? '';
    final amountLocked = d['amount_locked'] ?? d['amountLocked'] ?? 0;

    Color statusColor;
    String statusLabel;
    IconData statusIcon;

    switch (status) {
      case 'SUCCESS':
        statusColor = colors.success;
        statusLabel = 'مُؤمّن';
        statusIcon = Icons.lock_rounded;
        break;
      case 'ESCROW_RELEASED':
        statusColor = colors.primaryBrand;
        statusLabel = 'تم الإفراج';
        statusIcon = Icons.check_circle_rounded;
        break;
      case 'REFUNDED':
        statusColor = colors.textSecondary;
        statusLabel = 'مُسترد';
        statusIcon = Icons.undo_rounded;
        break;
      default:
        statusColor = colors.warning;
        statusLabel = 'قيد المعالجة';
        statusIcon = Icons.hourglass_top_rounded;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Row(
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: statusColor.withAlpha(15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(statusIcon, color: statusColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(materialName.toString(), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.textPrimary)),
                Text(projectTitle.toString(), style: TextStyle(fontSize: 12, color: colors.textSecondary), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(formatCurrency(amountLocked as num), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.textPrimary)),
              const SizedBox(height: 2),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: statusColor.withAlpha(15), borderRadius: BorderRadius.circular(6)),
                child: Text(statusLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: statusColor)),
              ),
            ],
          ),
        ],
      ),
    )
        .animate(delay: (200 + index * 100).ms)
        .fadeIn()
        .slideX(begin: 0.05, end: 0);
  }

  Widget _buildSummaryCard(BuildContext context, String title, String amount, IconData icon, Color color, Color bgColor) {
    final colors = context.colors;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.strokeSubtle),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(height: 12),
            Text(amount, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: colors.textPrimary)),
            const SizedBox(height: 2),
            Text(title, style: TextStyle(fontSize: 11, color: colors.textSecondary)),
          ],
        ),
      ),
    );
  }
}
