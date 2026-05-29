/// The entrypoint for the **server** environment.
///
/// The [main] method will only be executed on the server during pre-rendering.
/// To run code on the client, check the `main.client.dart` file.
library;

import 'package:jaspr/dom.dart';
// Server-specific Jaspr import.
import 'package:jaspr/server.dart';

// Imports the [App] component.
import 'app.dart';

// This file is generated automatically by Jaspr, do not remove or edit.
import 'main.server.options.dart';

void main() {
  // Initializes the server environment with the generated default options.
  Jaspr.initializeApp(
    options: defaultServerOptions,
  );

  // Starts the app.
  //
  // [Document] renders the root document structure (<html>, <head> and <body>)
  // with the provided parameters and components.
  runApp(Document(
    lang: 'ar',
    title: 'Nammerha — Sovereign Construction Hub',
    meta: {
      'description': 'المنصة الوطنية المستقلة للتوثيق الهندسي التعريفي في سورية.',
      'keywords': 'Nammerha, Construction, Syria, Spatial Proof, Escrow',
    },
    head: [
      const Document.html(attributes: {'dir': 'rtl'}),
      link(href: 'https://nammerha.com/ar', rel: 'alternate', attributes: {'hreflang': 'ar'}),
      link(href: 'https://nammerha.com/en', rel: 'alternate', attributes: {'hreflang': 'en'}),
    ],
    styles: [
      // Modern Plus Jakarta Sans Font (Self-Hosted)
      css.import('/fonts/plus-jakarta-sans.css'),
      css.import('/styles.css'),
    ],
    body: App(),
  ));
}
