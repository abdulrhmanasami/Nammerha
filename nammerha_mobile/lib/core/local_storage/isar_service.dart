import 'package:isar/isar.dart';
import 'package:path_provider/path_provider.dart';

import 'entities/project_entity.dart';
import 'entities/spatial_proof_entity.dart';

class IsarService {
  late Future<Isar> db;

  IsarService() {
    db = openDB();
  }

  Future<Isar> openDB() async {
    if (Isar.instanceNames.isEmpty) {
      final dir = await getApplicationDocumentsDirectory();
      return await Isar.open(
        [ProjectEntitySchema, SpatialProofEntitySchema],
        directory: dir.path,
        inspector: true, // Useful during development
      );
    }
    return Future.value(Isar.getInstance());
  }
}
