package com.trader.passman.autofill

import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.service.autofill.Dataset
import android.text.InputType
import android.text.method.PasswordTransformationMethod
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RemoteViews
import android.widget.TextView
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import org.json.JSONArray
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * Невидимый экран, который Android Autofill Framework запускает как
 * "authentication" для [PassmanAutofillService]. Логика: сначала пробуем
 * отпечаток/биометрию (если для неё уже закэширован vault key), при любой
 * ошибке или отсутствии кэша — показываем ввод мастер-пароля. Ничего не
 * показываем и не отдаём автозаполнению, пока один из этих двух путей не
 * завершится успешно (fail closed).
 *
 * UI собран программно (без XML layout) — минимизирует предположения о том,
 * какие ресурсы/темы/зависимости (Compose и т.п.) уже есть в сгенерированном
 * Tauri Android-проекте, куда этот файл встраивается.
 */
@RequiresApi(Build.VERSION_CODES.O)
class UnlockActivity : FragmentActivity() {

    private var autofillIds: ArrayList<AutofillId> = arrayListOf()
    private var domain: String = ""
    private val backgroundExecutor: Executor = Executors.newSingleThreadExecutor()

    companion object {
        const val EXTRA_DOMAIN = "com.trader.passman.autofill.EXTRA_DOMAIN"
        const val EXTRA_AUTOFILL_IDS = "com.trader.passman.autofill.EXTRA_AUTOFILL_IDS"

        private const val BG_COLOR = "#1F2430"
        private const val ERROR_COLOR = "#EF6B6B"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // На этом экране может показываться поле ввода мастер-пароля — не
        // даём снимать скриншот/превью в списке последних приложений.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        @Suppress("DEPRECATION")
        val ids: ArrayList<AutofillId>? = intent.getParcelableArrayListExtra(EXTRA_AUTOFILL_IDS)
        autofillIds = ids ?: arrayListOf()
        domain = intent.getStringExtra(EXTRA_DOMAIN) ?: ""

        if (autofillIds.isEmpty()) {
            cancelAndFinish()
            return
        }

        tryBiometricThenFallback()
    }

    // ВАЖНО: это НЕ `filesDir` (.../files/) — Tauri на Android отдаёт
    // `app.path().app_data_dir()` равным корню данных приложения
    // (`/data/data/<package>/`), и именно туда `store.rs` пишет
    // `vault.json`. Расхождение с `filesDir` выглядело как «неверный
    // мастер-пароль» (хранилище просто не находилось), хотя пароль был
    // верным.
    private fun appDataDir(): String = applicationContext.dataDir.absolutePath

    private fun biometricAvailable(): Boolean =
        BiometricManager.from(this)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
            BiometricManager.BIOMETRIC_SUCCESS

    private fun tryBiometricThenFallback() {
        if (!BiometricVaultKeyStore.hasCachedKey(this) || !biometricAvailable()) {
            showMasterPasswordUi(offerEnableBiometric = biometricAvailable())
            return
        }

        val cipher = try {
            BiometricVaultKeyStore.createDecryptCipher(this)
        } catch (_: Exception) {
            null
        }
        if (cipher == null) {
            showMasterPasswordUi(offerEnableBiometric = true)
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
                            BiometricVaultKeyStore.readWrapped(this@UnlockActivity, authorizedCipher)
                        } catch (_: Exception) {
                            null
                        }
                    } else {
                        null
                    }
                    if (vaultKey == null) {
                        runOnUiThread { showMasterPasswordUi(offerEnableBiometric = false) }
                    } else {
                        proceedWithVaultKey(vaultKey)
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    // Любая ошибка биометрии — включая явный выбор
                    // "Ввести мастер-пароль" через negative button
                    // (ERROR_NEGATIVE_BUTTON) — по требованию переходим на
                    // мастер-пароль, а не просто отменяем операцию.
                    runOnUiThread { showMasterPasswordUi(offerEnableBiometric = false) }
                }

                override fun onAuthenticationFailed() {
                    // Один неверный скан — BiometricPrompt сам предлагает
                    // повторить; onAuthenticationError придёт, когда
                    // попытки закончатся. Здесь ничего не делаем.
                }
            },
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Passman")
            .setSubtitle("Разблокировать для автозаполнения")
            .setNegativeButtonText("Ввести мастер-пароль")
            .build()

        prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
    }

    private fun showMasterPasswordUi(offerEnableBiometric: Boolean) {
        val padding = dp(16)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
            setBackgroundColor(Color.parseColor(BG_COLOR))
        }

        root.addView(
            TextView(this).apply {
                text = "Введите мастер-пароль Passman"
                setTextColor(Color.WHITE)
                textSize = 16f
            },
        )

        val passwordField = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            transformationMethod = PasswordTransformationMethod.getInstance()
            setTextColor(Color.WHITE)
        }
        root.addView(passwordField)

        val errorText = TextView(this).apply {
            setTextColor(Color.parseColor(ERROR_COLOR))
            visibility = View.GONE
        }
        root.addView(errorText)

        val submitButton = Button(this).apply { text = "Разблокировать" }
        root.addView(submitButton)

        // ВАЖНО (известное ограничение, не ошибка): `EditText` хранит текст
        // во внутреннем `Editable`-буфере как обычную (неизменяемую после
        // использования системой текстовых виджетов) память — полноценно
        // обнулить её из прикладного кода Android не даёт. Как только текст
        // переведён в байты ниже, этот `ByteArray` обнуляется немедленно
        // после использования — это лучшее, что можно сделать на этом слое.
        submitButton.setOnClickListener {
            errorText.visibility = View.GONE
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

                runOnUiThread {
                    if (vaultKey == null) {
                        errorText.text = "Неверный мастер-пароль"
                        errorText.visibility = View.VISIBLE
                        submitButton.isEnabled = true
                        return@runOnUiThread
                    }
                    if (offerEnableBiometric) {
                        offerEnableBiometricThenProceed(vaultKey)
                    } else {
                        proceedWithVaultKey(vaultKey)
                    }
                }
            }
        }

        setContentView(root)
    }

    private fun offerEnableBiometricThenProceed(vaultKey: ByteArray) {
        val padding = dp(16)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
            setBackgroundColor(Color.parseColor(BG_COLOR))
            gravity = Gravity.CENTER
        }
        root.addView(
            TextView(this).apply {
                text = "Включить разблокировку автозаполнения отпечатком пальца?"
                setTextColor(Color.WHITE)
            },
        )

        val yes = Button(this).apply { text = "Включить" }
        val no = Button(this).apply { text = "Не сейчас" }
        root.addView(yes)
        root.addView(no)
        setContentView(root)

        no.setOnClickListener { proceedWithVaultKey(vaultKey) }

        yes.setOnClickListener {
            val cipher = try {
                BiometricVaultKeyStore.createEncryptCipher()
            } catch (_: Exception) {
                proceedWithVaultKey(vaultKey)
                return@setOnClickListener
            }
            val prompt = BiometricPrompt(
                this,
                backgroundExecutor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        val authorizedCipher = result.cryptoObject?.cipher
                        if (authorizedCipher != null) {
                            try {
                                BiometricVaultKeyStore.saveWrapped(this@UnlockActivity, authorizedCipher, vaultKey)
                            } catch (_: Exception) {
                                // Не удалось включить кэш — не критично для
                                // текущей операции, просто продолжаем без него.
                            }
                        }
                        runOnUiThread { proceedWithVaultKey(vaultKey) }
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        runOnUiThread { proceedWithVaultKey(vaultKey) }
                    }

                    override fun onAuthenticationFailed() {}
                },
            )
            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle("Включить биометрию")
                .setNegativeButtonText("Отмена")
                .build()
            prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
        }
    }

    private fun proceedWithVaultKey(vaultKey: ByteArray) {
        backgroundExecutor.execute {
            val matchesJson = try {
                VaultBridge.searchByDomain(appDataDir(), vaultKey, domain)
            } catch (e: Exception) {
                Log.e(TAG, "proceedWithVaultKey: searchByDomain упал, domain=$domain", e)
                null
            }

            if (matchesJson == null) {
                vaultKey.fill(0)
                runOnUiThread { cancelAndFinish() }
                return@execute
            }
            Log.d(TAG, "proceedWithVaultKey: searchByDomain(domain=$domain) -> $matchesJson")

            val matches = try {
                val array = JSONArray(matchesJson)
                (0 until array.length()).map { i ->
                    val obj = array.getJSONObject(i)
                    Pair(obj.getString("id"), obj.getString("name"))
                }
            } catch (e: Exception) {
                Log.e(TAG, "proceedWithVaultKey: не удалось распарсить JSON", e)
                emptyList()
            }

            if (matches.isEmpty()) {
                Log.d(TAG, "proceedWithVaultKey: 0 совпадений по домену $domain")
                vaultKey.fill(0)
                runOnUiThread { cancelAndFinish() }
                return@execute
            }

            if (matches.size == 1) {
                fillWithEntry(vaultKey, matches[0].first)
                return@execute
            }

            runOnUiThread { showEntryPicker(vaultKey, matches) }
        }
    }

    private fun showEntryPicker(vaultKey: ByteArray, matches: List<Pair<String, String>>) {
        val padding = dp(16)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
            setBackgroundColor(Color.parseColor(BG_COLOR))
        }
        root.addView(
            TextView(this).apply {
                text = "Выберите запись"
                setTextColor(Color.WHITE)
            },
        )
        for ((id, name) in matches) {
            val button = Button(this).apply { text = name }
            button.setOnClickListener { fillWithEntry(vaultKey, id) }
            root.addView(button)
        }
        setContentView(root)
    }

    private fun fillWithEntry(vaultKey: ByteArray, entryId: String) {
        backgroundExecutor.execute {
            val password = try {
                VaultBridge.getPassword(appDataDir(), vaultKey, entryId)
            } catch (e: Exception) {
                Log.e(TAG, "fillWithEntry: getPassword упал, entryId=$entryId", e)
                null
            } finally {
                vaultKey.fill(0)
            }

            runOnUiThread {
                if (password == null) {
                    cancelAndFinish()
                    return@runOnUiThread
                }
                Log.d(TAG, "fillWithEntry: пароль получен, autofillIds=${autofillIds.size}, ставлю результат")
                val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
                    setTextViewText(android.R.id.text1, "Passman")
                    // См. комментарий в PassmanAutofillService — тот же
                    // риск белого текста на белом фоне подсказки.
                    setTextColor(android.R.id.text1, Color.BLACK)
                }
                val datasetBuilder = Dataset.Builder()
                for (id in autofillIds) {
                    datasetBuilder.setValue(id, AutofillValue.forText(password), presentation)
                }
                val result = Intent()
                result.putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, datasetBuilder.build())
                setResult(RESULT_OK, result)
                finish()
            }
        }
    }

    private fun cancelAndFinish() {
        setResult(RESULT_CANCELED)
        finish()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
