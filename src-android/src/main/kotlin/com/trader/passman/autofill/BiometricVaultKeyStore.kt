package com.trader.passman.autofill

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Кэширует vault key, обёрнутый AES-256-GCM ключом в Android Keystore,
 * доступ к которому требует биометрию при КАЖДОМ использовании —
 * `setUserAuthenticationRequired(true)` без льготного периода
 * (`setUserAuthenticationParameters(0, ...)` / устаревший эквивалент на
 * старых API). Сам файл с обёрнутым ключом — не секрет сам по себе: без
 * Keystore-ключа (который физически не экспортируется из защищённого
 * аппаратного модуля устройства) его не расшифровать.
 *
 * ВАЖНО: это не альтернативный путь входа и не резервная копия пароля —
 * это просто более удобный способ пройти ту же проверку владения
 * устройством, которую обычно даёт сам факт разблокировки экрана +
 * биометрия. Компрометация файла кэша на сломанном/скомпрометированном
 * устройстве всё равно ничего не даёт без успешного биометрического
 * сканирования НА ЭТОМ устройстве.
 *
 * Паттерн «создать Cipher заранее → передать в BiometricPrompt.CryptoObject
 * → использовать именно тот же (авторизованный) Cipher после успеха» —
 * стандартный для Android Keystore + BiometricPrompt, его нельзя заменить
 * на «создать новый Cipher после успеха» (новый Cipher не будет
 * авторизован).
 */
object BiometricVaultKeyStore {
    private const val KEYSTORE_ALIAS = "passman_autofill_vault_key_wrap"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val CACHE_FILE_NAME = "autofill_cached_key.bin"
    private const val GCM_TAG_LENGTH_BITS = 128
    private const val GCM_IV_LENGTH_BYTES = 12
    private const val TRANSFORMATION = "AES/GCM/NoPadding"

    private fun cacheFile(context: Context): File = File(context.filesDir, CACHE_FILE_NAME)

    fun hasCachedKey(context: Context): Boolean = cacheFile(context).exists()

    /** Полностью сбрасывает кэш — и файл, и сам Keystore-ключ. */
    fun clearCache(context: Context) {
        cacheFile(context).delete()
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keyStore.load(null)
            keyStore.deleteEntry(KEYSTORE_ALIAS)
        } catch (_: Exception) {
            // Ключа могло не быть — не критично.
        }
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)
        (keyStore.getKey(KEYSTORE_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val specBuilder = KeyGenParameterSpec.Builder(
            KEYSTORE_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            specBuilder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
        } else {
            @Suppress("DEPRECATION")
            specBuilder.setUserAuthenticationValidityDurationSeconds(-1)
        }

        generator.init(specBuilder.build())
        return generator.generateKey()
    }

    /**
     * Неавторизованный Cipher для ШИФРОВАНИЯ, готовый к передаче в
     * `BiometricPrompt.CryptoObject`. Не вызывать `doFinal` до успешного
     * биометрического подтверждения.
     */
    fun createEncryptCipher(): Cipher {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        return cipher
    }

    /**
     * Неавторизованный Cipher для РАСШИФРОВКИ — использует IV, сохранённый
     * вместе с шифротекстом в файле кэша. Возвращает `null`, если кэша нет
     * или файл повреждён (а не бросает исключение — отсутствие кэша это
     * ожидаемый случай, не ошибка).
     */
    fun createDecryptCipher(context: Context): Cipher? {
        val file = cacheFile(context)
        if (!file.exists()) return null
        val bytes = file.readBytes()
        if (bytes.size <= GCM_IV_LENGTH_BYTES) return null
        val iv = bytes.copyOfRange(0, GCM_IV_LENGTH_BYTES)
        return try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keyStore.load(null)
            val key = keyStore.getKey(KEYSTORE_ALIAS, null) as? SecretKey ?: return null
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
            cipher
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Сохраняет [vaultKey], зашифрованный уже АВТОРИЗОВАННЫМ (прошедшим
     * биометрию через `BiometricPrompt`) [authorizedEncryptCipher] — именно
     * тем же экземпляром, что был передан в `CryptoObject`, не новым.
     */
    fun saveWrapped(context: Context, authorizedEncryptCipher: Cipher, vaultKey: ByteArray) {
        val iv = authorizedEncryptCipher.iv
        val ciphertext = authorizedEncryptCipher.doFinal(vaultKey)
        cacheFile(context).writeBytes(iv + ciphertext)
    }

    /**
     * Расшифровывает кэш уже АВТОРИЗОВАННЫМ [authorizedDecryptCipher] —
     * тем же экземпляром, что вернул [createDecryptCipher] и был передан в
     * `CryptoObject`.
     */
    fun readWrapped(context: Context, authorizedDecryptCipher: Cipher): ByteArray {
        val bytes = cacheFile(context).readBytes()
        val ciphertext = bytes.copyOfRange(GCM_IV_LENGTH_BYTES, bytes.size)
        return authorizedDecryptCipher.doFinal(ciphertext)
    }
}
