import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// 本番署名設定を keystore.properties から読み込む (ファイルがなければ debug 署名にフォールバック)
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().also { props ->
    if (keystorePropsFile.exists()) props.load(keystorePropsFile.inputStream())
}

android {
    namespace  = "com.antigravity.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.antigravity.app"
        minSdk        = 26
        targetSdk     = 35
        versionCode   = 1
        versionName   = "1.0.0"
    }

    signingConfigs {
        // debug キーストアはデフォルトのまま
        getByName("debug") {
            // Android デフォルト ~/.android/debug.keystore
        }
        // 本番署名: keystore.properties が存在する場合のみ有効
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile   = file(keystoreProps["storeFile"] as String)
                storePassword = keystoreProps["storePassword"] as String
                keyAlias    = keystoreProps["keyAlias"] as String
                keyPassword = keystoreProps["keyPassword"] as String
            }
        }
    }

    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".debug"
            versionNameSuffix   = "-debug"
            isDebuggable        = true
        }
        getByName("release") {
            isMinifyEnabled    = true
            isShrinkResources  = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // keystore.properties があれば本番署名、なければ debug 署名 (内部配布用)
            signingConfig = if (keystorePropsFile.exists())
                signingConfigs.getByName("release")
            else
                signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures {
        compose      = true
        buildConfig  = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    implementation(project(":core-contract"))
    implementation(project(":core-engine"))
    implementation(project(":data"))

    implementation(libs.kotlin.stdlib)
    implementation(libs.coroutines.android)
    implementation(libs.workmanager)
    implementation(libs.okhttp)
    implementation(libs.androidx.core.ktx)
    implementation(libs.activity.ktx)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.viewmodel.ktx)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.glance.appwidget)

    // Compose
    val composeBom = platform(libs.compose.bom)
    implementation(composeBom)
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.preview)
    debugImplementation(libs.compose.ui.tooling)

    // Test
    testImplementation(libs.room.runtime)
    testImplementation(libs.room.testing)
    testImplementation(libs.junit4)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.workmanager.testing)
}
