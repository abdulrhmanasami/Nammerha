import 'dart:convert';
import 'package:crypto/crypto.dart';

/// GPS Signature model designed for Absolute Spatial Reality standard
/// (IMP-007 from Nammerha Phase 1 Server constraints)
class GpsSignature {
  final double latitude;
  final double longitude;
  final double accuracy;
  final DateTime timestamp;
  
  // Platinum Standard: Prevent tampering by generating SHA-256 client hash
  // combining exactly what the server expects.
  late final String clientHash;

  GpsSignature({
    required this.latitude,
    required this.longitude,
    required this.accuracy,
    required this.timestamp,
  }) {
    clientHash = _generateClientHash();
  }

  /// Cryptographic hashing function that MUST MATCH the server-side validation exactly
  String _generateClientHash() {
    // Expected format by backend: "{lat}_{lng}_{isoTimestamp}_{secret}"
    // Note: The specific secret salt should ideally be injected via secure config
    // or established via an initial handshake, here we use a deterministic combination.
    final payload = '${latitude.toStringAsFixed(6)}_${longitude.toStringAsFixed(6)}_${timestamp.toIso8601String()}_nammerha_salt_2026';
    final bytes = utf8.encode(payload);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  Map<String, dynamic> toJson() {
    return {
      'latitude': latitude,
      'longitude': longitude,
      'accuracy': accuracy,
      'timestamp': timestamp.toIso8601String(),
      'clientHash': clientHash,
    };
  }

  @override
  String toString() {
    return 'GpsSignature(lat: $latitude, lng: $longitude, acc: ${accuracy}m, hash: $clientHash)';
  }
}
