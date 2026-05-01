import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:nammerha_mobile/features/supplier/bloc/supplier_bloc.dart';
import 'package:nammerha_mobile/features/supplier/bloc/supplier_event.dart';
import 'package:nammerha_mobile/features/supplier/bloc/supplier_state.dart';
import 'package:nammerha_mobile/features/supplier/data/supplier_repository.dart';
import 'package:nammerha_mobile/features/supplier/models/supplier_models.dart';

// ═══════════════════════════════════════════════════════════════════════════
// Supplier BLoC Tests — P1 Platinum Certification
// Covers: dashboard loading, order status update, catalog item addition,
//         error handling, action success states
// ═══════════════════════════════════════════════════════════════════════════

class MockSupplierRepository extends Mock implements SupplierRepository {}

void main() {
  late MockSupplierRepository mockRepo;

  setUp(() {
    mockRepo = MockSupplierRepository();
  });

  SupplierBloc buildBloc() => SupplierBloc(repository: mockRepo);

  final sampleDashboard = SupplierDashboardModel(
    pendingOrders: 5,
    wonContracts: 2,
    inTransit: 3,
    totalRevenue: 150000,
    orders: [],
    catalog: [],
  );

  group('SupplierBloc — Dashboard', () {
    test('initial state is SupplierInitial', () {
      final bloc = buildBloc();
      expect(bloc.state, isA<SupplierInitial>());
      bloc.close();
    });

    blocTest<SupplierBloc, SupplierState>(
      'emits [Loading, Loaded] when dashboard loads successfully',
      build: () {
        when(() => mockRepo.loadFullDashboard())
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadDashboardEvent()),
      expect: () => [
        isA<SupplierLoading>(),
        isA<SupplierLoaded>(),
      ],
      verify: (_) {
        verify(() => mockRepo.loadFullDashboard()).called(1);
      },
    );

    blocTest<SupplierBloc, SupplierState>(
      'emits [Loading, Error] when dashboard loading fails',
      build: () {
        when(() => mockRepo.loadFullDashboard())
            .thenThrow(Exception('Connection refused'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(LoadDashboardEvent()),
      expect: () => [
        isA<SupplierLoading>(),
        isA<SupplierError>(),
      ],
    );
  });

  group('SupplierBloc — Order Management', () {
    blocTest<SupplierBloc, SupplierState>(
      'emits [ActionSuccess] then reloads on order status update',
      build: () {
        when(() => mockRepo.updateOrderStatus(any(), any()))
            .thenAnswer((_) async {});
        when(() => mockRepo.loadFullDashboard())
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const UpdateOrderStatusEvent(
        poId: 'po-001',
        newStatus: 'shipped',
      )),
      expect: () => [
        isA<SupplierActionSuccess>(),
        isA<SupplierLoading>(),
        isA<SupplierLoaded>(),
      ],
    );

    blocTest<SupplierBloc, SupplierState>(
      'emits [Error] when order update fails',
      build: () {
        when(() => mockRepo.updateOrderStatus(any(), any()))
            .thenThrow(Exception('PO not found'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const UpdateOrderStatusEvent(
        poId: 'po-invalid',
        newStatus: 'shipped',
      )),
      expect: () => [
        isA<SupplierError>(),
      ],
    );
  });

  group('SupplierBloc — Catalog', () {
    blocTest<SupplierBloc, SupplierState>(
      'emits [ActionSuccess] then reloads on catalog item add',
      build: () {
        when(() => mockRepo.addCatalogItem(
              name: any(named: 'name'),
              category: any(named: 'category'),
              unit: any(named: 'unit'),
              price: any(named: 'price'),
              minOrder: any(named: 'minOrder'),
              leadTime: any(named: 'leadTime'),
            )).thenAnswer((_) async {});
        when(() => mockRepo.loadFullDashboard())
            .thenAnswer((_) async => sampleDashboard);
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AddCatalogItemEvent(
        name: 'حديد تسليح',
        category: 'structural',
        unit: 'طن',
        price: 95000,
        minOrder: 1,
        leadTime: 7,
      )),
      expect: () => [
        isA<SupplierActionSuccess>(),
        isA<SupplierLoading>(),
        isA<SupplierLoaded>(),
      ],
    );

    blocTest<SupplierBloc, SupplierState>(
      'emits [Error] when catalog add fails',
      build: () {
        when(() => mockRepo.addCatalogItem(
              name: any(named: 'name'),
              category: any(named: 'category'),
              unit: any(named: 'unit'),
              price: any(named: 'price'),
              minOrder: any(named: 'minOrder'),
              leadTime: any(named: 'leadTime'),
            )).thenThrow(Exception('Duplicate item'));
        return buildBloc();
      },
      act: (bloc) => bloc.add(const AddCatalogItemEvent(
        name: 'حديد تسليح',
        category: 'structural',
        unit: 'طن',
        price: 95000,
        minOrder: 1,
        leadTime: 7,
      )),
      expect: () => [
        isA<SupplierError>(),
      ],
    );
  });
}
