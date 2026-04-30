import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/escrow_bloc.dart';
import '../bloc/escrow_event.dart';
import '../bloc/escrow_state.dart';
import '../data/escrow_repository.dart';
import '../../../core/i18n/t.dart';

class EscrowSummaryScreen extends StatelessWidget {
  const EscrowSummaryScreen({super.key});

  // Basic numeric formatting fallback if MockData is fully removed
  String formatCurrency(num amount) {
    if (amount >= 1000000) {
      return '${(amount / 1000000).toStringAsFixed(1)}M ل.س';
    } else if (amount >= 1000) {
      return '${(amount / 1000).toStringAsFixed(0)}k ل.س';
    }
    return '${amount.toStringAsFixed(0)} ل.س';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return BlocProvider(
      create: (context) => EscrowBloc(repository: EscrowRepository())..add(FetchEscrowSummaryEvent()),
      child: Scaffold(
        backgroundColor: colors.backgroundPrimary,
        appBar: AppBar(
          title: const Text('خزنة الضمان'),
          actions: [
            Builder(
              builder: (ctx) => IconButton(
                icon: Icon(Icons.refresh_rounded, color: colors.textSecondary),
                onPressed: () {
                HapticFeedback.mediumImpact();
                  ctx.read<EscrowBloc>().add(FetchEscrowSummaryEvent());
                },
              ),
            ),
          ],
        ),
        body: BlocBuilder<EscrowBloc, EscrowState>(
          builder: (context, state) {
            if (state is EscrowLoading || state is EscrowInitial) {
              return const Center(child: CircularProgressIndicator());
            } else if (state is EscrowError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Text(
                    state.message,
                    style: TextStyle(color: colors.error),
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            } else if (state is EscrowSummaryLoaded) {
              final summary = state.summary;
              final totalLocked = (summary['total_locked'] as num?) ?? summary['totalLocked'] as num? ?? 0;
              final totalReleased = (summary['total_released'] as num?) ?? summary['totalReleased'] as num? ?? 0;
              final totalRefunded = (summary['total_refunded'] as num?) ?? summary['totalRefunded'] as num? ?? 0;

              return RefreshIndicator(
                onRefresh: () async {
                  context.read<EscrowBloc>().add(FetchEscrowSummaryEvent());
                },
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildStatusCard(
                        context,
                        'مُؤمّن في الضمان',
                        formatCurrency(totalLocked),
                        Icons.lock_clock_rounded,
                        colors.success,
                        colors.successLight,
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: _buildStatusCard(
                              context,
                              'تم الإفراج',
                              formatCurrency(totalReleased),
                              Icons.check_circle_rounded,
                              colors.primaryBrand,
                              colors.primaryBrandLight,
                              isSmall: true,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: _buildStatusCard(
                              context,
                              context.tr('str_223dd076'),
                              formatCurrency(totalRefunded),
                              Icons.settings_backup_restore_rounded,
                              colors.textSecondary,
                              colors.backgroundSecondary,
                              isSmall: true,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 28),
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: colors.primaryBrandLight,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: colors.primaryBrand.withAlpha(30)),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.shield_rounded, color: colors.primaryBrand, size: 22),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'الأموال مؤمّنة بنظام الضمان المشفّر وفق معيار البلاتينيوم. لا يتم الإفراج عنها إلا بتقديم إثبات مكاني مُوثّق من المهندس المعيّن.',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: colors.primaryBrand,
                                  height: 1.7,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }
            return const SizedBox();
          },
        ),
      ),
    );
  }

  Widget _buildStatusCard(
    BuildContext context,
    String title,
    String amount,
    IconData icon,
    Color mainColor,
    Color bgColor, {
    bool isSmall = false,
  }) {
    final colors = context.colors;
    return Container(
      padding: EdgeInsets.all(isSmall ? 16 : 22),
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
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, color: mainColor, size: isSmall ? 18 : 22),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: isSmall ? 13 : 15,
                    fontWeight: FontWeight.w500,
                    color: colors.textSecondary,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: isSmall ? 12 : 18),
          Text(
            amount,
            style: TextStyle(
              fontSize: isSmall ? 18 : 26,
              fontWeight: FontWeight.w800,
              color: colors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

