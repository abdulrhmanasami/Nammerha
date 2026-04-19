import 'package:jaspr/dom.dart';
import 'package:jaspr/jaspr.dart';
import '../constants/theme.dart';

@client
class About extends StatelessComponent {
  const About({super.key});

  @override
  Component build(BuildContext context) {
    return section(
      classes: 'vision-container',
      [
        div(classes: 'vision-glass-card', [
          h1([.text('Architectural Sovereignty')]),
          p([.text(
              'Nammerha is the world\'s first sovereign construction hub powered by cryptographic spatial proofs. '
              'By intersecting hardware GPS telemetry with an immutable ledger, we eradicate fraud and enforce '
              'strict BQ compliance throughout the rebuilding of Syria. '
          )]),
        ]),
      ]
    );
  }
}
