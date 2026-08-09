# In-App Update Mechanism — Implementation Plan

## Overview
Dynamic content updates without rebuilding APK. The app will:
- Download new product catalogs, pricing templates from server
- Work offline-first with SQLite, sync when online
- Support feature flags per tier (Low/Base/Next/Next+/Final)
- Dynamic white-labeling (logo, colors from server config)

## Architecture

### 1. Database Layer (SQLite offline)
- `sqflite` package for local SQLite database
- Local copies of: products, quotations, customers, payments, config
- `sync_status` column for each table (synced/pending_created/pending_updated/pending_deleted)
- Conflict resolution: server-wins (offline edits warn before overwriting)

### 2. Sync Engine
- Bidirectional sync with Supabase
- `connectivity_plus` for network detection
- Automatic sync when coming online
- Manual sync trigger available
- Delta-based sync (only fetch changed data)

### 3. Feature Flags
- Per-tier feature flags stored in database
- Client-side evaluation
- Real-time updates via Supabase Realtime
- Tiers: Low/Base/Next/Next+/Final

### 4. Dynamic White-Labeling
- Logo, colors, company name from server config
- Runtime updates without APK rebuild
- Fallback to cached config when offline

### 5. Content Manifest
- Version tracking for all content types
- Delta-based updates (only download what changed)
- Content types: products, pricing_templates, terms, bank_details

## Files to Create

### Database
- `supabase/migrations/014_in_app_updates.sql`

### Backend API
- `app/api/content/manifest/route.ts`
- `app/api/content/sync/route.ts`
- `app/api/feature-flags/route.ts`
- `app/api/white-label/route.ts`

### Flutter Services
- `lib/services/offline_database.dart`
- `lib/services/sync_engine.dart`
- `lib/services/feature_flag_service.dart`
- `lib/services/content_sync_service.dart`
- `lib/services/white_label_service.dart`
- `lib/services/connectivity_service.dart`

### Flutter Models
- `lib/models_sync.dart`

### UI Components
- `lib/widgets/offline_indicator.dart`
- `lib/widgets/sync_status_widget.dart`

### Modified Files
- `pubspec.yaml` - Add sqflite, connectivity_plus, path
- `lib/main.dart` - Initialize offline DB and sync engine
- `lib/dashboard_screen.dart` - Add offline indicator
- `lib/app_state.dart` - Integrate feature flags and white-label service

## Dependencies to Add
- `sqflite: ^2.3.0` - SQLite for offline storage
- `connectivity_plus: ^6.0.0` - Network connectivity detection
- `path: ^1.8.0` - Path manipulation

## Migration Steps
1. Add dependencies to pubspec.yaml
2. Run flutter pub get
3. Apply database migration 014
4. Deploy backend API endpoints
5. Integrate services into Flutter app
6. Test offline-first behavior
7. Test sync when coming online
8. Test feature flags per tier
9. Test dynamic white-labeling

## Tier Definitions
- **Low (₹10k)**: Self-branded offline APK, basic features
- **Base (₹20k)**: Server-synced, basic white-labeling
- **Next (₹30k)**: Real-time sync, advanced white-labeling
- **Next+ (₹45k)**: Custom domain, priority sync
- **Final (₹55k)**: Branded desktop console, all features

## Feature Flags by Tier
| Feature | Low | Base | Next | Next+ | Final |
|---------|-----|------|------|-------|-------|
| Offline mode | ✅ | ✅ | ✅ | ✅ | ✅ |
| Product catalog | ✅ | ✅ | ✅ | ✅ | ✅ |
| Push notifications | ❌ | ✅ | ✅ | ✅ | ✅ |
| Customer history | ❌ | ✅ | ✅ | ✅ | ✅ |
| Site photos | ❌ | ❌ | ✅ | ✅ | ✅ |
| UPI QR | ❌ | ❌ | ✅ | ✅ | ✅ |
| Custom domain | ❌ | ❌ | ❌ | ✅ | ✅ |
| Desktop console | ❌ | ❌ | ❌ | ❌ | ✅ |
| Analytics | ❌ | ❌ | ❌ | ✅ | ✅ |
| Multi-user | ❌ | ❌ | ❌ | ❌ | ✅ |
| API access | ❌ | ❌ | ❌ | ❌ | ✅ |

## Sync Strategy
1. On app start: check connectivity
2. If online: sync pending changes, fetch latest content
3. If offline: use cached data
4. Background sync: periodic sync every 5 minutes when online
5. Real-time sync: Supabase Realtime for critical updates

## Conflict Resolution
- Server-wins for all conflicts
- Offline edits are queued and synced when online
- User warned before overwriting offline changes
- Last-write-wins for non-critical data

## Testing Plan
1. Test offline mode: disable network, verify app works
2. Test sync: make offline changes, come online, verify sync
3. Test feature flags: verify features appear/hide per tier
4. Test white-labeling: change server config, verify app updates
5. Test content sync: add products on server, verify app fetches
