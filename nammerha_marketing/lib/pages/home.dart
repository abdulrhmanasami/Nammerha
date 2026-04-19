import 'package:jaspr/dom.dart';
import 'package:jaspr/jaspr.dart';
import '../constants/theme.dart';

class Home extends StatelessComponent {
  const Home({super.key});

  @override
  Component build(BuildContext context) {
    return section(
      classes: 'home-container',
      [
        // Kinetic Hero Section
        section(classes: 'hero', [
          h1(classes: 'kinetic-title', [
            span([.text('The Platinum Standard in')]),
            br(),
            span(classes: 'highlight', [.text('Sovereign Construction.')]),
          ]),
          p(classes: 'hero-subtitle', [
            .text('Zero-error GPS proofs. Unified BQ analysis. '),
            br(),
            .text('Pioneering the reconstruction of Syria.'),
          ]),
        ]),

        // Desktop Bento Grid
        div(classes: 'bento-grid', [
          // 1. Spatial Proofs Card
          div(classes: 'bento-card bento-large', [
            div(classes: 'card-content', [
              h2([.text('Quantum Spatial Verification')]),
              p([.text('Hardware-backed SHA-256 GPS telemetry matching.')]),
            ]),
            // Zero-CLS Shimmer Box for 3D Render
            div(classes: 'placeholder-3d shimmer', []),
          ]),
          
          // 2. Fatora Escrow
          div(classes: 'bento-card', [
             div(classes: 'card-content', [
              h2([.text('Immutable Escrow')]),
              p([.text('Guaranteed payments locked via BQ stages.')]),
            ]),
            div(classes: 'placeholder-3d shimmer sm', []),
          ]),

          // 3. Absolute Zero Tech
          div(classes: 'bento-card', [
            div(classes: 'card-content', [
              h2([.text('Sovereign Engine')]),
              p([.text('Offline-first GraphQL caching via Hive.')]),
            ]),
            div(classes: 'placeholder-3d shimmer sm', []),
          ]),
        ]),
      ],
    );
  }
}
