import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/privacy_repository.dart';

// --- Events ---
abstract class PrivacyEvent {}

class FetchAuditLogs extends PrivacyEvent {}

class RequestDataExport extends PrivacyEvent {}

class WithdrawConsent extends PrivacyEvent {}

class DeleteAccount extends PrivacyEvent {}

// --- States ---
abstract class PrivacyState {}

class PrivacyInitial extends PrivacyState {}

class PrivacyLoading extends PrivacyState {}

class PrivacyAuditLogsLoaded extends PrivacyState {
  final List<Map<String, dynamic>> logs;
  PrivacyAuditLogsLoaded(this.logs);
}

class PrivacySuccess extends PrivacyState {
  final String message;
  PrivacySuccess(this.message);
}

class PrivacyError extends PrivacyState {
  final String message;
  PrivacyError(this.message);
}

// --- BLoC ---
class PrivacyBloc extends Bloc<PrivacyEvent, PrivacyState> {
  final PrivacyRepository repository;

  PrivacyBloc({required this.repository}) : super(PrivacyInitial()) {
    on<FetchAuditLogs>(_onFetchAuditLogs);
    on<RequestDataExport>(_onRequestDataExport);
    on<WithdrawConsent>(_onWithdrawConsent);
    on<DeleteAccount>(_onDeleteAccount);
  }

  Future<void> _onFetchAuditLogs(FetchAuditLogs event, Emitter<PrivacyState> emit) async {
    emit(PrivacyLoading());
    try {
      final logs = await repository.getConsentAuditLogs();
      emit(PrivacyAuditLogsLoaded(logs));
    } catch (e) {
      emit(PrivacyError(e.toString()));
    }
  }

  Future<void> _onRequestDataExport(RequestDataExport event, Emitter<PrivacyState> emit) async {
    emit(PrivacyLoading());
    try {
      await repository.requestDataExport();
      emit(PrivacySuccess('تم إرسال طلب تصدير بياناتك بنجاح. ستتلقى بريداً إلكترونياً قريباً.'));
    } catch (e) {
      emit(PrivacyError(e.toString()));
    }
  }

  Future<void> _onWithdrawConsent(WithdrawConsent event, Emitter<PrivacyState> emit) async {
    emit(PrivacyLoading());
    try {
      await repository.withdrawConsent();
      emit(PrivacySuccess('تم سحب الموافقة على معالجة البيانات.'));
    } catch (e) {
      emit(PrivacyError(e.toString()));
    }
  }

  Future<void> _onDeleteAccount(DeleteAccount event, Emitter<PrivacyState> emit) async {
    emit(PrivacyLoading());
    try {
      await repository.deleteAccount();
      emit(PrivacySuccess('تم تقديم طلب حذف الحساب نهائياً.'));
    } catch (e) {
      emit(PrivacyError(e.toString()));
    }
  }
}
