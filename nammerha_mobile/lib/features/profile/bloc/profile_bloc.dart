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
    } catch (_) {
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
    } catch (_) {
      // /roles/my-roles failed — continue without roles
    }
    
    if (user.isEmpty) {
      emit(const ProfileError('تعذر تحميل بيانات الملف الشخصي. حاول مرة أخرى.'));
      return;
    }
    
    emit(ProfileLoaded(user: user, roles: roles));
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
