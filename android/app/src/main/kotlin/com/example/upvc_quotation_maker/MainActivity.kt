package com.example.upvc_quotation_maker

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {

    companion object {
        private const val CHANNEL = "app.vitharn/install"
        private const val MIME_APK = "application/vnd.android.package-archive"
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                if (call.method == "installApk") {
                    val path = call.argument<String>("path")
                    if (path.isNullOrBlank()) {
                        result.error("BAD_ARG", "installApk requires a non-empty 'path'", null)
                        return@setMethodCallHandler
                    }
                    handleInstall(path, result)
                } else {
                    result.notImplemented()
                }
            }
    }

    private fun handleInstall(path: String, result: MethodChannel.Result) {
        try {
            val file = File(path)
            if (!file.exists() || !file.isFile) {
                result.error("FILE_MISSING", "APK not found at: $path", null)
                return
            }

            val uri: Uri = FileProvider.getUriForFile(
                this,
                "$packageName.fileprovider",
                file
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, MIME_APK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
            result.success(true)
        } catch (e: ActivityNotFoundException) {
            // Installer missing / blocked — best-effort: open "Install unknown apps" settings.
            openUnknownSourcesSettings()
            result.error("NO_HANDLER", "No activity found to install the APK", e.toString())
        } catch (e: Exception) {
            result.error("INSTALL_ERROR", e.message ?: "Unknown install error", e.toString())
        }
    }

    private fun openUnknownSourcesSettings() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:$packageName")
                    )
                )
            } else {
                startActivity(Intent(Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS))
            }
        } catch (_: Exception) {
            // Best-effort only — the caller already returned an error to Dart.
        }
    }
}
