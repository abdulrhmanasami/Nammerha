import '../../../core/network/api_client.dart';
import '../../../core/graphql/mutations/escrow_mutations.dart';

/// Checkout Repository — GraphQL Financial Mutation (Escrow Checkout)
///
/// Uses the GraphQL `createEscrowCheckout` mutation constant for the checkout flow.
/// This provides:
///   1. **Typed input validation** — GraphQL schema enforces required fields
///   2. **checkoutUrl** in response — Fatora redirect URL for payment
///   3. **Idempotency** — via Idempotency-Key header
///
/// Architecture Decision:
///   The REST `POST /payments` endpoint returns `{ escrow_entries, total_locked }`
///   but NOT the `checkoutUrl`. The GraphQL mutation returns `PaymentIntent` which
///   DOES include `checkoutUrl`. This is why checkout MUST use GraphQL.
///
/// Error Handling:
///   - [GraphQLException] with `BAD_USER_INPUT` → validation error (show to user)
///   - [GraphQLException] with `UNAUTHENTICATED` → session expired → re-login
///   - [ApiException] with 502/503 → infrastructure error → retry with REST fallback
class CheckoutGraphQLRepository {
  final NammerhaApiClient _apiClient;

  CheckoutGraphQLRepository({NammerhaApiClient? apiClient})
      : _apiClient = apiClient ?? NammerhaApiClient.instance;

  /// Execute the checkout flow via GraphQL escrow mutation.
  ///
  /// Returns a [PaymentIntentResult] containing the checkout URL for Fatora
  /// redirect and the payment intent metadata.
  ///
  /// [items] — List of `{ itemId, projectId, amount }` cart entries
  /// [paymentMethod] — 'fatora' or 'visa' (validated by backend enum)
  /// [returnUrl] — Deep link URL for post-payment redirect back to app
  /// [giftRecipientName] — Optional gift recipient
  /// [giftMessage] — Optional gift message
  /// [checkoutIntent] — Optional intent classification
  Future<PaymentIntentResult> createEscrowCheckout({
    required List<CheckoutItem> items,
    String paymentMethod = 'fatora',
    String? returnUrl,
    String? giftRecipientName,
    String? giftMessage,
    String? checkoutIntent,
  }) async {
    // Build GraphQL input matching CreatePaymentIntentInput schema (backend contract)
    final input = <String, dynamic>{
      'items': items.map((item) => item.toJson()).toList(),
      'paymentMethod': paymentMethod.toUpperCase(), // Enum: FATORA | VISA
      if (returnUrl != null) 'returnUrl': returnUrl,
      if (giftRecipientName != null) 'giftRecipientName': giftRecipientName,
      if (giftMessage != null) 'giftMessage': giftMessage,
      if (checkoutIntent != null) 'paymentIntent': checkoutIntent, // Backend contract key
    };

    final data = await _apiClient.graphql(
      query: EscrowMutations.createEscrowCheckout,
      variables: {'input': input},
      operationName: 'CreatePaymentIntent', // Backend contract — DO NOT rename
      idempotent: true, // Generates Idempotency-Key header
    );

    // Response key 'createPaymentIntent' is a backend contract — DO NOT rename
    final paymentIntent = data['createPaymentIntent'] as Map<String, dynamic>?;
    if (paymentIntent == null) {
      throw const ApiException('err_payment_intent');
    }

    return PaymentIntentResult.fromJson(paymentIntent);
  }
}

// ─── Data Models ──────────────────────────────────────────────────────────

/// A single item in the checkout cart.
///
/// Backend `PaymentItemInput` only accepts `{ itemId, amount }` (backend contract).
/// The `projectId` is resolved server-side from the BOQ item's `project_id`
/// column. We keep `projectId` here for local cart display/navigation only.
class CheckoutItem {
  final String itemId;
  final String projectId; // Local only — NOT sent to GraphQL
  final int amount; // Amount in cents (integer-only — no floating point money)

  const CheckoutItem({
    required this.itemId,
    required this.projectId,
    required this.amount,
  });

  /// Serialize to GraphQL `PaymentItemInput` — { itemId, amount } only.
  /// The `projectId` is intentionally excluded (BAD_USER_INPUT if sent).
  Map<String, dynamic> toJson() => {
        'itemId': itemId,
        'amount': amount,
      };
}


/// Payment intent result from the escrow checkout mutation.
class PaymentIntentResult {
  final String intentId;
  final String? checkoutUrl;
  final String? clientSecret;
  final String? returnUrl;
  final int amount; // cents
  final String currency;

  const PaymentIntentResult({
    required this.intentId,
    this.checkoutUrl,
    this.clientSecret,
    this.returnUrl,
    required this.amount,
    required this.currency,
  });

  factory PaymentIntentResult.fromJson(Map<String, dynamic> json) {
    return PaymentIntentResult(
      intentId: json['intentId'] as String? ?? '',
      checkoutUrl: json['checkoutUrl'] as String?,
      clientSecret: json['clientSecret'] as String?,
      returnUrl: json['returnUrl'] as String?,
      amount: (json['amount'] as num?)?.toInt() ?? 0,
      currency: json['currency'] as String? ?? 'USD',
    );
  }

  /// True if the payment requires a redirect to an external checkout page
  bool get requiresRedirect => checkoutUrl != null && checkoutUrl!.isNotEmpty;

  @override
  String toString() =>
      'PaymentIntentResult($intentId, $amount $currency, redirect: $requiresRedirect)';
}
