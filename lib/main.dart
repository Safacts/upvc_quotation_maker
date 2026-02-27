import 'package:flutter/material.dart';
import 'quotation_screen.dart';

void main() {
  runApp(MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'UPVC Quotation Maker',
    theme: ThemeData(primarySwatch: Colors.blue),
    home: QuotationScreen(),
  ));
}
