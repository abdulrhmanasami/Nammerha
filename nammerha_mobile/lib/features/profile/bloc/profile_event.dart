import 'package:equatable/equatable.dart';

abstract class ProfileEvent extends Equatable {
  const ProfileEvent();

  @override
  List<Object?> get props => [];
}

class LoadProfileRequested extends ProfileEvent {}

class SaveProfileRequested extends ProfileEvent {
  final String fullName;
  final String email;

  const SaveProfileRequested({required this.fullName, required this.email});

  @override
  List<Object?> get props => [fullName, email];
}

class LogoutRequested extends ProfileEvent {}
