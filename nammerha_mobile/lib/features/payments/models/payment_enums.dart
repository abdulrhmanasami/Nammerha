/// Payment Method enum — mirrors backend contract_payments.payment_method
enum PaymentMethod {
  fatora,
  cash,
  bankTransfer;

  String get apiValue {
    switch (this) {
      case PaymentMethod.fatora:
        return 'fatora';
      case PaymentMethod.cash:
        return 'cash';
      case PaymentMethod.bankTransfer:
        return 'bank_transfer';
    }
  }

  static PaymentMethod fromApi(String value) {
    switch (value) {
      case 'fatora':
        return PaymentMethod.fatora;
      case 'cash':
        return PaymentMethod.cash;
      case 'bank_transfer':
        return PaymentMethod.bankTransfer;
      default:
        return PaymentMethod.cash;
    }
  }

  /// i18n key for display
  String get i18nKey {
    switch (this) {
      case PaymentMethod.fatora:
        return 'pay_method_fatora';
      case PaymentMethod.cash:
        return 'pay_method_cash';
      case PaymentMethod.bankTransfer:
        return 'pay_method_transfer';
    }
  }

  /// i18n key for description
  String get descriptionKey {
    switch (this) {
      case PaymentMethod.fatora:
        return 'pay_method_fatora_desc';
      case PaymentMethod.cash:
        return 'pay_method_cash_desc';
      case PaymentMethod.bankTransfer:
        return 'pay_method_transfer_desc';
    }
  }
}

/// Payment Status — mirrors backend contract_payments.status
enum PaymentStatus {
  pending,
  payerConfirmed,
  payeeConfirmed,
  completed,
  disputed,
  cancelled;

  static PaymentStatus fromApi(String value) {
    switch (value) {
      case 'pending':
        return PaymentStatus.pending;
      case 'payer_confirmed':
        return PaymentStatus.payerConfirmed;
      case 'payee_confirmed':
        return PaymentStatus.payeeConfirmed;
      case 'completed':
        return PaymentStatus.completed;
      case 'disputed':
        return PaymentStatus.disputed;
      case 'cancelled':
        return PaymentStatus.cancelled;
      default:
        return PaymentStatus.pending;
    }
  }

  String get apiValue {
    switch (this) {
      case PaymentStatus.pending:
        return 'pending';
      case PaymentStatus.payerConfirmed:
        return 'payer_confirmed';
      case PaymentStatus.payeeConfirmed:
        return 'payee_confirmed';
      case PaymentStatus.completed:
        return 'completed';
      case PaymentStatus.disputed:
        return 'disputed';
      case PaymentStatus.cancelled:
        return 'cancelled';
    }
  }

  String get i18nKey {
    switch (this) {
      case PaymentStatus.pending:
        return 'pay_status_pending';
      case PaymentStatus.payerConfirmed:
        return 'pay_status_payer_confirmed';
      case PaymentStatus.payeeConfirmed:
        return 'pay_status_payee_confirmed';
      case PaymentStatus.completed:
        return 'pay_status_completed';
      case PaymentStatus.disputed:
        return 'pay_status_disputed';
      case PaymentStatus.cancelled:
        return 'pay_status_cancelled';
    }
  }
}

/// Provider Type — type of service provider in a contract
enum ProviderType {
  contractor,
  engineer,
  tradesperson,
  supplier;

  static ProviderType fromApi(String value) {
    switch (value) {
      case 'contractor':
        return ProviderType.contractor;
      case 'engineer':
        return ProviderType.engineer;
      case 'tradesperson':
        return ProviderType.tradesperson;
      case 'supplier':
        return ProviderType.supplier;
      default:
        return ProviderType.contractor;
    }
  }

  String get apiValue {
    switch (this) {
      case ProviderType.contractor:
        return 'contractor';
      case ProviderType.engineer:
        return 'engineer';
      case ProviderType.tradesperson:
        return 'tradesperson';
      case ProviderType.supplier:
        return 'supplier';
    }
  }

  String get i18nKey {
    switch (this) {
      case ProviderType.contractor:
        return 'provider_contractor';
      case ProviderType.engineer:
        return 'provider_engineer';
      case ProviderType.tradesperson:
        return 'provider_tradesperson';
      case ProviderType.supplier:
        return 'provider_supplier';
    }
  }
}
