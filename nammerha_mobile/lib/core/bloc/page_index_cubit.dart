import 'package:flutter_bloc/flutter_bloc.dart';

// ═══════════════════════════════════════════════════════════════════════════
// PageIndexCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Manages the current page index for PageView-based screens
// (onboarding, guided tour, dashboard bottom nav).

class PageIndexCubit extends Cubit<int> {
  PageIndexCubit([super.initialIndex = 0]);

  void setPage(int index) => emit(index);
}
