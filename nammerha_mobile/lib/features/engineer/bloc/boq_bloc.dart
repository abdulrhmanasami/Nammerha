import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/boq_repository.dart';
import '../../../core/i18n/error_keys.dart';
import '../models/boq_models.dart';
import 'boq_event.dart';
import 'boq_state.dart';

class BoqBloc extends Bloc<BoqEvent, BoqState> {
  final BoqRepository repository;

  BoqBloc({required this.repository}) : super(const BoqInitial()) {
    on<LoadExistingBoqEvent>(_onLoadExisting);
    on<AddBoqItemEvent>(_onAddItem);
    on<RemoveBoqItemEvent>(_onRemoveItem);
    on<UpdateBoqQuantityEvent>(_onUpdateQuantity);
    on<PublishBoqEvent>(_onPublish);
  }

  Future<void> _onLoadExisting(LoadExistingBoqEvent event, Emitter<BoqState> emit) async {
    emit(BoqLoading(state.items));
    try {
      final items = await repository.loadExistingBOQ(event.projectId);
      if (isClosed) return;
      emit(BoqLoaded(items));
    } catch (e) {
      // H1 FIX: Surface error instead of silent fallback — user sees SnackBar
      if (isClosed) return;
      emit(BoqError(const [], ErrorKeys.boqLoadFailed));
      emit(const BoqLoaded([]));
    }
  }

  void _onAddItem(AddBoqItemEvent event, Emitter<BoqState> emit) {
    final newItems = List<BoqItemModel>.from(state.items)..add(event.item);
    emit(BoqLoaded(newItems));
  }

  void _onRemoveItem(RemoveBoqItemEvent event, Emitter<BoqState> emit) {
    final newItems = List<BoqItemModel>.from(state.items)..removeAt(event.index);
    emit(BoqLoaded(newItems));
  }

  void _onUpdateQuantity(UpdateBoqQuantityEvent event, Emitter<BoqState> emit) {
    final newItems = List<BoqItemModel>.from(state.items);
    if (event.newQuantity > 0) {
      final oldItem = newItems[event.index];
      newItems[event.index] = oldItem.copyWith(quantity: event.newQuantity);
    } else {
      newItems.removeAt(event.index); // remove if quantity drops to 0
    }
    emit(BoqLoaded(newItems));
  }

  Future<void> _onPublish(PublishBoqEvent event, Emitter<BoqState> emit) async {
    if (state.items.isEmpty) return;

    emit(BoqPublishLoading(state.items));
    try {
      await repository.publishBOQ(event.projectId, state.items);
      if (isClosed) return;
      emit(BoqPublishSuccess(state.items));
    } catch (e) {
      // H1 FIX: English generic error message
      if (isClosed) return;
      emit(BoqError(state.items, ErrorKeys.boqPublishFailed));
      emit(BoqLoaded(state.items)); // Revert to loaded so they can retry
    }
  }
}
