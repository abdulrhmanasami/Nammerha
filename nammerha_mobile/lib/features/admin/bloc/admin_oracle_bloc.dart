import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../api/admin_api.dart';
import '../models/admin_models.dart';

// ─── Events ─────────────────────────────────────────────────────────────────

abstract class AdminOracleEvent extends Equatable {
  const AdminOracleEvent();
  @override
  List<Object?> get props => [];
}

class LoadOraclePrices extends AdminOracleEvent {}

// ─── States ─────────────────────────────────────────────────────────────────

abstract class AdminOracleState extends Equatable {
  const AdminOracleState();
  @override
  List<Object?> get props => [];
}

class AdminOracleInitial extends AdminOracleState {}
class AdminOracleLoading extends AdminOracleState {}

class AdminOracleLoaded extends AdminOracleState {
  final List<OraclePriceEntry> prices;
  const AdminOracleLoaded(this.prices);
  @override
  List<Object?> get props => [prices];
}

class AdminOracleError extends AdminOracleState {
  final String message;
  const AdminOracleError(this.message);
  @override
  List<Object?> get props => [message];
}

// ─── BLoC ───────────────────────────────────────────────────────────────────

class AdminOracleBloc extends Bloc<AdminOracleEvent, AdminOracleState> {
  final AdminApi _api;

  AdminOracleBloc({AdminApi? api})
      : _api = api ?? AdminApi(),
        super(AdminOracleInitial()) {
    on<LoadOraclePrices>(_onLoad);
  }

  Future<void> _onLoad(LoadOraclePrices event, Emitter<AdminOracleState> emit) async {
    // PLAT-UX FIX: Prevent UI Wipeout on RefreshIndicator trigger
    if (state is! AdminOracleLoaded) {
      emit(AdminOracleLoading());
    }
    try {
      final prices = await _api.getOraclePrices();
      emit(AdminOracleLoaded(prices));
    } catch (e) {
      emit(AdminOracleError(e.toString()));
    }
  }
}
