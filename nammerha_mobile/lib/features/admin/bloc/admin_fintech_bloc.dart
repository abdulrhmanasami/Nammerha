import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../api/admin_api.dart';
import '../models/admin_models.dart';

// ─── Events ─────────────────────────────────────────────────────────────────

abstract class AdminFintechEvent extends Equatable {
  const AdminFintechEvent();
  @override
  List<Object?> get props => [];
}

class LoadFintechData extends AdminFintechEvent {}

// ─── States ─────────────────────────────────────────────────────────────────

abstract class AdminFintechState extends Equatable {
  const AdminFintechState();
  @override
  List<Object?> get props => [];
}

class AdminFintechInitial extends AdminFintechState {}
class AdminFintechLoading extends AdminFintechState {}

class AdminFintechLoaded extends AdminFintechState {
  final EscrowFeeSummary feeSummary;
  final List<FeeConfig> feeConfigs;
  final List<EnterpriseOrg> organizations;

  const AdminFintechLoaded({
    required this.feeSummary,
    required this.feeConfigs,
    required this.organizations,
  });

  @override
  List<Object?> get props => [feeSummary, feeConfigs, organizations];
}

class AdminFintechError extends AdminFintechState {
  final String message;
  const AdminFintechError(this.message);
  @override
  List<Object?> get props => [message];
}

// ─── BLoC ───────────────────────────────────────────────────────────────────

class AdminFintechBloc extends Bloc<AdminFintechEvent, AdminFintechState> {
  final AdminApi _api;

  AdminFintechBloc({AdminApi? api})
      : _api = api ?? AdminApi(),
        super(AdminFintechInitial()) {
    on<LoadFintechData>(_onLoad);
  }

  Future<void> _onLoad(LoadFintechData event, Emitter<AdminFintechState> emit) async {
    emit(AdminFintechLoading());
    try {
      final results = await Future.wait([
        _api.getFeeSummary(),
        _api.getFeeConfigs(),
        _api.getOrganizations(),
      ]);
      emit(AdminFintechLoaded(
        feeSummary: results[0] as EscrowFeeSummary,
        feeConfigs: results[1] as List<FeeConfig>,
        organizations: results[2] as List<EnterpriseOrg>,
      ));
    } catch (e) {
      emit(AdminFintechError(e.toString()));
    }
  }
}
