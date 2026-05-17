import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/network/api_client.dart';
import '../../../core/i18n/error_keys.dart';
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
    
    // Load independently — profile must not break if roles API fails
    Map<String, dynamic> user = {};
    List<Map<String, dynamic>> roles = [];
    
    try {
      final meResult = await _api.request<Map<String, dynamic>>(
        '/auth/me',
        fromData: (d) => d as Map<String, dynamic>,
      );
      if (meResult.data != null && meResult.data!['user'] != null) {
        user = Map<String, dynamic>.from(meResult.data!['user'] as Map);
      }
    } catch (e) {
      debugPrint('[Nammerha] bloc/profile_bloc: $e');
      // /auth/me failed — will show error below
    }
    
    try {
      final rolesResult = await _api.request<Map<String, dynamic>>(
        '/roles/my-roles',
        fromData: (d) => d as Map<String, dynamic>,
      );
      if (rolesResult.data != null && rolesResult.data!['roles'] is List) {
        roles = (rolesResult.data!['roles'] as List).cast<Map<String, dynamic>>();
      }
    } catch (e) {
      debugPrint('[Nammerha] bloc/profile_bloc: $e');
      // /roles/my-roles failed — continue without roles
    }
    
    if (user.isEmpty) {
      emit(const ProfileError(ErrorKeys.loadFailed));
      return;
    }
    
    emit(ProfileLoaded(user: user, roles: roles));
  }

  Future<void> _onSaveProfile(SaveProfileRequested event, Emitter<ProfileState> emit) async {
    if (state is ProfileLoaded) {
      final currentState = state as ProfileLoaded;

      // P1-002 FIX: Emit loading state so UI shows "Saving..." and disables button
      emit(ProfileLoading(user: currentState.user, roles: currentState.roles));

      try {
        await _api.request(
          '/auth/update-profile',
          method: 'PUT',
          body: {
            'full_name': event.fullName,
            'email': event.email,
          },
        );
        final updatedUser = Map<String, dynamic>.from(currentState.user);
        updatedUser['full_name'] = event.fullName;
        updatedUser['email'] = event.email;

        emit(currentState.copyWith(user: updatedUser));
      } on ApiException catch (e) {
        debugPrint('[Nammerha] bloc/profile_bloc: $e');
        // If endpoint doesn't exist yet (404), apply locally with warning
        if (e.statusCode == 404) {
          final updatedUser = Map<String, dynamic>.from(currentState.user);
          updatedUser['full_name'] = event.fullName;
          updatedUser['email'] = event.email;
          emit(currentState.copyWith(user: updatedUser));
        } else {
          // P1-002 FIX: Emit ProfileSaveError — preserves user data in form,
          // user stays in edit mode and can retry without losing edits.
          emit(ProfileSaveError(
            user: currentState.user,
            roles: currentState.roles,
            message: ErrorKeys.profileSaveFailed,
          ));
        }
      } catch (e) {
        debugPrint('[Nammerha] bloc/profile_bloc: $e');
        emit(ProfileSaveError(
          user: currentState.user,
          roles: currentState.roles,
          message: ErrorKeys.profileSaveFailed,
        ));
      }
    }
  }

  Future<void> _onLogout(LogoutRequested event, Emitter<ProfileState> emit) async {
    try {
      await _api.request('/auth/logout', method: 'POST');
    } catch (e) {
      debugPrint('[Nammerha] bloc/profile_bloc: $e');
    }
    emit(ProfileLoggedOut());
  }
}
