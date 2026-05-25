import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/network/api_client.dart';
import '../../../core/i18n/error_keys.dart';
import '../data/checkout_graphql_repository.dart';
import '../data/checkout_repository.dart';
import 'checkout_event.dart';
import 'checkout_state.dart';

/// Checkout BLoC — GraphQL-First with REST Fallback
///
/// Architecture:
///   PRIMARY:  GraphQL `createEscrowCheckout` → returns `PaymentIntentResult`
///             with `checkoutUrl` for Fatora redirect.
///   FALLBACK: REST `POST /payments` → fires only on infrastructure errors
///             (502/503/504) when the GraphQL endpoint is unreachable.
///
/// Financial Safety:
///   - Idempotency-Key generated per attempt (prevents double-spending)
///   - Integer-only money arithmetic (cents) — no floating-point currency
///   - Cents conversion matches web parity: `Math.round(unitPrice * qty * 100)`
class CheckoutBloc extends Bloc<CheckoutEvent, CheckoutState> {
  final CheckoutGraphQLRepository _graphqlRepository;
  final CheckoutRepository _restRepository;

  CheckoutBloc({
    CheckoutGraphQLRepository? graphqlRepository,
    CheckoutRepository? restRepository,
  })  : _graphqlRepository = graphqlRepository ?? CheckoutGraphQLRepository(),
        _restRepository = restRepository ?? CheckoutRepository(),
        super(CheckoutInitial()) {
    on<InitiateCheckoutEvent>(_onInitiateCheckout);
  }

  Future<void> _onInitiateCheckout(
    InitiateCheckoutEvent event,
    Emitter<CheckoutState> emit,
  ) async {
    emit(CheckoutLoading());

    try {
      // ──────────────────────────────────────────────────────────────────
      // 1. Build typed checkout items from raw basket maps.
      //    Web parity: Math.round(unitPrice * qty * 100)
      //    unitPrice is in standard currency (not cents), so we convert.
      // ──────────────────────────────────────────────────────────────────
      final checkoutItems = <CheckoutItem>[];

      for (final item in event.basketItems) {
        final unitPrice = (item['unit_price'] as num?)?.toDouble() ?? 0.0;
        final quantity = (item['quantity'] as num?)?.toInt() ?? 1;
        final itemId = item['item_id'] as String? ?? '';
        final projectId = item['project_id'] as String? ?? '';

        checkoutItems.add(CheckoutItem(
          itemId: itemId,
          projectId: projectId,
          amount: (unitPrice * quantity * 100).round(), // → cents
        ));
      }

      // ──────────────────────────────────────────────────────────────────
      // 2. Platform tip (web parity: item_id = 'platform-tip')
      // ──────────────────────────────────────────────────────────────────
      if (event.tipAmount > 0) {
        checkoutItems.add(CheckoutItem(
          itemId: 'platform-tip',
          projectId: 'platform',
          amount: (event.tipAmount * 100).round(), // → cents
        ));
      }

      // ──────────────────────────────────────────────────────────────────
      // 3. PRIMARY: GraphQL escrow checkout mutation
      //    Returns PaymentIntentResult with checkoutUrl for Fatora redirect
      // ──────────────────────────────────────────────────────────────────
      final result = await _graphqlRepository.createEscrowCheckout(
        items: checkoutItems,
        paymentMethod: event.paymentGateway,
        returnUrl: 'nammerha://payment-callback', // Deep link
      );

      emit(CheckoutSuccess(
        checkoutUrl: result.checkoutUrl,
        intentId: result.intentId,
        amount: result.amount,
        currency: result.currency,
      ));
    } on GraphQLException catch (e) {
      // GraphQL validation or auth error — user-actionable
      emit(CheckoutError(e.allMessages.isNotEmpty ? e.allMessages : e.message));
    } on ApiException catch (e) {
      // Infrastructure error — try REST fallback for 502/503/504
      if (e.statusCode == 502 || e.statusCode == 503 || e.statusCode == 504) {
        await _fallbackToRest(event, emit);
      } else {
        emit(CheckoutError(e.message));
      }
    } catch (e) {
      emit(CheckoutError(ErrorKeys.checkoutGeneric));
    }
  }

  /// REST fallback — fires only when GraphQL endpoint is unreachable.
  /// Returns limited data (no checkoutUrl), but preserves escrow creation.
  Future<void> _fallbackToRest(
    InitiateCheckoutEvent event,
    Emitter<CheckoutState> emit,
  ) async {
    try {
      final escrowItems = event.basketItems.map((item) {
        final unitPrice = (item['unit_price'] as num?)?.toDouble() ?? 0.0;
        final quantity = (item['quantity'] as num?)?.toInt() ?? 1;
        return {
          'item_id': item['item_id'],
          'amount': (unitPrice * quantity * 100).round(),
        };
      }).toList();

      if (event.tipAmount > 0) {
        escrowItems.add({
          'item_id': 'platform-tip',
          'amount': (event.tipAmount * 100).round(),
        });
      }

      final response = await _restRepository.submitEscrowCheckout(
        items: escrowItems,
        paymentMethod: event.paymentGateway,
      );

      emit(CheckoutSuccess(
        checkoutUrl: response['checkout_url'] as String?,
      ));
    } on ApiException catch (e) {
      emit(CheckoutError(e.message));
    } catch (e) {
      emit(CheckoutError(ErrorKeys.checkoutNetwork));
    }
  }
}
