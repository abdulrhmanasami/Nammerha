import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:nammerha_mobile/features/escrow/bloc/escrow_bloc.dart';
import 'package:nammerha_mobile/features/escrow/bloc/escrow_event.dart';
import 'package:nammerha_mobile/features/escrow/bloc/escrow_state.dart';

class EscrowSummaryScreen extends StatefulWidget {
  const EscrowSummaryScreen({Key? key}) : super(key: key);

  @override
  State<EscrowSummaryScreen> createState() => _EscrowSummaryScreenState();
}

class _EscrowSummaryScreenState extends State<EscrowSummaryScreen> {
  @override
  void initState() {
    super.initState();
    context.read<EscrowBloc>().add(LoadEscrowSummaryEvent());
  }

  final _currencyFormat = NumberFormat.currency(symbol: '\$', decimalDigits: 2);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: const Text('My Escrow Vault', style: TextStyle(fontWeight: FontWeight.w600)),
        backgroundColor: Colors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.black87),
        titleTextStyle: const TextStyle(color: Colors.black87, fontSize: 18, fontWeight: FontWeight.bold),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => context.read<EscrowBloc>().add(LoadEscrowSummaryEvent()),
          ),
        ],
      ),
      body: BlocBuilder<EscrowBloc, EscrowState>(
        buildWhen: (previous, current) => current is EscrowSummaryLoaded || current is EscrowLoading || current is EscrowError,
        builder: (context, state) {
          if (state is EscrowLoading) {
            return const Center(child: CircularProgressIndicator(color: Color(0xFF3B82F6)));
          } else if (state is EscrowError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, color: Colors.red, size: 48),
                  const SizedBox(height: 16),
                  Text(state.message, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF4B5563))),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => context.read<EscrowBloc>().add(LoadEscrowSummaryEvent()),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          } else if (state is EscrowSummaryLoaded) {
            final summary = state.summary;
            return RefreshIndicator(
              onRefresh: () async {
                context.read<EscrowBloc>().add(LoadEscrowSummaryEvent());
              },
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _buildStatusCard(
                      'Locked in Escrow',
                      (summary['totalLocked'] ?? 0) / 100,
                      Icons.lock_clock,
                      const Color(0xFF047857),
                      const Color(0xFFD1FAE5),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: _buildStatusCard(
                            'Released',
                            (summary['totalReleased'] ?? 0) / 100,
                            Icons.check_circle,
                            const Color(0xFF3B82F6),
                            const Color(0xFFDBEAFE),
                            isSmall: true,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: _buildStatusCard(
                            'Refunded',
                            (summary['totalRefunded'] ?? 0) / 100,
                            Icons.settings_backup_restore,
                            const Color(0xFF6B7280),
                            const Color(0xFFF3F4F6),
                            isSmall: true,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 32),
                    const Text(
                      'Information securely synchronized via Platinum Standard ledgering framework. Funds are cryptographically locked until spatial delivery proof is provided by the designated engineer.',
                      style: TextStyle(color: Color(0xFF6B7280), fontSize: 13, height: 1.5),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            );
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildStatusCard(String title, num amount, IconData icon, Color mainColor, Color bgColor, {bool isSmall = false}) {
    return Container(
      padding: EdgeInsets.all(isSmall ? 16 : 24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4)),
        ],
        border: Border.all(color: const Color(0xFFE5E7EB), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(8)),
                child: Icon(icon, color: mainColor, size: isSmall ? 20 : 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: isSmall ? 14 : 16,
                    fontWeight: FontWeight.w500,
                    color: const Color(0xFF4B5563),
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: isSmall ? 12 : 20),
          Text(
            _currencyFormat.format(amount),
            style: TextStyle(
              fontSize: isSmall ? 24 : 32,
              fontWeight: FontWeight.bold,
              color: const Color(0xFF1F2937),
            ),
          ),
        ],
      ),
    );
  }
}
