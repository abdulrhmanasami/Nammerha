import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/network/api_client.dart';
import 'profile_event.dart';
import 'profile_state.dart';

class ProfileBloc extends Bloc<ProfileEvent, ProfileState> {
  final NammerhaApiClient _api;

  ProfileBloc({NammerhaApiClient? api})
      : _api = api ?? NammerhaApiClient.instance,
        super(ProfileInitial()) {
    on<LoadProfileRequested>(_onLoadProfile);
    on<SaveProfileRequested>(_onSaveProfile);
    on<LogoutRequested>(_onLogout);
  }

  Future<void> _onLoadProfile(LoadProfileRequested event, Emitter<ProfileState> emit) async {
    final currentUser = state is ProfileLoaded ? (state as ProfileLoaded).user : null;
    final currentRoles = state is ProfileLoaded ? (state as ProfileLoaded).roles : null;
    
    emit(ProfileLoading(user: currentUser, roles: currentRoles));
    
    try {
      final results = await Future.wait([
        _api.request<Map<String, dynamic>>(
          '/auth/me',
          fromData: (d) => d as Map<String, dynamic>,
        ),
        _api.request<Map<String, dynamic>>(
          '/roles/my-roles',
          fromData: (d) => d as Map<String, dynamic>,
        ),
      ]);
      
      final meData = results[0].data;
      final rolesData = results[1].data;
      
      Map<String, dynamic> user = {};
      List<Map<String, dynamic>> roles = [];
      
      if (meData != null && meData['user'] != null) {
        user = Map<String, dynamic>.from(meData['user'] as Map);
      }
      if (rolesData != null && rolesData['roles'] is List) {
        roles = (rolesData['roles'] as List).cast<Map<String, dynamic>>();
      }
      
      emit(ProfileLoaded(user: user, roles: roles));
    } catch (e) {
      emit(const ProfileError('Failed to load profile data'));
    }
  }

  Future<void> _onSaveProfile(SaveProfileRequested event, Emitter<ProfileState> emit) async {
    if (state is ProfileLoaded) {
      final currentState = state as ProfileLoaded;
      
      try {
        // Mocking API save request here (assuming there is no actual endpoint for saving yet)
        // await _api.request('/auth/update-profile', method: 'PUT', data: { 'full_name': event.fullName, 'email': event.email });
        final updatedUser = Map<String, dynamic>.from(currentState.user);
        updatedUser['full_name'] = event.fullName;
        updatedUser['email'] = event.email;
        
        emit(currentState.copyWith(user: updatedUser));
      } catch (e) {
        // Ignore error
      }
    }
  }

  Future<void> _onLogout(LogoutRequested event, Emitter<ProfileState> emit) async {
    try {
      await _api.request('/auth/logout', method: 'POST');
    } catch (_) {}
    emit(ProfileLoggedOut());
  }
}
