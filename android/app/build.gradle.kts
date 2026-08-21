import java.io.FileInputStream
import java.util.Properties

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

/// WHITELABELING KNOBS (Vitharn ERP per-client APK builds).
///
/// Every value below has a default that reproduces the previous hard-coded
/// build byte-for-byte, so the existing CI workflows (`release.yml`,
/// `build_client_apk.yml`) keep working untouched. Override per client with
/// Gradle properties, e.g.:
///
///   flutter build apk --release \
///     -Pvitharn.appLabel="KPR UPVC Quote" \
///     -Pvitharn.applicationId="com.vitharn.kprupvc"
///
/// applicationId MUST differ per client if two clients' APKs are ever installed
/// on the same device; Android treats a duplicate applicationId as the same app
/// and the second install overwrites the first.
val vitharnAppLabel: String =
    (project.findProperty("vitharn.appLabel") as String?)
        ?: "VENKATESHWARA UPVC Quote"
val vitharnApplicationId: String =
    (project.findProperty("vitharn.applicationId") as String?)
        ?: "com.example.upvc_quotation_maker"

android {
    namespace = "com.example.upvc_quotation_maker"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        applicationId = vitharnApplicationId
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // Consumed by android:label in AndroidManifest.xml.
        manifestPlaceholders["appLabel"] = vitharnAppLabel
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = keystoreProperties.getProperty("storeFile")?.let { file(it) }
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            // Use the custom release signing config when a keystore exists locally;
            // fall back to the debug keystore in CI (no key.properties) so
            // on-demand APK builds don't fail with "storeFile missing".
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
    // androidx.core.content.FileProvider (used by the in-app APK updater). The
    // Flutter embedding usually brings androidx.core transitively, but declaring
    // it explicitly guarantees FileProvider resolves on every toolchain.
    implementation("androidx.core:core-ktx:1.13.1")
}