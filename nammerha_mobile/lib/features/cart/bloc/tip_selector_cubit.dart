import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

// ═══════════════════════════════════════════════════════════════════════════
// TipSelectorCubit — Platinum Standard (Absolute Zero setState)
// ═══════════════════════════════════════════════════════════════════════════

class TipSelectorState extends Equatable {
  final int selectedTipIndex;
  final bool isCustomTip;

  const TipSelectorState({this.selectedTipIndex = 0, this.isCustomTip = false});

  TipSelectorState copyWith({int? selectedTipIndex, bool? isCustomTip}) {
    return TipSelectorState(
      selectedTipIndex: selectedTipIndex ?? this.selectedTipIndex,
      isCustomTip: isCustomTip ?? this.isCustomTip,
    );
  }

  @override
  List<Object?> get props => [selectedTipIndex, isCustomTip];
}

class TipSelectorCubit extends Cubit<TipSelectorState> {
  TipSelectorCubit() : super(const TipSelectorState());

  void selectTip(int index) => emit(state.copyWith(selectedTipIndex: index, isCustomTip: false));
  void enableCustomTip() => emit(state.copyWith(isCustomTip: true));
  void notifyCustomChanged() => emit(TipSelectorState(selectedTipIndex: state.selectedTipIndex, isCustomTip: state.isCustomTip));
}
