// ============================================================================
// Nammerha — PDF Download Service
// ============================================================================
// Downloads PDF files from URL to temp directory with progress tracking.
// Designed for restricted bandwidth environments (Syria 2G/3G).
// Features: progress callback, caching, retry-safe, error isolation.
// ============================================================================

import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:crypto/crypto.dart';
import 'dart:convert';

/// Result of a PDF download operation.
class PdfDownloadResult {
  final String localPath;
  final bool fromCache;

  const PdfDownloadResult({required this.localPath, required this.fromCache});
}

/// Downloads and caches PDF files locally.
class PdfDownloadService {
  PdfDownloadService._();
  static final PdfDownloadService instance = PdfDownloadService._();

  /// Download a PDF from [url] to temp storage.
  ///
  /// - [onProgress] fires with 0.0–1.0 progress (null content-length = indeterminate)
  /// - Returns [PdfDownloadResult] with local file path
  /// - Caches by URL hash — subsequent calls return cached version instantly
  /// - Throws [PdfDownloadException] on failure
  Future<PdfDownloadResult> download(
    String url, {
    ValueChanged<double>? onProgress,
  }) async {
    // Generate cache-safe filename from URL hash
    final urlHash = md5.convert(utf8.encode(url)).toString();
    final tempDir = await getTemporaryDirectory();
    final cacheDir = Directory('${tempDir.path}/nammerha_pdf');
    if (!await cacheDir.exists()) {
      await cacheDir.create(recursive: true);
    }
    final filePath = '${cacheDir.path}/$urlHash.pdf';
    final file = File(filePath);

    // Return cached version if exists
    if (await file.exists() && await file.length() > 0) {
      onProgress?.call(1.0);
      return PdfDownloadResult(localPath: filePath, fromCache: true);
    }

    // Download with progress tracking
    try {
      final request = http.Request('GET', Uri.parse(url));
      final response = await request.send();

      if (response.statusCode != 200) {
        throw PdfDownloadException(
          'HTTP ${response.statusCode}',
          statusCode: response.statusCode,
        );
      }

      final contentLength = response.contentLength ?? 0;
      int received = 0;
      final sink = file.openWrite();

      await for (final chunk in response.stream) {
        sink.add(chunk);
        received += chunk.length;
        if (contentLength > 0) {
          onProgress?.call(received / contentLength);
        }
      }

      await sink.flush();
      await sink.close();

      // Validate downloaded file
      final downloadedSize = await file.length();
      if (downloadedSize == 0) {
        await file.delete();
        throw const PdfDownloadException('Downloaded file is empty');
      }

      onProgress?.call(1.0);
      return PdfDownloadResult(localPath: filePath, fromCache: false);
    } catch (e) {
      // Clean up partial download
      if (await file.exists()) {
        await file.delete();
      }
      if (e is PdfDownloadException) rethrow;
      throw PdfDownloadException('Download failed: $e');
    }
  }

  /// Clear all cached PDFs.
  Future<void> clearCache() async {
    try {
      final tempDir = await getTemporaryDirectory();
      final cacheDir = Directory('${tempDir.path}/nammerha_pdf');
      if (await cacheDir.exists()) {
        await cacheDir.delete(recursive: true);
      }
    } catch (_) {
      // Non-fatal
    }
  }
}

/// Exception thrown when PDF download fails.
class PdfDownloadException implements Exception {
  final String message;
  final int? statusCode;

  const PdfDownloadException(this.message, {this.statusCode});

  @override
  String toString() => 'PdfDownloadException: $message';
}
