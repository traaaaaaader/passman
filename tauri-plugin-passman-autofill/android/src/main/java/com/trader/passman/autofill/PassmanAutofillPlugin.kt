package com.trader.passman.autofill

import android.app.Activity
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Plugin

/**
 * Обязательная точка входа для Tauri, чтобы этот Gradle-модуль был признан
 * настоящим Android-плагином — у нас нет команд, вызываемых из webview
 * (`invoke()`): автозаполнение запускает сама Android, а не наш JS. Весь
 * реальный код — [PassmanAutofillService], [UnlockActivity],
 * [BiometricVaultKeyStore], [VaultBridge] — не связан с этим классом,
 * просто живёт в том же модуле (это стандартно и ожидаемо для
 * Tauri-плагинов, см. src-android/README.md).
 */
@TauriPlugin
class PassmanAutofillPlugin(private val activity: Activity) : Plugin(activity)
