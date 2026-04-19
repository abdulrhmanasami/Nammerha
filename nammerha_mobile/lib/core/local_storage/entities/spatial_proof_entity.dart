import 'package:isar/isar.dart';

part 'spatial_proof_entity.g.dart';

@collection
class SpatialProofEntity {
  Id id = Isar.autoIncrement;

  @Index(unique: true, replace: true)
  late String remoteId;

  @Index()
  late String projectId;

  @Index()
  late String itemId;

  late String engineerId;
  
  late double gpsLat;
  late double gpsLng;
  double? gpsAccuracyMeters;
  
  late String imageUrl;
  String? imageHash;
  String? description;
  
  late String verificationStatus;
  late DateTime capturedAt;
  
  bool isSynced = true; // False if captured offline and waiting to sync
}
