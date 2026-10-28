package com.trader.passman.autofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveInfo
import android.service.autofill.SaveRequest
import android.text.InputType
import android.util.Log
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import androidx.annotation.RequiresApi

private const val TAG = "PassmanAutofill"
private const val PLACEHOLDER_PASSWORD = "••••••••"

// Эвристики ниже — не код "под конкретный браузер". Android Autofill
// Framework работает одинаково для ЛЮБОГО приложения, которое отдаёт
// AssistStructure (Chrome, Яндекс.Браузер, Opera, Firefox — у каждого свой
// движок, но все они используют один и тот же системный API, и наш сервис
// не видит разницы, какой именно браузер его вызвал). Разница между ними —
// только в том, НАСКОЛЬКО ПОЛНО они заполняют структуру (hints/htmlInfo
// могут отличаться), поэтому вместо одной проверки делаем несколько
// независимых сигналов — так надёжнее работает сразу везде, а не только в
// Chrome. Соответствует подходу живых опенсорсных реализаций (PearPass).
private val USERNAME_HINT_WORDS = listOf("email", "phone", "username", "user", "mobile", "login")
private val PASSWORD_HINT_WORDS = listOf("password", "pswd", "pwd")
private val IGNORED_HINT_WORDS = listOf("search", "find", "recipient")

private fun containsAnyTerm(haystack: String, terms: List<String>): Boolean = terms.any { haystack.contains(it) }

private fun htmlAttr(node: AssistStructure.ViewNode, name: String): String? =
    node.htmlInfo?.attributes?.firstOrNull { it.first.equals(name, ignoreCase = true) }?.second

private fun isIgnored(node: AssistStructure.ViewNode): Boolean {
    val hintText = node.hint?.toString()?.lowercase() ?: ""
    val idEntry = node.idEntry?.lowercase() ?: ""
    return containsAnyTerm(hintText, IGNORED_HINT_WORDS) || containsAnyTerm(idEntry, IGNORED_HINT_WORDS)
}

/** Поле логина/почты/телефона — нужно, только чтобы ИСКЛЮЧИТЬ его из поиска пароля. */
private fun isUsernameField(node: AssistStructure.ViewNode): Boolean {
    if (isIgnored(node)) return false

    val hints = node.autofillHints
    if (hints != null && hints.any { containsAnyTerm(it.lowercase(), USERNAME_HINT_WORDS) }) return true

    val hintText = node.hint?.toString()?.lowercase() ?: ""
    if (containsAnyTerm(hintText, USERNAME_HINT_WORDS)) return true

    val idEntry = node.idEntry?.lowercase() ?: ""
    if (containsAnyTerm(idEntry, USERNAME_HINT_WORDS)) return true

    val autocomplete = htmlAttr(node, "autocomplete")?.lowercase()
    if (autocomplete != null && containsAnyTerm(autocomplete, USERNAME_HINT_WORDS)) return true

    val name = htmlAttr(node, "name")?.lowercase()
    if (name != null && containsAnyTerm(name, USERNAME_HINT_WORDS)) return true

    if (htmlAttr(node, "type")?.equals("email", ignoreCase = true) == true) return true

    val variation = node.inputType and InputType.TYPE_MASK_VARIATION
    return variation == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS ||
        variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
}

/**
 * Поле пароля — несколько независимых сигналов, т.к. разные браузеры
 * заполняют структуру по-разному (один сообщает `inputType`, другой —
 * только `htmlInfo.attributes`, третий — только `hint`/`idEntry`).
 */
private fun isPasswordField(node: AssistStructure.ViewNode): Boolean {
    if (isUsernameField(node)) return false
    if (isIgnored(node)) return false

    val inputType = node.inputType
    val isMultiline = (inputType and InputType.TYPE_TEXT_FLAG_MULTI_LINE) != 0
    val variation = inputType and InputType.TYPE_MASK_VARIATION
    val hasPasswordVariation =
        variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
            variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD
    if (hasPasswordVariation && !isMultiline) return true

    val hints = node.autofillHints
    if (hints != null && hints.any { containsAnyTerm(it.lowercase(), PASSWORD_HINT_WORDS) }) return true

    val hintText = node.hint?.toString()?.lowercase() ?: ""
    if (containsAnyTerm(hintText, PASSWORD_HINT_WORDS)) return true

    val idEntry = node.idEntry?.lowercase() ?: ""
    if (containsAnyTerm(idEntry, PASSWORD_HINT_WORDS)) return true

    if (htmlAttr(node, "type")?.equals("password", ignoreCase = true) == true) return true

    val autocomplete = htmlAttr(node, "autocomplete")?.lowercase()
    if (autocomplete != null && containsAnyTerm(autocomplete, PASSWORD_HINT_WORDS)) return true

    val name = htmlAttr(node, "name")?.lowercase()
    if (name != null && containsAnyTerm(name, PASSWORD_HINT_WORDS)) return true

    return false
}

/**
 * Поле именно "нового" пароля (регистрация/смена), а не поле логина на
 * форме входа — единственный надёжный прямой сигнал для этого в вебе:
 * `autocomplete="new-password"` (в отличие от `"current-password"` для
 * формы входа). Браузеры часто передают это значение буквально как есть
 * (и как `htmlInfo.attributes["autocomplete"]`, и как сырой `autofillHint`),
 * поэтому проверяем оба места текстовым сравнением, не константой
 * `View.AUTOFILL_HINT_*` — такой строки там в принципе не будет.
 */
private fun isNewPasswordField(node: AssistStructure.ViewNode): Boolean {
    val autocomplete = htmlAttr(node, "autocomplete")?.lowercase() ?: ""
    if (autocomplete.contains("new-password")) return true
    val hints = node.autofillHints
    return hints != null && hints.any { it.lowercase().let { h -> h.contains("new-password") || h.contains("newpassword") } }
}

/**
 * Системный сервис автозаполнения (Android Autofill Framework, API 26+).
 *
 * Сам сервис почти не содержит логики — он только находит в структуре
 * экрана поля пароля и домен страницы, и строит [FillResponse] с
 * authentication-гейтом на [UnlockActivity]. Вся реальная работа
 * (разблокировка, поиск, выдача пароля) происходит там — так и задумано
 * Android Autofill API: пока пользователь не пройдёт аутентификацию,
 * никакие реальные значения в ответе не передаются вообще, только intent на
 * экран аутентификации.
 *
 * ОГРАНИЧЕНИЕ: запись Passman хранит только название/пароль/описание/
 * ссылку, без отдельного поля логина — поэтому заполняется только поле
 * пароля. `onSaveRequest` тоже реализован (ниже) — именно так домен
 * попадает в хранилище без ручного ввода: ровно та же метка `webDomain`,
 * которую браузер прикладывает к полю при автозаполнении, прикладывается и
 * при сохранении новой формы.
 */
@RequiresApi(Build.VERSION_CODES.O)
class PassmanAutofillService : AutofillService() {

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback,
    ) {
        try {
            Log.d(TAG, "onFillRequest: получен запрос, fillContexts=${request.fillContexts.size}")
            val structure = request.fillContexts.lastOrNull()?.structure
            if (structure == null) {
                Log.d(TAG, "onFillRequest: нет структуры экрана")
                callback.onSuccess(null)
                return
            }

            val passwordIds = ArrayList<AutofillId>()
            var domain: String? = null
            var nodeCount = 0
            var hasNewPasswordSignal = false

            fun walk(node: AssistStructure.ViewNode) {
                nodeCount++
                if (domain == null) {
                    val webDomain = node.webDomain
                    if (!webDomain.isNullOrBlank()) {
                        domain = webDomain
                    }
                }

                val id = node.autofillId
                val isPassword = isPasswordField(node)

                // Временная диагностика: печатаем КАЖДЫЙ узел, у которого
                // есть хоть что-то похожее на текстовое поле — иначе не
                // понять, что реально сообщает конкретный браузер в
                // AssistStructure.
                val hints = node.autofillHints
                if (hints != null || node.autofillType != android.view.View.AUTOFILL_TYPE_NONE ||
                    node.className?.contains("Edit") == true
                ) {
                    Log.d(
                        TAG,
                        "узел: className=${node.className} hints=${hints?.joinToString()} " +
                            "inputType=${node.inputType} htmlTag=${node.htmlInfo?.tag} " +
                            "attrs=${node.htmlInfo?.attributes?.joinToString { "${it.first}=${it.second}" }} " +
                            "idEntry=${node.idEntry} hint=${node.hint} isPassword=$isPassword",
                    )
                }

                if (isPassword && id != null) {
                    passwordIds.add(id)
                    if (isNewPasswordField(node)) {
                        hasNewPasswordSignal = true
                    }
                }

                for (i in 0 until node.childCount) {
                    walk(node.getChildAt(i))
                }
            }

            for (i in 0 until structure.windowNodeCount) {
                walk(structure.getWindowNodeAt(i).rootViewNode)
            }
            Log.d(TAG, "onFillRequest: всего узлов обойдено=$nodeCount")

            // Два поля пароля без явного "new-password" — почти всегда пара
            // "пароль"/"повторите пароль" на форме регистрации или смены
            // пароля, а не форма входа (там одно поле). Предлагаем генерацию
            // и в этом случае — несмотря на отсутствие прямого сигнала.
            val offerGenerate = hasNewPasswordSignal || passwordIds.size >= 2

            Log.d(
                TAG,
                "onFillRequest: найдено полей пароля=${passwordIds.size}, offerGenerate=$offerGenerate, " +
                    "webDomain=$domain, activityPackage=${structure.activityComponent?.packageName}",
            )

            if (passwordIds.isEmpty()) {
                // Ничего подходящего на экране — по контракту API это не
                // ошибка, просто нет ответа.
                callback.onSuccess(null)
                return
            }

            // Если это не браузер (webDomain не сообщён), откатываемся на
            // имя пакета приложения — записи Passman хранят только
            // веб-ссылки, так что для обычных (не браузерных) приложений
            // совпадение найдётся только если пользователь сам вписал имя
            // пакета в поле "ссылка", что нетипично. Это известное
            // ограничение текущей модели данных, не баг.
            val resolvedDomain = domain ?: structure.activityComponent?.packageName ?: ""

            val authIntent = Intent(this, UnlockActivity::class.java).apply {
                putExtra(UnlockActivity.EXTRA_DOMAIN, resolvedDomain)
                putParcelableArrayListExtra(UnlockActivity.EXTRA_AUTOFILL_IDS, passwordIds)
            }
            val intentSender = PendingIntent.getActivity(
                this,
                System.identityHashCode(request),
                authIntent,
                PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            ).intentSender

            // Авторизация навешивается на САМ Dataset (а не на весь
            // FillResponse) — так в одном ответе можно одновременно
            // предложить и "разблокировать существующий пароль" (требует
            // аутентификации), и "сгенерировать новый" (не требует —
            // генерация не трогает хранилище). Тот же приём, что у
            // PearPass и других реальных реализаций.
            val unlockPresentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
                setTextViewText(android.R.id.text1, "Разблокировать Passman")
                setTextColor(android.R.id.text1, android.graphics.Color.BLACK)
            }
            val unlockDataset = Dataset.Builder()
            for (id in passwordIds) {
                unlockDataset.setValue(id, AutofillValue.forText(PLACEHOLDER_PASSWORD), unlockPresentation)
            }
            unlockDataset.setAuthentication(intentSender)

            val responseBuilder = FillResponse.Builder().addDataset(unlockDataset.build())

            if (offerGenerate) {
                val generated = try {
                    VaultBridge.generatePassword()
                } catch (e: Exception) {
                    Log.e(TAG, "onFillRequest: generatePassword упал", e)
                    null
                }
                if (generated != null) {
                    val generatePresentation =
                        RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
                            setTextViewText(android.R.id.text1, "Создать надёжный пароль")
                            setTextColor(android.R.id.text1, android.graphics.Color.BLACK)
                        }
                    val generateDataset = Dataset.Builder()
                    for (id in passwordIds) {
                        // Один и тот же сгенерированный пароль во ВСЕ найденные
                        // поля пароля сразу — это и есть правильное поведение
                        // для пары "пароль"/"повторите пароль".
                        generateDataset.setValue(id, AutofillValue.forText(generated), generatePresentation)
                    }
                    responseBuilder.addDataset(generateDataset.build())
                }
            }

            // Требуем значение именно в поле пароля — пока пользователь не
            // наберёт и отправит НОВЫЙ пароль, никакого сохранения не будет.
            // Это и есть "обучение" без ручного ввода домена: Android сам
            // решает, когда экран с этим полем закрылся со значением,
            // отличным от того, что мы выдали (а мы ничего не выдавали в
            // unlock-датасете — значит, сработает на любой непустой ввод).
            val saveInfo = SaveInfo.Builder(SaveInfo.SAVE_DATA_TYPE_PASSWORD, passwordIds.toTypedArray()).build()
            responseBuilder.setSaveInfo(saveInfo)

            Log.d(TAG, "onFillRequest: resolvedDomain=$resolvedDomain, offerGenerate=$offerGenerate")
            callback.onSuccess(responseBuilder.build())
        } catch (e: Exception) {
            // Это колбэк системного сервиса, выполняющийся внутри процесса
            // ЧУЖОГО приложения (браузера и т.п.) — исключение отсюда не
            // должно вылетать наружу ни в каком виде.
            Log.e(TAG, "onFillRequest: исключение", e)
            callback.onFailure("Не удалось подготовить автозаполнение")
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        // Системный диалог "Сохранить в Passman?" пользователь уже увидел и
        // подтвердил ДО этого вызова — его рисует сама платформа по данным
        // из SaveInfo, мы тут ничего не показываем. Наша работа — достать
        // домен и реально введённый пароль из структуры и записать их в
        // зашифрованное хранилище, для чего нужен vault key, а значит —
        // новая аутентификация (biometric/мастер-пароль), т.к. тот,
        // который разблокировал экран при автозаполнении, сюда не доходит.
        try {
            val structure = request.fillContexts.lastOrNull()?.structure
            if (structure == null) {
                callback.onSuccess()
                return
            }

            var domain: String? = null
            var password: String? = null

            fun walk(node: AssistStructure.ViewNode) {
                if (domain == null) {
                    val webDomain = node.webDomain
                    if (!webDomain.isNullOrBlank()) {
                        domain = webDomain
                    }
                }
                if (password == null && isPasswordField(node)) {
                    val value = node.autofillValue
                    if (value != null && value.isText) {
                        val text = value.textValue?.toString()
                        if (!text.isNullOrEmpty()) {
                            password = text
                        }
                    }
                }
                for (i in 0 until node.childCount) {
                    walk(node.getChildAt(i))
                }
            }
            for (i in 0 until structure.windowNodeCount) {
                walk(structure.getWindowNodeAt(i).rootViewNode)
            }

            val resolvedDomain = domain ?: structure.activityComponent?.packageName
            val capturedPassword = password

            Log.d(
                TAG,
                "onSaveRequest: domain=$resolvedDomain, пароль захвачен=${capturedPassword != null}",
            )

            if (resolvedDomain.isNullOrBlank() || capturedPassword.isNullOrEmpty()) {
                callback.onSuccess()
                return
            }

            // AutofillService — не Activity, поэтому для запуска экрана
            // нужен отдельный таск (без FLAG_ACTIVITY_NEW_TASK система
            // выбросит исключение из-за отсутствия контекста Activity).
            val saveIntent = Intent(this, SaveEntryActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtra(SaveEntryActivity.EXTRA_DOMAIN, resolvedDomain)
                putExtra(SaveEntryActivity.EXTRA_PASSWORD, capturedPassword)
            }
            startActivity(saveIntent)
            callback.onSuccess()
        } catch (e: Exception) {
            Log.e(TAG, "onSaveRequest: исключение", e)
            callback.onSuccess()
        }
    }
}
