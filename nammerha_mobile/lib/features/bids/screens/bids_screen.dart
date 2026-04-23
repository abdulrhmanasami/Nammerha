import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/api_services.dart';
import '../../../core/network/api_client.dart';

class BidsScreen extends StatefulWidget {
  const BidsScreen({super.key});

  @override
  State<BidsScreen> createState() => _BidsScreenState();
}

class _BidsScreenState extends State<BidsScreen> {
  final EngineerApi _engineerApi = EngineerApi();
  List<Map<String, dynamic>> _bids = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadBids();
  }

  Future<void> _loadBids() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      _bids = await _engineerApi.getBids();
      setState(() => _isLoading = false);
    } on ApiException catch (e) {
      setState(() { _error = e.message; _isLoading = false; });
    } catch (e) {
      setState(() { _error = 'حدث خطأ في تحميل العروض'; _isLoading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: const Text('عروضي'),
        actions: [
          IconButton(
            icon: Icon(Icons.add_circle_outline_rounded, color: colors.primaryBrand),
            onPressed: () {},
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
            Text('جارٍ تحميل العروض...', style: TextStyle(color: colors.textSecondary)),
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
                onPressed: _loadBids,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('إعادة المحاولة'),
                style: ElevatedButton.styleFrom(backgroundColor: colors.primaryBrand),
              ),
            ],
          ),
        ),
      );
    }

    if (_bids.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.gavel_rounded, size: 64, color: colors.textSecondary),
            const SizedBox(height: 16),
            Text('لا توجد عروض بعد', style: TextStyle(color: colors.textSecondary, fontSize: 16)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadBids,
      color: colors.primaryBrand,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _bids.length,
        itemBuilder: (context, index) {
          final bid = _bids[index];
          final status = (bid['status'] ?? '') as String;
          final projectTitle = bid['project_title'] ?? bid['projectTitle'] ?? '';
          final bidAmount = bid['proposed_cost'] ?? bid['bidAmount'] ?? 0;
          final methodology = bid['methodology'] ?? bid['cover_letter'] ?? '';

          Color statusColor;
          IconData statusIcon;
          String statusLabel;
          switch (status.toLowerCase()) {
            case 'accepted':
            case 'مقبول':
              statusColor = colors.success;
              statusIcon = Icons.check_circle_rounded;
              statusLabel = 'مقبول';
              break;
            case 'rejected':
            case 'مرفوض':
              statusColor = colors.error;
              statusIcon = Icons.cancel_rounded;
              statusLabel = 'مرفوض';
              break;
            default:
              statusColor = colors.warning;
              statusIcon = Icons.hourglass_top_rounded;
              statusLabel = 'قيد المراجعة';
          }

          return Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: colors.surfaceElevated,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.strokeSubtle),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        projectTitle.toString(),
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.textPrimary),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: statusColor.withAlpha(15),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(statusIcon, size: 14, color: statusColor),
                          const SizedBox(width: 4),
                          Text(statusLabel, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: statusColor)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: colors.backgroundSecondary,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    children: [
                      _buildRow(context, 'قيمة العرض', formatCurrency(bidAmount as num)),
                      const SizedBox(height: 6),
                      _buildRow(context, 'المنهجية', methodology.toString()),
                    ],
                  ),
                ),
              ],
            ),
          )
              .animate(delay: (index * 120).ms)
              .fadeIn()
              .slideY(begin: 0.08, end: 0);
        },
      ),
    );
  }

  Widget _buildRow(BuildContext context, String label, String value) {
    final colors = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 80,
          child: Text(label, style: TextStyle(fontSize: 12, color: colors.textSecondary, fontWeight: FontWeight.w500)),
        ),
        Expanded(
          child: Text(value, style: TextStyle(fontSize: 13, color: colors.textPrimary, fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }
}
