import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:graphql_flutter/graphql_flutter.dart';
import '../../../core/network/graphql_client.dart';
import '../models/gps_signature.dart';

class SpatialProofRepository {
  Future<void> submitProof({
    required File imageFile,
    required String projectId,
    required String itemId,
    required GpsSignature signature,
  }) async {
    final client = NammerhaGraphQLClient.client.value;

    final bytes = await imageFile.readAsBytes();
    final ext = imageFile.path.split('.').last.toLowerCase();
    final contentType = ext == 'png' ? 'image/png' : 'image/jpeg';
    
    // 1. MinIO / S3 Handshake (Get Pre-signed URL)
    const requestUrlMutation = r'''
      mutation RequestUploadUrl($input: RequestUploadUrlInput!) {
        requestUploadUrl(input: $input) {
          uploadUrl
          storageKey
        }
      }
    ''';

    final urlResult = await client.mutate(
      MutationOptions(
        document: gql(requestUrlMutation),
        variables: {
          'input': {
            'projectId': projectId,
            'category': 'spatial_proofs',
            'filename': 'proof_\${DateTime.now().millisecondsSinceEpoch}.$ext',
            'contentType': contentType,
            'sizeBytes': bytes.length,
          }
        },
      ),
    );

    if (urlResult.hasException) {
      throw Exception('Failed to request upload URL: \${urlResult.exception.toString()}');
    }

    final uploadUrl = urlResult.data!['requestUploadUrl']['uploadUrl'];
    final storageKey = urlResult.data!['requestUploadUrl']['storageKey'];

    // 2. Direct-to-Storage Upload
    final uploadResponse = await http.put(
      Uri.parse(uploadUrl),
      headers: {'Content-Type': contentType},
      body: bytes,
    );

    if (uploadResponse.statusCode != 200 && uploadResponse.statusCode != 201) {
      throw Exception('Failed to upload image to specialized storage.');
    }

    // 3. Document Spatial Proof (GraphQL Mutation)
    const submitProofMutation = r'''
      mutation SubmitSpatialProof($input: SubmitSpatialProofInput!) {
        submitSpatialProof(input: $input) {
          proofId
          verificationStatus
        }
      }
    ''';

    final submitResult = await client.mutate(
      MutationOptions(
        document: gql(submitProofMutation),
        variables: {
          'input': {
            'itemId': itemId,
            'projectId': projectId,
            'gpsLat': signature.latitude,
            'gpsLng': signature.longitude,
            'gpsAccuracyMeters': signature.accuracy,
            'imageUrl': storageKey, // the backend resolves storageKey
            'clientHash': signature.clientHash,
          }
        },
      ),
    );

    if (submitResult.hasException) {
      throw Exception('Failed to submit spatial proof: \${submitResult.exception.toString()}');
    }
  }
}
