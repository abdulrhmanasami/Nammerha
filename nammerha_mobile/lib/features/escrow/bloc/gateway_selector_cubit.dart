import 'package:flutter_bloc/flutter_bloc.dart';

// ═══════════════════════════════════════════════════════════════════════════
// GatewaySelectorCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════

class GatewaySelectorCubit extends Cubit<String> {
  GatewaySelectorCubit() : super('fatora');

  void selectGateway(String gateway) => emit(gateway);
}
