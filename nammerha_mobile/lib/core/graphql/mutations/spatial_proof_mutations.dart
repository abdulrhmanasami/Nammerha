/// GraphQL Mutations for Spatial Proof & Storage Operations
///
/// These mutations power the engineer's GPS-verified field camera:
///   1. `requestUploadUrl` — Pre-signed S3 URL for direct image upload
///   2. `submitSpatialProof` — Metadata submission with GPS binding
///
/// Architecture:
///   Client → requestUploadUrl → HTTP PUT to S3 → submitSpatialProof
///   This avoids proxying 4K images through the API server.
class SpatialProofMutations {
  /// Request a pre-signed S3 upload URL.
  /// Returns { uploadUrl, publicUrl, storageKey, expiresAt }.
  ///
  /// - `uploadUrl`: PUT this with image bytes (direct to S3)
  /// - `publicUrl`: Permanent CDN/access URL for the uploaded file
  /// - `storageKey`: S3 object key for reference
  /// - `expiresAt`: URL expiry timestamp
  static const String requestUploadUrl = r'''
    mutation RequestUploadUrl($input: RequestUploadUrlInput!) {
      requestUploadUrl(input: $input) {
        uploadUrl
        publicUrl
        storageKey
        expiresAt
      }
    }
  ''';

  /// Submit a GPS-verified spatial proof after image upload.
  /// Returns the full SpatialProof object with verification status.
  ///
  /// Requires ENGINEER role — backend enforces `requireRole(context, 'engineer')`.
  ///
  /// Fields:
  ///   - `imageUrl`: The `publicUrl` from requestUploadUrl (permanent reference)
  ///   - `gpsLat/gpsLng`: WGS-84 coordinates (Haversine-validated by backend)
  ///   - `gpsAccuracyMeters`: Device GPS accuracy (flagged if > 150m)
  ///   - `clientHash`: SHA-256 composite hash (image bytes + GPS + timestamp)
  static const String submitSpatialProof = r'''
    mutation SubmitSpatialProof($input: SubmitSpatialProofInput!) {
      submitSpatialProof(input: $input) {
        proofId
        itemId
        projectId
        gpsCoordinates
        gpsAccuracyMeters
        imageUrl
        imageHash
        verificationStatus
        capturedAt
        createdAt
      }
    }
  ''';
}
