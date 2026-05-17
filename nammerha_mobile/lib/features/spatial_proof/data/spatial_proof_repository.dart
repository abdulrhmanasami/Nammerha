import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../../../core/network/api_client.dart';
import '../../../core/graphql/mutations/spatial_proof_mutations.dart';
import '../../../core/services/api_services.dart';

/// Spatial Proof Repository — GraphQL-First with REST Fallback
///
/// Architecture (3-phase upload pipeline):
///   Phase 1: `requestUploadUrl` GraphQL mutation → pre-signed S3 URL + publicUrl
///   Phase 2: HTTP PUT to S3 (direct upload, no server proxy)
///   Phase 3: `submitSpatialProof` GraphQL mutation → metadata + GPS binding
///
/// Financial Safety:
///   This is NOT a financial mutation, but it IS an escrow prerequisite.
///   A verified spatial proof is required before `releaseEscrow` can execute.
///   The `clientHash` parameter provides tamper-evidence via SHA-256.
///
/// Fallback Strategy:
///   If GraphQL returns 502/503/504 (infrastructure down), falls back to
///   REST endpoints: `POST /storage/upload-url` + `POST /engineer/camera/spatial-proof`.
///   The REST path uses `StorageApi` and `EngineerApi` from api_services.dart.
class SpatialProofRepository {
  final NammerhaApiClient _apiClient;
  final StorageApi _storageApi;
  final EngineerApi _engineerApi;

  SpatialProofRepository({
    NammerhaApiClient? apiClient,
    StorageApi? storageApi,
    EngineerApi? engineerApi,
  })  : _apiClient = apiClient ?? NammerhaApiClient.instance,
        _storageApi = storageApi ?? StorageApi(),
        _engineerApi = engineerApi ?? EngineerApi();

  /// Upload image and submit GPS-verified spatial proof.
  ///
  /// [projectId] — Target project OCDS ID
  /// [itemId] — BOQ item being verified
  /// [imageBytes] — Raw 4K camera capture bytes
  /// [lat], [lng] — WGS-84 GPS coordinates
  /// [accuracy] — Device GPS accuracy in meters
  /// [clientHash] — SHA-256 composite hash (computed in Isolate by BLoC)
  ///
  /// Returns [SpatialProofResult] with the backend-assigned proof metadata.
  Future<SpatialProofResult> uploadAndSubmitProof({
    required String projectId,
    required String itemId,
    required Uint8List imageBytes,
    required double lat,
    required double lng,
    required double accuracy,
    required String clientHash,
  }) async {
    try {
      return await _executeGraphQL(
        projectId: projectId,
        itemId: itemId,
        imageBytes: imageBytes,
        lat: lat,
        lng: lng,
        accuracy: accuracy,
        clientHash: clientHash,
      );
    } on ApiException catch (e) {
      // Infrastructure failure → REST fallback
      if (e.statusCode == 502 || e.statusCode == 503 || e.statusCode == 504) {
        return _executeRestFallback(
          projectId: projectId,
          itemId: itemId,
          imageBytes: imageBytes,
          lat: lat,
          lng: lng,
          accuracy: accuracy,
          clientHash: clientHash,
        );
      }
      rethrow;
    }
  }

  /// PRIMARY: GraphQL pipeline
  Future<SpatialProofResult> _executeGraphQL({
    required String projectId,
    required String itemId,
    required Uint8List imageBytes,
    required double lat,
    required double lng,
    required double accuracy,
    required String clientHash,
  }) async {
    // ── Phase 1: Request pre-signed upload URL ──────────────────────────
    final uploadData = await _apiClient.graphql(
      query: SpatialProofMutations.requestUploadUrl,
      variables: {
        'input': {
          'projectId': projectId,
          'category': 'proof',
          'filename': 'proof_${DateTime.now().millisecondsSinceEpoch}.jpg',
          'contentType': 'image/jpeg',
          'sizeBytes': imageBytes.length,
        },
      },
      operationName: 'RequestUploadUrl',
    );

    final uploadResult = uploadData['requestUploadUrl'] as Map<String, dynamic>?;
    if (uploadResult == null) {
      throw const ApiException('err_upload_url_extract');
    }

    final uploadUrl = uploadResult['uploadUrl'] as String;
    final publicUrl = uploadResult['publicUrl'] as String;

    // ── Phase 2: Direct S3 upload (no server proxy) ─────────────────────
    final s3Response = await http.put(
      Uri.parse(uploadUrl),
      headers: {'Content-Type': 'image/jpeg'},
      body: imageBytes,
    );

    if (s3Response.statusCode != 200 && s3Response.statusCode != 201) {
      throw ApiException(
        'err_s3_upload',
      );
    }

    // ── Phase 3: Submit spatial proof metadata (GraphQL) ─────────────────
    final proofData = await _apiClient.graphql(
      query: SpatialProofMutations.submitSpatialProof,
      variables: {
        'input': {
          'itemId': itemId,
          'projectId': projectId,
          'imageUrl': publicUrl,
          'gpsLat': lat,
          'gpsLng': lng,
          'gpsAccuracyMeters': accuracy,
          'clientHash': clientHash,
        },
      },
      operationName: 'SubmitSpatialProof',
    );

    final proof = proofData['submitSpatialProof'] as Map<String, dynamic>?;
    if (proof == null) {
      throw const ApiException('err_proof_register');
    }

    return SpatialProofResult.fromJson(proof);
  }

  /// FALLBACK: REST pipeline (identical business logic, different transport)
  Future<SpatialProofResult> _executeRestFallback({
    required String projectId,
    required String itemId,
    required Uint8List imageBytes,
    required double lat,
    required double lng,
    required double accuracy,
    required String clientHash,
  }) async {
    // Phase 1: REST upload URL
    final uploadData = await _storageApi.getUploadUrl(
      projectId: projectId,
      category: 'spatial_proof',
      filename: 'proof_${DateTime.now().millisecondsSinceEpoch}.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: imageBytes.length,
    );

    final uploadUrl = uploadData['upload_url'] as String?;
    final fileUrl = uploadData['file_url'] as String?;

    if (uploadUrl == null || fileUrl == null) {
      throw const ApiException('err_upload_url_rest');
    }

    // Phase 2: Direct S3 upload
    final s3Response = await http.put(
      Uri.parse(uploadUrl),
      headers: {'Content-Type': 'image/jpeg'},
      body: imageBytes,
    );

    if (s3Response.statusCode != 200 && s3Response.statusCode != 201) {
      throw ApiException(
        'err_s3_upload_rest',
      );
    }

    // Phase 3: REST proof submission
    await _engineerApi.submitSpatialProof(
      itemId: itemId,
      projectId: projectId,
      imageUrl: fileUrl,
      gpsLat: lat,
      gpsLng: lng,
      gpsAccuracyMeters: accuracy,
      clientHash: clientHash,
    );

    // REST doesn't return the proof object — construct minimal result
    return SpatialProofResult(
      proofId: '', // Unknown from REST — populated on next fetch
      verificationStatus: 'SUBMITTED',
      clientHash: clientHash,
    );
  }
}

// ─── Data Model ───────────────────────────────────────────────────────────────

/// Result from a spatial proof submission.
///
/// Contains the backend-assigned metadata including the proof ID and
/// GPS verification status. Used by the BLoC to emit success state.
class SpatialProofResult {
  final String proofId;
  final String? imageUrl;
  final String? gpsCoordinates;
  final double? gpsAccuracyMeters;
  final String verificationStatus;
  final String? clientHash;
  final String? capturedAt;

  const SpatialProofResult({
    required this.proofId,
    this.imageUrl,
    this.gpsCoordinates,
    this.gpsAccuracyMeters,
    required this.verificationStatus,
    this.clientHash,
    this.capturedAt,
  });

  factory SpatialProofResult.fromJson(Map<String, dynamic> json) {
    return SpatialProofResult(
      proofId: json['proofId'] as String? ?? '',
      imageUrl: json['imageUrl'] as String?,
      gpsCoordinates: json['gpsCoordinates'] as String?,
      gpsAccuracyMeters: (json['gpsAccuracyMeters'] as num?)?.toDouble(),
      verificationStatus: json['verificationStatus'] as String? ?? 'SUBMITTED',
      clientHash: json['imageHash'] as String? ?? json['clientHash'] as String?,
      capturedAt: json['capturedAt'] as String?,
    );
  }

  @override
  String toString() =>
      'SpatialProofResult($proofId, status: $verificationStatus)';
}
