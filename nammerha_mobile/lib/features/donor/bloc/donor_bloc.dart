import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/donor_repository.dart';
import '../models/donor_models.dart';
import 'donor_event.dart';
import 'donor_state.dart';

class DonorBloc extends Bloc<DonorEvent, DonorState> {
  final DonorRepository _repository;

  DonorBloc({DonorRepository? repository})
      : _repository = repository ?? DonorRepository(),
        super(DonorInitial()) {
    on<DonorLoadTabRequested>(_onLoadTabRequested);
    on<DonorLoadStandaloneProofsRequested>(_onLoadStandaloneProofsRequested);
  }

  Future<void> _onLoadTabRequested(
      DonorLoadTabRequested event, Emitter<DonorState> emit) async {
    DonorDashboardModel currentData = const DonorDashboardModel();
    if (state is DonorLoaded) {
      currentData = (state as DonorLoaded).data;
    } else if (state is DonorLoading && (state as DonorLoading).currentData != null) {
      currentData = (state as DonorLoading).currentData!;
    }

    emit(DonorLoading(currentData: currentData));

    try {
      DonorDashboardModel newData = currentData;
      switch (event.tabIndex) {
        case 0:
          if (forceRefreshCheck(currentData.stats, event.forceRefresh)) {
             final loaded = await _repository.loadDashboard();
             newData = newData.copyWith(
               stats: loaded.stats,
               fundedProjects: loaded.fundedProjects,
             );
          }
          break;
        case 1:
          if (forceRefreshCheckList(currentData.marketplace, event.forceRefresh)) {
            newData = await _repository.loadMarketplace(newData);
          }
          break;
        case 2:
          if (forceRefreshCheckList(currentData.donations, event.forceRefresh)) {
            newData = await _repository.loadDonations(newData);
          }
          break;
        case 3:
          if (forceRefreshCheckList(currentData.impact, event.forceRefresh)) {
            newData = await _repository.loadImpact(newData);
          }
          break;
        case 4:
          if (forceRefreshCheckList(currentData.proofs, event.forceRefresh)) {
            newData = await _repository.loadProofs(newData);
          }
          break;
      }
      emit(DonorLoaded(data: newData));
    } catch (e) {
      emit(DonorError(message: 'حدث خطأ في مزامنة البيانات', currentData: currentData));
    }
  }

  Future<void> _onLoadStandaloneProofsRequested(
      DonorLoadStandaloneProofsRequested event, Emitter<DonorState> emit) async {
    emit(const DonorLoading());
    try {
      final proofs = await _repository.loadStandaloneProofs();
      emit(DonorStandaloneProofsLoaded(proofs: proofs));
    } catch (e) {
      emit(const DonorError(message: 'حدث خطأ في تحميل الإثباتات'));
    }
  }

  bool forceRefreshCheck(Map<String, dynamic> data, bool force) {
    if (force) return true;
    if (data.isEmpty) return true;
    return false;
  }

  bool forceRefreshCheckList(List<Map<String, dynamic>> data, bool force) {
    if (force) return true;
    if (data.isEmpty) return true;
    return false;
  }
}
