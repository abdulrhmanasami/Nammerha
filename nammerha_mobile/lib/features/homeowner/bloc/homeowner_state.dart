import 'package:equatable/equatable.dart';
import '../models/homeowner_models.dart';

abstract class HomeownerState extends Equatable {
  final HomeownerDashboardModel data;
  const HomeownerState(this.data);

  @override
  List<Object?> get props => [data];
}

class HomeownerInitial extends HomeownerState {
  const HomeownerInitial() : super(const HomeownerDashboardModel());
}

class HomeownerLoading extends HomeownerState {
  const HomeownerLoading(super.data);
}

class HomeownerLoaded extends HomeownerState {
  const HomeownerLoaded(super.data);
}

class HomeownerError extends HomeownerState {
  final String error;
  const HomeownerError(super.data, this.error);

  @override
  List<Object?> get props => [data, error];
}

class ApprovalResponseSuccess extends HomeownerState {
  const ApprovalResponseSuccess(super.data);
}
