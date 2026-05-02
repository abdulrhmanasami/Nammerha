import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// DonationFormCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════
// Manages: _isAnonymous toggle + _isSubmitting loading state.

class DonationFormState extends Equatable {
  final bool isAnonymous;
  final bool isSubmitting;

  const DonationFormState({this.isAnonymous = false, this.isSubmitting = false});

  DonationFormState copyWith({bool? isAnonymous, bool? isSubmitting}) {
    return DonationFormState(
      isAnonymous: isAnonymous ?? this.isAnonymous,
      isSubmitting: isSubmitting ?? this.isSubmitting,
    );
  }

  @override
  List<Object?> get props => [isAnonymous, isSubmitting];
}

class DonationFormCubit extends Cubit<DonationFormState> {
  DonationFormCubit() : super(const DonationFormState());

  void toggleAnonymous(bool value) => emit(state.copyWith(isAnonymous: value));
  void setSubmitting(bool value) => emit(state.copyWith(isSubmitting: value));
}
