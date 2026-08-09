import 'package:flutter/material.dart';

/// Intent to close the drawer
class CloseDrawerIntent extends Intent {
  const CloseDrawerIntent();
}

/// Intent to create a new quotation
class NewQuotationIntent extends Intent {
  const NewQuotationIntent();
}

/// Intent to focus the search field
class FocusSearchIntent extends Intent {
  const FocusSearchIntent();
}

/// Intent to refresh the quotation list
class RefreshIntent extends Intent {
  const RefreshIntent();
}

/// Intent to send email
class SendEmailIntent extends Intent {
  const SendEmailIntent();
}