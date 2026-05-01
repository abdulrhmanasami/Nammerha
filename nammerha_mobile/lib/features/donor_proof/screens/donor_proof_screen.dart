import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/donor_proof_bloc.dart';
import '../../pdf/screens/pdf_viewer_screen.dart';
import '../../../core/i18n/t.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Donor Proof Screen — Proof of Delivery with GPS Verification
/// ═══════════════════════════════════════════════════════════════════════════
/// Mirrors web: frontend/src/pages/donor-proof.ts
/// Platinum BLoC integration: Zero data setState.
/// ═══════════════════════════════════════════════════════════════════════════
class DonorProofScreen extends StatelessWidget {
  const DonorProofScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => DonorProofBloc()..add(LoadDonorProofs()),
      child: const _DonorProofScreenContent(),
    );
  }
}

class _DonorProofScreenContent extends StatelessWidget {
  const _DonorProofScreenContent();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(title: const Text('إثباتات التسليم')),
      body: BlocConsumer<DonorProofBloc, DonorProofState>(
        listener: (context, state) {
          if (state.error != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.error!), backgroundColor: colors.error)
            );
          } else if (state.receiptUrl != null && !state.isDownloadingReceipt) {
            if (state.receiptUrl!.isEmpty) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: const Text('الإيصال غير متوفر حالياً'), backgroundColor: colors.warning),
              );
            } else {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => PdfViewerScreen(
                    url: state.receiptUrl!,
                    title: 'إيصال التبرع',
                  ),
                ),
              );
            }
          }
        },
        builder: (context, state) {
          if (state.isLoading && state.proofs.isEmpty) {
            return Center(child: CircularProgressIndicator(color: colors.primaryBrand));
          }

          if (state.error != null && state.proofs.isEmpty) {
            return _buildError(context, colors, state.error!);
          }

          final proofs = state.proofs;
          if (proofs.isEmpty) return _buildEmpty(colors);

          return RefreshIndicator(
            onRefresh: () async {
              context.read<DonorProofBloc>().add(LoadDonorProofs());
            },
            color: colors.primaryBrand,
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: proofs.length,
              itemBuilder: (context, index) =>
                  _buildProofCard(context, proofs[index], colors, index, state.isDownloadingReceipt),
            ),
          );
        },
      ),
    );
  }

  Widget _buildError(BuildContext context, SemanticColors colors, String error) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.cloud_off_rounded, size: 64, color: colors.textSecondary),
          const SizedBox(height: 16),
          Text(error, style: TextStyle(color: colors.error, fontSize: 16), textAlign: TextAlign.center),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: () => context.read<DonorProofBloc>().add(LoadDonorProofs()),
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('إعادة المحاولة'),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty(SemanticColors colors) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.verified_user_outlined, size: 64, color: colors.textSubtle),
          const SizedBox(height: 16),
          Text(
            'لا توجد إثباتات تسليم بعد',
            style: TextStyle(fontSize: 16, color: colors.textSecondary),
          ),
          const SizedBox(height: 8),
          Text(
            'ستظهر هنا إثباتات التسليم المكانية\nعندما يتم توصيل مواد مشاريعك',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: colors.textSubtle),
          ),
        ],
      ),
    );
  }

  Widget _buildProofCard(BuildContext context, Map<String, dynamic> proof, SemanticColors colors, int index, bool isDownloading) {
    final materialName = proof['material_name'] ?? '';
    final projectTitle = proof['project_title'] ?? '';
    final status = (proof['payment_status'] ?? '') as String;
    final gpsLat = proof['gps_lat'];
    final gpsLng = proof['gps_lng'];
    final gpsAccuracy = proof['gps_accuracy_meters'];
    final imageUrl = proof['image_url'] as String?;
    final clientHash = proof['client_hash'] as String?;
    final proofDate = proof['proof_date'] ?? proof['created_at'] ?? '';

    final bool hasGpsProof = gpsLat != null && gpsLng != null;
    final bool hasImageProof = imageUrl != null && imageUrl.isNotEmpty;

    Color statusColor;
    String statusLabel;
    IconData statusIcon;

    switch (status.toLowerCase()) {
      case 'released':
        statusColor = colors.success;
        statusLabel = 'تم التسليم والتحرير';
        statusIcon = Icons.verified_rounded;
        break;
      case 'locked':
        statusColor = colors.warning;
        statusLabel = 'بانتظار التسليم';
        statusIcon = Icons.hourglass_top_rounded;
        break;
      case 'refunded':
        statusColor = colors.info;
        statusLabel = 'تم الاسترداد';
        statusIcon = Icons.replay_rounded;
        break;
      default:
        statusColor = colors.textSecondary;
        statusLabel = status;
        statusIcon = Icons.circle;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(NammerhaTheme.radiusLg),
        border: Border.all(color: colors.strokeSubtle),
        boxShadow: const [NammerhaShadows.elevation],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: statusColor.withAlpha(15),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(statusIcon, color: statusColor, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        materialName.toString(),
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary,
                        ),
                      ),
                      Text(
                        projectTitle.toString(),
                        style: TextStyle(fontSize: 13, color: colors.textSecondary),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withAlpha(15),
                    borderRadius: BorderRadius.circular(8),
                    ),
                  child: Text(
                    statusLabel,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: statusColor,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Proof image
          if (hasImageProof) ...[
            ClipRRect(
              child: Container(
                height: 200,
                width: double.infinity,
                color: colors.backgroundSecondary,
                child: Image.network(
                  imageUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Center(
                    child: Icon(Icons.broken_image_rounded, color: colors.textSubtle, size: 40),
                  ),
                ),
              ),
            ),
          ],

          // GPS Proof Section
          if (hasGpsProof) ...[
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: colors.backgroundSecondary,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.gps_fixed_rounded, size: 16, color: colors.success),
                      const SizedBox(width: 6),
                      Text(
                        'إثبات مكاني GPS',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: colors.success,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  _gpsRow('خط العرض', '$gpsLat', colors),
                  _gpsRow('خط الطول', '$gpsLng', colors),
                  if (gpsAccuracy != null)
                    _gpsRow(context.tr('str_ccac5b98'), '±${gpsAccuracy}م', colors),
                  if (clientHash != null && clientHash.isNotEmpty)
                    _gpsRow(
                      'التوقيع الرقمي',
                      '${clientHash.substring(0, clientHash.length > 16 ? 16 : clientHash.length)}...',
                      colors,
                    ),
                  if (proofDate.toString().isNotEmpty)
                    _gpsRow(context.tr('date'), _formatDate(proofDate.toString()), colors),
                ],
              ),
            ),
          ],

          // No proof yet
          if (!hasGpsProof && !hasImageProof)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: colors.warning.withAlpha(10),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: colors.warning.withAlpha(40)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline_rounded, size: 18, color: colors.warning),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'الإثبات المكاني لم يُقدَّم بعد — سيُتاح بعد التسليم',
                        style: TextStyle(fontSize: 12, color: colors.warning),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          // Receipt download button
          if (status.toLowerCase() == 'released') ...[
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: isDownloading ? null : () => _openReceipt(context, proof, colors),
                  icon: isDownloading
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Icon(Icons.picture_as_pdf_rounded, size: 18, color: colors.primaryBrand),
                  label: Text('تحميل الإيصال PDF', style: TextStyle(color: colors.primaryBrand, fontWeight: FontWeight.w600)),
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: colors.primaryBrand.withAlpha(40)),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    ).animate(delay: (index * 100).ms).fadeIn().slideY(begin: 0.06, end: 0);
  }

  void _openReceipt(BuildContext context, Map<String, dynamic> proof, SemanticColors colors) {
    final escrowId = proof['escrow_id']?.toString() ?? proof['id']?.toString();
    if (escrowId == null || escrowId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: const Text('لا يوجد معرّف للضمان'), backgroundColor: colors.error),
      );
      return;
    }

    context.read<DonorProofBloc>().add(DownloadReceipt(escrowId));
  }

  Widget _gpsRow(String label, String value, SemanticColors colors) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(
            width: 100,
            child: Text(label, style: TextStyle(fontSize: 12, color: colors.textSecondary)),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                fontFamily: 'monospace',
                color: colors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr);
      return '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return dateStr;
    }
  }
}
