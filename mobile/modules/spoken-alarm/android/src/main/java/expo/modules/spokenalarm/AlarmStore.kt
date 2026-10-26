package expo.modules.spokenalarm

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class AlarmRecord(val key: String, val dueAt: Long, val message: String, val token: String, val test: Boolean, val language: String = "en-IN") {
  fun json() = JSONObject().put("key", key).put("dueAt", dueAt).put("message", message).put("token", token).put("test", test).put("language", language)
}

/** Credential-protected, excluded from backup, authenticated encryption. Never log speech text. */
object AlarmStore {
  private const val ALIAS = "family-medicine-spoken-alarms-v1"
  private fun file(context: Context) = AtomicFile(File(context.noBackupFilesDir, "spoken-alarms.aes"))
  private fun secret(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  @Synchronized fun read(context: Context): List<AlarmRecord> {
    if (!file(context).baseFile.exists()) return emptyList()
    val bytes = file(context).readFully()
    require(bytes.size > 28) { "Alarm storage is unreadable. Re-enable reminders." }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secret(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
    val array = JSONArray(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
    return (0 until array.length()).map { index ->
      val item = array.getJSONObject(index)
      AlarmRecord(item.getString("key"), item.getLong("dueAt"), item.getString("message"), item.getString("token"), item.getBoolean("test"),item.optString("language","en-IN"))
    }
  }
  @Synchronized fun write(context: Context, records: List<AlarmRecord>) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secret())
    val data = JSONArray().apply { records.forEach { put(it.json()) } }.toString().toByteArray(Charsets.UTF_8)
    val atomic = file(context)
    val stream = atomic.startWrite()
    try { stream.write(cipher.iv + cipher.doFinal(data)); atomic.finishWrite(stream) }
    catch (error: Exception) { atomic.failWrite(stream); throw error }
  }
  @Synchronized fun clear(context: Context) {
    file(context).delete()
    check(!file(context).baseFile.exists()) { "Could not clear cancelled alarms." }
  }
  @Synchronized fun take(context: Context, key: String, token: String): AlarmRecord? {
    if (!AlarmScheduler.enabled(context)) return null
    val all = read(context)
    val record = all.find { it.key == key && it.token == token } ?: return null
    if (!AlarmPolicy.fresh(record.dueAt, System.currentTimeMillis())) return null
    write(context, all.filterNot { it.key == key })
    return record
  }
}
