import 'package:jaspr/jaspr.dart';
void main() {
  var rule = css('.shimmer').raw('animation: shimmer 2s;');
  print(rule.selector);
}
