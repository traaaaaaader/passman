package com.trader.passman.autofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.text.InputType
import android.view.View
import android.view.autofill.AutofillId
import android.widget.RemoteViews
import androidx.annotation.RequiresApi

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
 * пароля. Сохранение новых паролей через `onSaveRequest` не реализовано
 * (осознанно, см. обсуждение) — только заполнение существующих записей.
 */
@RequiresApi(Build.VERSION_CODES.O)
class PassmanAutofillService : AutofillService() {

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback,
    ) {
        try {
            val structure = request.fillContexts.lastOrNull()?.structure
            if (structure == null) {
                callback.onSuccess(null)
                return
            }

            val passwordIds = ArrayList<AutofillId>()
            var domain: String? = null

            fun walk(node: AssistStructure.ViewNode) {
                if (domain == null) {
                    val webDomain = node.webDomain
                    if (!webDomain.isNullOrBlank()) {
                        domain = webDomain
                    }
                }

                val hints = node.autofillHints
                val isPasswordField =
                    (hints != null && hints.any { it == View.AUTOFILL_HINT_PASSWORD }) ||
                        isPasswordInputType(node.inputType)
                val id = node.autofillId
                if (isPasswordField && id != null) {
                    passwordIds.add(id)
                }

                for (i in 0 until node.childCount) {
                    walk(node.getChildAt(i))
                }
            }

            for (i in 0 until structure.windowNodeCount) {
                walk(structure.getWindowNodeAt(i).rootViewNode)
            }

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

            val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
                setTextViewText(android.R.id.text1, "Разблокировать Passman")
            }

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

            val response = FillResponse.Builder()
                .setAuthentication(passwordIds.toTypedArray(), intentSender, presentation)
                .build()

            callback.onSuccess(response)
        } catch (e: Exception) {
            // Это колбэк системного сервиса, выполняющийся внутри процесса
            // ЧУЖОГО приложения (браузера и т.п.) — исключение отсюда не
            // должно вылетать наружу ни в каком виде.
            callback.onFailure("Не удалось подготовить автозаполнение")
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        callback.onFailure("Сохранение новых паролей через автозаполнение не поддерживается")
    }

    private fun isPasswordInputType(inputType: Int): Boolean {
        val variation = inputType and InputType.TYPE_MASK_VARIATION
        return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
            variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD
    }
}
