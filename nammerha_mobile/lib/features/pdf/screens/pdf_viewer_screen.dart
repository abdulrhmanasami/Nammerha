import 'package:phosphor_flutter/phosphor_flutter.dart';
// ============================================================================
// Nammerha — PDF Viewer Screen (Platinum Standard)
// ============================================================================
// Full-featured in-app PDF viewer with:
// - Download progress overlay
// - Native PDF rendering (flutter_pdfview)
// - Page navigation (counter + jump)
// - Share via system share sheet
// - Error handling with retry
// - RTL-safe layout
//
// P2-001 AUDIT: setState RETAINED (Platinum Approved) — Hardware controller
// pattern. Download progress, page count, and error states are ephemeral,
// widget-scoped, and do not justify a Cubit/BLoC.
// ============================================================================


import 'package:flutter/material.dart';
import 'package:flutter_pdfview/flutter_pdfview.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/services/pdf_download_service.dart';
import '../../../core/i18n/t.dart';

/// Full-screen PDF viewer that downloads and renders a PDF from a URL.
///
/// Usage:
/// ```dart
/// Navigator.push(context, MaterialPageRoute(
///   builder: (_) => PdfViewerScreen(
///     url: 'https://api.nammerha.com/receipts/abc.pdf',
///     title: 'إيصال التبرع',
///   ),
/// ));
/// ```
class PdfViewerScreen extends StatefulWidget {
  /// The URL of the PDF to display.
  final String url;

  /// Title shown in the app bar.
  final String title;

  /// Optional subtitle (e.g., project name, receipt ID).
  final String? subtitle;

  const PdfViewerScreen({
    super.key,
    required this.url,
    required this.title,
    this.subtitle,
  });

  @override
  State<PdfViewerScreen> createState() => _PdfViewerScreenState();
}

class _PdfViewerScreenState extends State<PdfViewerScreen> {
  _PdfState _state = _PdfState.downloading;
  double _progress = 0.0;
  String? _localPath;
  String? _errorMessage;
  int _currentPage = 0;
  int _totalPages = 0;
  // ignore: unused_field — retained for future page-jump feature
  PDFViewController? _pdfController;

  @override
  void initState() {
    super.initState();
    _downloadPdf();
  }

  Future<void> _downloadPdf() async {
    setState(() {
      _state = _PdfState.downloading;
      _progress = 0.0;
      _errorMessage = null;
    });

    try {
      final result = await PdfDownloadService.instance.download(
        widget.url,
        onProgress: (p) {
          if (mounted) setState(() => _progress = p);
        },
      );

      if (mounted) {
        setState(() {
          _localPath = result.localPath;
          _state = _PdfState.ready;
        });
      }
    } on PdfDownloadException catch (e) {
      if (mounted) {
        setState(() {
          _state = _PdfState.error;
          _errorMessage = e.message;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _state = _PdfState.error;
          _errorMessage = e.toString();
        });
      }
    }
  }

  void _sharePdf() {
    if (_localPath == null) return;
    SharePlus.instance.share(
      ShareParams(
        files: [XFile(_localPath!)],
        subject: widget.title,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.backgroundPrimary,
      appBar: AppBar(
        backgroundColor: colors.surfaceElevated,
        elevation: 0,
        iconTheme: IconThemeData(color: colors.textHeading),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.title,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: colors.textHeading,
              ),
            ),
            if (widget.subtitle != null)
              Text(
                widget.subtitle!,
                style: TextStyle(fontSize: 11, color: colors.textMuted),
              ),
          ],
        ),
        actions: [
          // Page counter
          if (_state == _PdfState.ready && _totalPages > 0)
            Center(
              child: Container(
                margin: const EdgeInsetsDirectional.only(end: 8),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: colors.primaryBrand.withAlpha(12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${_currentPage + 1} / $_totalPages',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: colors.primaryBrand,
                  ),
                ),
              ),
            ),
          // Share button
          if (_state == _PdfState.ready)
            IconButton(
              icon: Icon(PhosphorIconsRegular.shareNetwork, color: colors.primaryBrand),
              onPressed: _sharePdf,
              tooltip: context.tr('share'),
            ),
        ],
      ),
      body: _buildBody(colors),
    );
  }

  Widget _buildBody(SemanticColors colors) {
    switch (_state) {
      case _PdfState.downloading:
        return _buildDownloading(colors);
      case _PdfState.ready:
        return _buildPdfView(colors);
      case _PdfState.error:
        return _buildError(colors);
    }
  }

  // ─── Download Progress ──────────────────────────────────────────────

  Widget _buildDownloading(SemanticColors colors) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Animated PDF icon
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: colors.primaryBrand.withAlpha(12),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(
                PhosphorIconsRegular.filePdf,
                size: 40,
                color: colors.primaryBrand,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'جاري تحميل المستند...',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: colors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${(_progress * 100).toInt()}%',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: colors.primaryBrand,
              ),
            ),
            const SizedBox(height: 16),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: _progress > 0 ? _progress : null,
                backgroundColor: colors.backgroundSecondary,
                valueColor: AlwaysStoppedAnimation(colors.primaryBrand),
                minHeight: 8,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              widget.title,
              style: TextStyle(fontSize: 13, color: colors.textMuted),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  // ─── PDF Rendering ──────────────────────────────────────────────────

  Widget _buildPdfView(SemanticColors colors) {
    if (_localPath == null) return const SizedBox.shrink();

    return PDFView(
      filePath: _localPath!,
      enableSwipe: true,
      swipeHorizontal: false,
      autoSpacing: true,
      pageFling: true,
      pageSnap: true,
      fitPolicy: FitPolicy.BOTH,
      nightMode: Theme.of(context).brightness == Brightness.dark,
      onRender: (pages) {
        if (mounted && pages != null) {
          setState(() => _totalPages = pages);
        }
      },
      onViewCreated: (controller) {
        _pdfController = controller;
      },
      onPageChanged: (page, total) {
        if (mounted && page != null) {
          setState(() => _currentPage = page);
        }
      },
      onError: (error) {
        if (mounted) {
          setState(() {
            _state = _PdfState.error;
            _errorMessage = error.toString();
          });
        }
      },
    );
  }

  // ─── Error State ────────────────────────────────────────────────────

  Widget _buildError(SemanticColors colors) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: colors.error.withAlpha(12),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(
                PhosphorIconsRegular.fileX,
                size: 40,
                color: colors.error,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'تعذّر تحميل المستند',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: colors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _errorMessage ?? 'خطأ غير معروف',
              style: TextStyle(fontSize: 13, color: colors.textMuted),
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _downloadPdf,
              icon: Icon(PhosphorIconsRegular.arrowsClockwise),
              label: Text(context.tr('retry')),
              style: FilledButton.styleFrom(
                backgroundColor: colors.primaryBrand,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 12),
            // Fallback: open in browser
            TextButton.icon(
              onPressed: () async {
                final uri = Uri.parse(widget.url);
                // url_launcher is already a dependency
                if (await canLaunchUrl(uri)) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                }
              },
              icon: Icon(PhosphorIconsRegular.arrowSquareOut, color: colors.textSecondary, size: 18),
              label: Text(
                'فتح في المتصفح',
                style: TextStyle(color: colors.textSecondary, fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

enum _PdfState { downloading, ready, error }
