import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

import '../services/field_task_service.dart';
import 'location_consent_sheet.dart';

/// checkin_sheet.dart -- ADDITIVE ONLY.
///
/// Foreground, user-initiated check-in. Single GPS fix, never a stream.
/// Best choice per owner decision: check-in/check-out GPS only.
class CheckinSheet extends StatefulWidget {
  final String clientId;
  final String taskId;
  final String userId;

  const CheckinSheet({
    super.key,
    required this.clientId,
    required this.taskId,
    required this.userId,
  });

  @override
  State<CheckinSheet> createState() => _CheckinSheetState();
}

class _CheckinSheetState extends State<CheckinSheet> {
  bool _busy = false;
  String _status = 'Tap Check-in to save your current location with this visit.';
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _doCheckin() async {
    final consent = await LocationConsentSheet.ensure(context);
    if (!consent) return;
    setState(() {
      _busy = true;
      _status = 'Requesting location permission…';
    });

    final perm = await Permission.locationWhenInUse.request();
    if (!perm.isGranted) {
      if (mounted) {
        setState(() {
          _busy = false;
          _status = 'Location permission denied. Check-in needs it once.';
        });
      }
      return;
    }

    if (mounted) setState(() => _status = 'Getting single GPS fix…');
    Position? pos;
    try {
      final serviceOn = await Geolocator.isLocationServiceEnabled();
      if (!serviceOn) {
        if (mounted) {
          setState(() {
            _busy = false;
            _status = 'Location is OFF on this device. Enable it and retry.';
          });
        }
        return;
      }
      pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 8),
        ),
      );
    } catch (_) {
      try {
        pos = await Geolocator.getLastKnownPosition();
      } catch (_) {}
    }

    if (pos == null) {
      if (mounted) {
        setState(() {
          _busy = false;
          _status = 'Could not get GPS. Try outdoors and retry.';
        });
      }
      return;
    }

    if (mounted) setState(() => _status = 'Saving check-in…');
    final ok = await FieldTaskService.instance.checkIn(
      clientId: widget.clientId,
      taskId: widget.taskId,
      userId: widget.userId,
      lat: pos.latitude,
      lng: pos.longitude,
      accuracyM: pos.accuracy,
      note: _note.text.trim(),
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      _status = ok
          ? 'Checked in (±${pos!.accuracy.toStringAsFixed(0)} m).'
          : 'Saved on device. Will sync when online.';
    });
    if (ok) {
      await Future.delayed(const Duration(milliseconds: 600));
      if (mounted) Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
            20, 16, 20, MediaQuery.of(context).viewInsets.bottom + 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Visit check-in',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(_status),
            const SizedBox(height: 12),
            TextField(
              controller: _note,
              decoration: const InputDecoration(
                labelText: 'Note (optional)',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.note_alt_outlined),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _busy ? null : _doCheckin,
                icon: const Icon(Icons.my_location),
                label: Text(_busy ? 'Saving…' : 'Check-in now'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
