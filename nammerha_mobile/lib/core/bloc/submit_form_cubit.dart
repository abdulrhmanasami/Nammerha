import 'package:flutter_bloc/flutter_bloc.dart';

// ═══════════════════════════════════════════════════════════════════════════
// SubmitFormCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Generic isSubmitting cubit for form submission screens.

class SubmitFormCubit extends Cubit<bool> {
  SubmitFormCubit() : super(false);

  void setSubmitting(bool value) => emit(value);
}
