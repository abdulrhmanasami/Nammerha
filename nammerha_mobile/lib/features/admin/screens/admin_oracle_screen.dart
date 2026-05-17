import '../../../core/i18n/t.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import '../../../core/widgets/error_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/semantic_colors.dart';
import '../bloc/admin_oracle_bloc.dart';
import '../models/admin_models.dart';
import 'package:nammerha_mobile/core/widgets/shimmer_loader.dart';

/// Admin Pricing Oracle — FIDIC material prices (EPA engine).
class AdminOracleScreen extends StatelessWidget {
  const AdminOracleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AdminOracleBloc()..add(LoadOraclePrices()),
      child: const _OracleView(),
    );
  }
}

class _OracleView extends StatelessWidget {
  const _OracleView();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        title: Text(
          context.tr('admin_oracle_prices_title'),
          style: TextStyle(fontWeight: FontWeight.w800, color: colors.textHeading),
        ),
        backgroundColor: colors.surfaceElevated,
        elevation: 0,
        iconTheme: IconThemeData(color: colors.textHeading),
        actions: [
          IconButton(
            icon: Icon(PhosphorIconsRegular.arrowsClockwise, color: colors.primaryBrand),
            onPressed: () => context.read<AdminOracleBloc>().add(LoadOraclePrices()),
          ),
        ],
      ),
      body: BlocBuilder<AdminOracleBloc, AdminOracleState>(
        builder: (context, state) {
          if (state is AdminOracleLoading) {
            return NammerhaShimmerLoader(colors: colors);
          }
          if (state is AdminOracleError) {
            return NammerhaErrorState(
              message: state.message,
              onRetry: () => context.read<AdminOracleBloc>().add(LoadOraclePrices()),
              iconSize: 48,
            );
          }
          if (state is AdminOracleLoaded) {
            return _buildLoaded(context, state.prices);
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildLoaded(BuildContext context, List<OraclePriceEntry> prices) {
    final colors = context.colors;

    if (prices.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(PhosphorIconsRegular.tag, size: 48, color: colors.textMuted),
            const SizedBox(height: 8),
            Text(context.tr('admin_no_prices'), style: TextStyle(color: colors.textMuted)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: colors.primaryBrand,
      onRefresh: () async {
        context.read<AdminOracleBloc>().add(LoadOraclePrices());
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Info header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: AlignmentDirectional.topStart,
                end: AlignmentDirectional.bottomEnd,
                colors: [colors.primaryBrand, colors.primaryBrandHover],
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(PhosphorIconsRegular.tag, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        context.tr('admin_oracle_engine'),
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        '${prices.length} ${context.tr('admin_oracle_monitored')}',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.8),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Price cards
          ...prices.map((p) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _buildPriceCard(context, colors, p),
          )),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildPriceCard(BuildContext context, SemanticColors colors, OraclePriceEntry price) {
    final isPositive = price.changePercent >= 0;
    final changeColor = isPositive ? colors.error : colors.success;
    final changeIcon = isPositive ? PhosphorIconsRegular.trendUp : PhosphorIconsRegular.trendDown;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.strokeBorder.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: colors.warmEarth.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(PhosphorIconsRegular.package, color: colors.warmEarth, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  price.materialName,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.textHeading,
                  ),
                ),
                Text(
                  '${context.tr('admin_oracle_unit_label')} ${price.unit}',
                  style: TextStyle(fontSize: 11, color: colors.textMuted),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '\$${price.currentPrice.toStringAsFixed(2)}',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: colors.textHeading,
                ),
              ),
              const SizedBox(height: 2),
              Container(
                padding: const EdgeInsetsDirectional.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: changeColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(changeIcon, size: 12, color: changeColor),
                    const SizedBox(width: 2),
                    Text(
                      '${isPositive ? '+' : ''}${price.changePercent.toStringAsFixed(1)}%',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: changeColor,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
