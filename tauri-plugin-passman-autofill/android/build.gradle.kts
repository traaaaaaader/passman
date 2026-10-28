import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.trader.passman.autofill"
    compileSdk = 36

    defaultConfig {
        // 24 — минимум для Android Keystore API (`setUserAuthenticationParameters`
        // и смежные вызовы в BiometricVaultKeyStore.kt), совпадает с minSdk
        // основного приложения (см. src-tauri/gen/android/app/build.gradle.kts).
        // AutofillService сам по себе требует API 26+, но это гарантируется
        // системой: на более старых устройствах ОС просто не попытается
        // забиндиться к сервису — отдельно поднимать minSdk ради этого не нужно.
        minSdk = 24

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

dependencies {
    implementation("androidx.biometric:biometric:1.1.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    implementation(project(":tauri-android"))
}
