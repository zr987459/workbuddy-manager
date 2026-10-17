package com.workbuddy.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.io.File
import java.io.FileOutputStream

class DaemonService : Service() {

    companion object {
        const val CHANNEL_ID = "wb_daemon_channel"
        const val NOTIF_ID = 8796
        @Volatile var isRunning = false
    }

    private var process: Process? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForegroundServiceNotification()
        startDaemon()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "WorkBuddy 后台服务",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "保持 WorkBuddy 核心网关在后台持续运行"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundServiceNotification() {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("WorkBuddy 网关运行中")
            .setContentText("点击返回移动端工作台")
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun startDaemon() {
        Thread {
            try {
                val binDir = File(filesDir, "bin").apply { mkdirs() }
                val authsDir = File(filesDir, "auths").apply { mkdirs() }
                val dataDir = File(filesDir, "data").apply { mkdirs() }
                val exeFile = File(binDir, "wb2api")
                val configFile = File(filesDir, "config.json")

                // 复制解压原生二进制
                if (!exeFile.exists() || exeFile.length() < 1000000L) {
                    assets.open("bin/wb2api").use { input ->
                        FileOutputStream(exeFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                    exeFile.setExecutable(true, false)
                }

                // 固化免密配置
                val configJson = """
                {
                  "listen": "127.0.0.1:7863",
                  "api_key": "",
                  "auth_dir": "${authsDir.absolutePath}",
                  "state_file": "${dataDir.absolutePath}/state.json",
                  "admin": { "enabled": true },
                  "global": { "enabled": true, "chat_base": "https://www.workbuddy.ai", "billing_base": "https://www.workbuddy.ai" },
                  "cooldown": { "soft_rate": "600s", "soft_rate_max": "2h" },
                  "schedule": { "checkin_hours": [9, 21], "checkin_enabled": true, "travel_enabled": false },
                  "pool": { "max_in_flight": 3, "max_in_flight_global": 2 }
                }
                """.trimIndent()
                configFile.writeText(configJson)

                // 启动引擎
                val pb = ProcessBuilder(exeFile.absolutePath, "-config", configFile.absolutePath)
                pb.directory(filesDir)
                process = pb.start()
                isRunning = true
                process?.waitFor()
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isRunning = false
            }
        }.start()
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            process?.destroy()
        } catch (ignored: Exception) {}
        isRunning = false
    }
}
