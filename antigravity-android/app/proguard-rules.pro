# ─── Antigravity ProGuard / R8 rules ──────────────────────────────────────────
#
# 適用対象: release build のみ (debug は minify 無効)
# R8 full mode: proguard-android-optimize.txt で有効
# ──────────────────────────────────────────────────────────────────────────────

# ─── core-contract (data classes / enums) ─────────────────────────────────────
-keep class com.antigravity.contract.** { *; }

# ─── core-engine (pure JVM, FreshnessEvaluator 等) ────────────────────────────
-keep class com.antigravity.engine.** { *; }

# ─── Room entities & DAOs ──────────────────────────────────────────────────────
# Room は @Entity / @Dao をリフレクションで扱うため名前を保持
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao interface * { *; }
-keep class * extends androidx.room.RoomDatabase { *; }

# ─── WorkManager workers ───────────────────────────────────────────────────────
# WorkManager は Worker サブクラスをクラス名で生成する
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.CoroutineWorker { *; }
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}

# ─── Glance AppWidget ──────────────────────────────────────────────────────────
-keep class androidx.glance.** { *; }
-keep class * extends androidx.glance.appwidget.GlanceAppWidget { *; }
-keep class * extends androidx.glance.appwidget.GlanceAppWidgetReceiver { *; }

# ─── BroadcastReceiver (SyncNowReceiver) ──────────────────────────────────────
-keep class com.antigravity.app.worker.SyncNowReceiver { *; }

# ─── Notification / Activity (エントリポイント) ───────────────────────────────
-keep class com.antigravity.app.ui.MainActivity { *; }
-keep class com.antigravity.app.AntigravityApp { *; }

# ─── OkHttp / Okio (R8 compat) ────────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.internal.** { *; }

# ─── Kotlin coroutines ─────────────────────────────────────────────────────────
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}

# ─── Kotlin Metadata (リフレクション利用箇所向け) ─────────────────────────────
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# ─── デバッグ情報 (クラッシュレポート可読性) ─────────────────────────────────
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile
