import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class TransparencyDashboardScreen extends StatelessWidget {
  final String projectId;
  
  const TransparencyDashboardScreen({super.key, required this.projectId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F8),
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'الشفافية والبيانات المفتوحة (OCDS)',
          style: GoogleFonts.cairo(
            color: const Color(0xFF242424),
            fontWeight: FontWeight.bold,
          ),
        ),
        iconTheme: const IconThemeData(color: Color(0xFF242424)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildInfoCard(
              title: 'الشفافية المطلقة',
              description: 'يتوافق هذا المشروع مع معايير التعاقد المفتوح (OCDS). يمكنك تتبع كل دولار تم التبرع به حتى لحظة صرفه.',
              icon: Icons.public,
              color: const Color(0xFF0D47A1),
            ),
            const SizedBox(height: 24),
            Text(
              'سجل الضمان (Escrow Ledger)',
              style: GoogleFonts.cairo(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: const Color(0xFF242424),
              ),
            ),
            const SizedBox(height: 16),
            _buildLedgerTimeline(),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoCard({
    required String title,
    required String description,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 32),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.cairo(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: const Color(0xFF242424),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  description,
                  style: GoogleFonts.cairo(
                    color: Colors.grey.shade600,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLedgerTimeline() {
    // Mocking ledger entries for UI completion
    final mockEntries = [
      {'status': 'released', 'amount': '5,000 USD', 'date': '2026-04-20', 'note': 'تم الإفراج بعد المطابقة المكانية للمرحلة 1'},
      {'status': 'locked', 'amount': '10,000 USD', 'date': '2026-04-18', 'note': 'أموال محتجزة في الضمان بانتظار التنفيذ'},
    ];

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: mockEntries.length,
      itemBuilder: (context, index) {
        final entry = mockEntries[index];
        final isReleased = entry['status'] == 'released';
        
        return Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isReleased ? const Color(0xFF0A6E55).withValues(alpha: 0.3) : const Color(0xFFFCC934).withValues(alpha: 0.5),
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.02),
                blurRadius: 5,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    entry['amount']!,
                    style: GoogleFonts.cairo(
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                      color: isReleased ? const Color(0xFF0A6E55) : const Color(0xFF242424),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: isReleased ? const Color(0xFF0A6E55).withValues(alpha: 0.1) : const Color(0xFFFCC934).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      isReleased ? 'مُفرج (Released)' : 'محتجز (Locked)',
                      style: GoogleFonts.cairo(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: isReleased ? const Color(0xFF0A6E55) : const Color(0xFFD69E00), // Darker yellow for text
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                entry['note']!,
                style: GoogleFonts.cairo(color: Colors.grey.shade700),
              ),
              const SizedBox(height: 8),
              Text(
                entry['date']!,
                style: GoogleFonts.cairo(fontSize: 12, color: Colors.grey.shade500),
              ),
            ],
          ),
        );
      },
    );
  }
}
