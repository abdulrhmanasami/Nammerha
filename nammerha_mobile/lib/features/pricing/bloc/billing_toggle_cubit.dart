import 'package:flutter_bloc/flutter_bloc.dart';

// ═══════════════════════════════════════════════════════════════════════════
// BillingToggleCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Manages the monthly ↔ yearly billing toggle for PricingScreen.

class BillingToggleCubit extends Cubit<bool> {
  BillingToggleCubit() : super(false); // false = monthly, true = yearly

  void setMonthly() => emit(false);
  void setYearly() => emit(true);
  void toggle() => emit(!state);
}
