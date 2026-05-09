import 'package:jaspr/dom.dart';
import 'package:jaspr/jaspr.dart';
import 'package:jaspr_router/jaspr_router.dart';



class Header extends StatelessComponent {
  const Header({super.key});

  @override
  Component build(BuildContext context) {
    var activePath = context.url;

    return header([
      nav([
        div(classes: 'brand-container', [
          span(classes: 'brand-logo', [
            // Symbolic Metaphorism: House-Chimney
            span(classes: 'logo-chimney', []),
          ]),
          b([.text('Nammerha')]),
        ]),
        div(classes: 'nav-links', [
          for (var route in [
            (label: 'Home', path: '/'),
            (label: 'Vision', path: '/about'),
          ])
            div(classes: activePath == route.path ? 'active' : null, [
              Link(to: route.path, child: .text(route.label)),
            ]),
        ]),
        div(classes: 'cta-container', [
          button(classes: 'cta-button', [.text('Engineer Portal')]),
        ]),
      ]),
    ]);
  }
}
