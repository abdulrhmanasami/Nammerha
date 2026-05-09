import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/features/donor_proof/bloc/donor_proof_bloc.dart';
import 'package:nammerha_mobile/core/services/api_services.dart';
import 'package:nammerha_mobile/features/donor/models/donor_models.dart';

class MockDonorApi extends Mock implements DonorApi {}

void main() {
  late MockDonorApi mockApi;

  setUp(() {
    mockApi = MockDonorApi();
  });

  DonorProofBloc buildBloc() => DonorProofBloc(donorApi: mockApi);

  group('DonorProofBloc', () {
    test('initial state is correct', () {
      final bloc = buildBloc();
      expect(bloc.state.isLoading, isFalse);
      expect(bloc.state.error, isNull);
      expect(bloc.state.proofs, isEmpty);
      bloc.close();
    });

    blocTest<DonorProofBloc, DonorProofState>(
      'emits [isLoading=true, proofs] when LoadDonorProofs is successful',
      build: () {
        when(() => mockApi.getProofs())
            .thenAnswer((_) async => [const DonorProofModel(proofId: 'proof_1', projectTitle: 'Test Project')]);
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadDonorProofs()),
      expect: () => [
        isA<DonorProofState>().having((s) => s.isLoading, 'isLoading', true),
        isA<DonorProofState>()
            .having((s) => s.isLoading, 'isLoading', false)
            .having((s) => s.proofs.length, 'proofs', 1),
      ],
    );

    blocTest<DonorProofBloc, DonorProofState>(
      'emits [isDownloadingReceipt=true, receiptUrl] when DownloadReceipt is successful',
      build: () {
        when(() => mockApi.getReceiptUrl(any()))
            .thenAnswer((_) async => 'https://example.com/receipt.pdf');
        return buildBloc();
      },
      act: (bloc) => bloc.add(DownloadReceipt('escrow_123')),
      expect: () => [
        isA<DonorProofState>().having((s) => s.isDownloadingReceipt, 'isDownloadingReceipt', true),
        isA<DonorProofState>()
            .having((s) => s.isDownloadingReceipt, 'isDownloadingReceipt', false)
            .having((s) => s.receiptUrl, 'receiptUrl', 'https://example.com/receipt.pdf'),
      ],
    );
  });
}
