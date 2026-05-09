import 'package:jaspr/dom.dart';

void main() {
  var rule = css('.shimmer').styles(raw: {'animation': 'shimmer 2s'});
  print(rule.toCss());
}
