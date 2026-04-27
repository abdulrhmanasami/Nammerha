import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/boq_item_model.dart';
import '../../bids/data/bids_repository.dart';
import '../../bids/screens/submit_bid_screen.dart';

class BOQDetailsScreen extends StatefulWidget {
  final String projectId;
  
  const BOQDetailsScreen({super.key, required this.projectId});

  @override
  State<BOQDetailsScreen> createState() => _BOQDetailsScreenState();
}

class _BOQDetailsScreenState extends State<BOQDetailsScreen> {
  final _repository = BidsRepository();
  bool _isLoading = true;
  String? _error;
  List<BOQItem> _items = [];

  @override
  void initState() {
    super.initState();
    _fetchBOQ();
  }

  Future<void> _fetchBOQ() async {
    try {
      final jsonList = await _repository.getProjectBOQ(widget.projectId);
      // High Performance Parsing via Isolate
      final parsed = await BOQItem.parseList(jsonList);
      setState(() {
        _items = parsed;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F8),
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'جداول الكميات والتسعير',
          style: GoogleFonts.cairo(
            color: const Color(0xFF242424),
            fontWeight: FontWeight.bold,
          ),
        ),
        iconTheme: const IconThemeData(color: Color(0xFF242424)),
      ),
      body: _buildBody(),
      bottomNavigationBar: _items.isNotEmpty
          ? Container(
              padding: const EdgeInsets.all(16),
              color: Colors.white,
              child: SafeArea(
                child: ElevatedButton(
                  style: ButtonStyle(
                    backgroundColor: WidgetStateProperty.all(const Color(0xFF0D47A1)),
                    padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 16)),
                    shape: WidgetStateProperty.all(
                      RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => SubmitBidScreen(projectId: widget.projectId),
                      ),
                    );
                  },
                  child: Text(
                    'تقديم عطاء (Bid)',
                    style: GoogleFonts.cairo(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            )
          : null,
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFF0D47A1)));
    }
    if (_error != null) {
      return Center(
        child: Text(
          _error!,
          style: GoogleFonts.cairo(color: Colors.red),
        ),
      );
    }
    if (_items.isEmpty) {
      return Center(
        child: Text(
          'لا توجد عناصر في جدول الكميات',
          style: GoogleFonts.cairo(color: Colors.grey),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _items.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final item = _items[index];
        return _buildBOQCard(item);
      },
    );
  }

  Widget _buildBOQCard(BOQItem item) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.name,
                  style: GoogleFonts.cairo(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: const Color(0xFF242424),
                  ),
                ),
              ),
              if (item.hasInflation)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFCC934).withValues(alpha: 0.2), // Warning Yellow
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.trending_up, color: Color(0xFFFCC934), size: 16),
                      const SizedBox(width: 4),
                      Text(
                        'تضخم (FIDIC 13.8)',
                        style: GoogleFonts.cairo(
                          color: const Color(0xFFFCC934),
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            item.description,
            style: GoogleFonts.cairo(color: Colors.grey.shade600),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildStat('الكمية', '\${item.quantity} \${item.unit}'),
              _buildStat('السعر التقديري', '\${item.estimatedUnitPrice} USD'),
              if (item.currentMarketPrice != null)
                _buildStat('سعر السوق (Oracle)', '\${item.currentMarketPrice} USD', isWarning: item.hasInflation),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStat(String label, String val, {bool isWarning = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.cairo(
            fontSize: 12,
            color: Colors.grey.shade500,
          ),
        ),
        Text(
          val,
          style: GoogleFonts.cairo(
            fontWeight: FontWeight.bold,
            color: isWarning ? const Color(0xFFFCC934) : const Color(0xFF242424),
          ),
        ),
      ],
    );
  }
}
