package com.trader.passman.autofill

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.RequiresApi
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * Экран, который запускает [PassmanAutofillService.onSaveRequest], когда
 * пользователь ввёл и отправил НОВЫЙ пароль на сайте, а системный диалог
 * "Сохранить в Passman?" уже подтверждён (это рисует сама платформа — мы
 * его не видим и не показываем повторно).
 *
 * Здесь нужна СВОЯ аутентификация — vault key, полученный при
 * разблокировке автозаполнения в [UnlockActivity], сюда не доходит
 * (разные вызовы системы, разное время жизни). Логика получения ключа —
 * тот же паттерн "биометрия из кэша, иначе мастер-пароль", что и в
 * [UnlockActivity]; сознательно не вынесено в общий хелпер, чтобы не
 * трогать уже отработанный код [UnlockActivity] при добавлении этого
 * экрана.
 */
@RequiresApi(Build.VERSION_CODES.O)
class SaveEntryActivity : FragmentActivity() {

    private var domain: String = ""
    private var capturedPassword: String = ""
    private val backgroundExecutor: Executor = Executors.newSingleThreadExecutor()

    companion object {
        const val EXTRA_DOMAIN = "com.trader.passman.autofill.SAVE_EXTRA_DOMAIN"
        const val EXTRA_PASSWORD = "com.trader.passman.autofill.SAVE_EXTRA_PASSWORD"

        private const val BG_COLOR = "#1F2430"
        private const val ERROR_COLOR = "#EF6B6B"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        domain = intent.getStringExtra(EXTRA_DOMAIN) ?: ""
        capturedPassword = intent.getStringExtra(EXTRA_PASSWORD) ?: ""
        if (domain.isEmpty() || capturedPassword.isEmpty()) {
            finish()
            return
        }

        tryBiometricThenFallback()
    }

    private fun appDataDir(): String = applicationContext.dataDir.absolutePath

    private fun biometricAvailable(): Boolean =
        BiometricManager.from(this)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
            BiometricManager.BIOMETRIC_SUCCESS

    private fun tryBiometricThenFallback() {
        if (!BiometricVaultKeyStore.hasCachedKey(this) || !biometricAvailable()) {
            showMasterPasswordUi()
            return
        }

        val cipher = try {
            BiometricVaultKeyStore.createDecryptCipher(this)
        } catch (_: Exception) {
            null
        }
        if (cipher == null) {
            showMasterPasswordUi()
            return
        }

        val prompt = BiometricPrompt(
            this,
            backgroundExecutor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val authorizedCipher = result.cryptoObject?.cipher
                    val vaultKey = if (authorizedCipher != null) {
                        try {
                            BiometricVaultKeyStore.readWrapped(this@SaveEntryActivity, authorizedCipher)
                        } catch (_: Exception) {
                            null
                        }
                    } else {
                        null
                    }
                    if (vaultKey == null) {
                        runOnUiThread { showMasterPasswordUi() }
                    } else {
                        createEntryAndFinish(vaultKey)
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    runOnUiThread { showMasterPasswordUi() }
                }

                override fun onAuthenticationFailed() {}
            },
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Passman")
            .setSubtitle("Сохранить пароль для $domain")
            .setNegativeButtonText("Ввести мастер-пароль")
            .build()

        prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
    }

    private fun showMasterPasswordUi() {
        val padding = dp(16)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
            setBackgroundColor(Color.parseColor(BG_COLOR))
            gravity = Gravity.CENTER
        }

        root.addView(
            TextView(this).apply {
                text = "Сохранить пароль для $domain в Passman?\nВведите мастер-пароль"
                setTextColor(Color.WHITE)
                textSize = 16f
            },
        )

        val passwordField = EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            transformationMethod = android.text.method.PasswordTransformationMethod.getInstance()
            setTextColor(Color.WHITE)
        }
        root.addView(passwordField)

        val errorText = TextView(this).apply {
            setTextColor(Color.parseColor(ERROR_COLOR))
            visibility = android.view.View.GONE
        }
        root.addView(errorText)

        val submitButton = Button(this).apply { text = "Сохранить" }
        val cancelButton = Button(this).apply { text = "Не сохранять" }
        root.addView(submitButton)
        root.addView(cancelButton)

        cancelButton.setOnClickListener { finish() }

        submitButton.setOnClickListener {
            errorText.visibility = android.view.View.GONE
            submitButton.isEnabled = false
            val passwordBytes = passwordField.text.toString().toByteArray(Charsets.UTF_8)

            backgroundExecutor.execute {
                val vaultKey = try {
                    VaultBridge.unlockWithPassword(appDataDir(), passwordBytes)
                } catch (_: Exception) {
                    null
                } finally {
                    passwordBytes.fill(0)
                }

                if (vaultKey == null) {
                    runOnUiThread {
                        errorText.text = "Неверный мастер-пароль"
                        errorText.visibility = android.view.View.VISIBLE
                        submitButton.isEnabled = true
                    }
                } else {
                    createEntryAndFinish(vaultKey)
                }
            }
        }

        setContentView(root)
    }

    private fun createEntryAndFinish(vaultKey: ByteArray) {
        backgroundExecutor.execute {
            val passwordBytes = capturedPassword.toByteArray(Charsets.UTF_8)
            try {
                VaultBridge.createEntry(appDataDir(), vaultKey, domain, passwordBytes)
            } catch (e: Exception) {
                android.util.Log.e("PassmanAutofill", "SaveEntryActivity: createEntry упал", e)
            } finally {
                passwordBytes.fill(0)
                vaultKey.fill(0)
            }
            runOnUiThread { finish() }
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
