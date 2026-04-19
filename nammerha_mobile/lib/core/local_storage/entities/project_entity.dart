import 'package:isar/isar.dart';

part 'project_entity.g.dart';

@collection
class ProjectEntity {
  Id id = Isar.autoIncrement;

  @Index(unique: true, replace: true)
  late String remoteId;

  late String homeownerId;
  String? assignedEngineerId;
  String? assignedContractorId;

  late String title;
  String? description;
  String? coverImageUrl;
  
  late String addressText;
  late String damageType;
  String? damageSeverity;
  
  late String status;
  late bool isPublic;
  
  late String totalEstimatedCost;
  late String totalFundedAmount;
  late double fundedPercentage;

  DateTime? publishedAt;
  DateTime? completedAt;
  late DateTime createdAt;
  late DateTime updatedAt;
}
