import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:nammerha_mobile/features/escrow/bloc/escrow_bloc.dart';
import 'package:nammerha_mobile/features/escrow/bloc/escrow_event.dart';
import 'package:nammerha_mobile/features/escrow/bloc/escrow_state.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

class EscrowCheckoutScreen extends StatefulWidget {
  final List<Map<String, dynamic>> basketItems;
  final double totalAmount;

  const EscrowCheckoutScreen({
    Key? key,
    required this.basketItems,
    required this.totalAmount,
  }) : super(key: key);

  @override
  State<EscrowCheckoutScreen> createState() => _EscrowCheckoutScreenState();
}

class _EscrowCheckoutScreenState extends State<EscrowCheckoutScreen> {
  String _selectedGateway = 'fatora';

  Future<void> _handlePayment(String? url, String? clientSecret) async {
    if (clientSecret != null && clientSecret.isNotEmpty && _selectedGateway == 'stripe') {
      try {
        await Stripe.instance.initPaymentSheet(
          paymentSheetParameters: SetupPaymentSheetParameters(
            paymentIntentClientSecret: clientSecret,
            merchantDisplayName: 'Nammerha Platform',
            allowsDelayedPaymentMethods: true,
          ),
        );
        await Stripe.instance.presentPaymentSheet();
        _showAwaitingDialog();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Payment failed or cancelled: $e')),
          );
        }
      }
    } else if (url != null && url.isNotEmpty) {
      final uri = Uri.parse(url);
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to open payment gateway. Please try again.')),
          );
        }
      } else {
        _showAwaitingDialog();
      }
    }
  }

  void _showAwaitingDialog() {
    if (mounted) {
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: const Text('Awaiting Payment'),
          content: const Text('Please verify the transaction details.'),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(context); // close dialog
                context.read<EscrowBloc>().add(LoadEscrowSummaryEvent());
                Navigator.pop(context); // return to previous screen
              },
              child: const Text('I have completed the payment'),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: const Text('Secure Checkout', style: TextStyle(fontWeight: FontWeight.w600)),
        backgroundColor: Colors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.black87),
        titleTextStyle: const TextStyle(color: Colors.black87, fontSize: 18, fontWeight: FontWeight.bold),
      ),
      body: BlocConsumer<EscrowBloc, EscrowState>(
        listener: (context, state) {
          if (state is EscrowCheckoutReady) {
            _handlePayment(state.checkoutUrl, state.clientSecret);
          } else if (state is EscrowError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message, style: const TextStyle(color: Colors.white))),
            );
          }
        },
        builder: (context, state) {
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Funding Summary',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Color(0xFF1F2937)),
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4)),
                        ],
                      ),
                      child: ListView.separated(
                        itemCount: widget.basketItems.length,
                        separatorBuilder: (context, index) => const Divider(height: 1, color: Color(0xFFE5E7EB)),
                        itemBuilder: (context, index) {
                          final item = widget.basketItems[index];
                          return ListTile(
                            title: Text(item['name'] ?? 'BOQ Item', style: const TextStyle(fontWeight: FontWeight.w500)),
                            trailing: Text(
                              '\$${((item['amount'] as num) / 100).toStringAsFixed(2)}',
                              style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF047857)),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Total Secure Escrow', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
                      Text(
                        '\$${(widget.totalAmount / 100).toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF1F2937)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Select Payment Gateway',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF374151)),
                  ),
                  const SizedBox(height: 12),
                  _buildGatewaySelector('Fatora (Local/International)', 'fatora'),
                  const SizedBox(height: 8),
                  _buildGatewaySelector('Visa Click-to-Pay / Native Stripe', 'stripe'),
                  const SizedBox(height: 32),
                  ElevatedButton(
                    onPressed: state is EscrowLoading
                        ? null
                        : () {
                            context.read<EscrowBloc>().add(
                                  InitiateDonationEvent(
                                    items: widget.basketItems,
                                    paymentMethod: _selectedGateway,
                                  ),
                                );
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF3B82F6),
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 0,
                    ),
                    child: state is EscrowLoading
                        ? const SizedBox(
                            width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Text('Lock Funds in Escrow', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildGatewaySelector(String title, String gatewayValue) {
    final isSelected = _selectedGateway == gatewayValue;
    return GestureDetector(
      onTap: () => setState(() => _selectedGateway = gatewayValue),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFFEFF6FF) : Colors.white,
          border: Border.all(
            color: isSelected ? const Color(0xFF3B82F6) : const Color(0xFFD1D5DB),
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(
              isSelected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              color: isSelected ? const Color(0xFF3B82F6) : const Color(0xFF9CA3AF),
            ),
            const SizedBox(width: 12),
            Text(title, style: TextStyle(fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400, color: const Color(0xFF1F2937))),
          ],
        ),
      ),
    );
  }
}
