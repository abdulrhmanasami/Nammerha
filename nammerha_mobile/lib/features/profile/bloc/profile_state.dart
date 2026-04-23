import 'package:equatable/equatable.dart';

abstract class ProfileState extends Equatable {
  const ProfileState();

  @override
  List<Object?> get props => [];
}

class ProfileInitial extends ProfileState {}

class ProfileLoading extends ProfileState {
  final Map<String, dynamic>? user;
  final List<Map<String, dynamic>>? roles;
  
  const ProfileLoading({this.user, this.roles});
  
  @override
  List<Object?> get props => [user, roles];
}

class ProfileLoaded extends ProfileState {
  final Map<String, dynamic> user;
  final List<Map<String, dynamic>> roles;
  
  const ProfileLoaded({required this.user, required this.roles});

  ProfileLoaded copyWith({
    Map<String, dynamic>? user,
    List<Map<String, dynamic>>? roles,
  }) {
    return ProfileLoaded(
      user: user ?? this.user,
      roles: roles ?? this.roles,
    );
  }

  @override
  List<Object?> get props => [user, roles];
}

class ProfileError extends ProfileState {
  final String message;
  const ProfileError(this.message);

  @override
  List<Object?> get props => [message];
}

class ProfileLoggedOut extends ProfileState {}
