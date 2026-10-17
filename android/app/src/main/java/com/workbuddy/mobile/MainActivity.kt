package com.workbuddy.mobile

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import java.net.Socket

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val handler = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 启动本地原生守护进程
        startService(Intent(this, DaemonService::class.java))

        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                allowFileAccessFromFileURLs = true
                allowUniversalAccessFromFileURLs = true
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                useWideViewPort = true
                loadWithOverviewMode = true
                cacheMode = WebSettings.LOAD_DEFAULT
            }
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?
                ): WebResourceResponse? {
                    val url = request?.url ?: return null
                    val host = url.host ?: ""
                    val path = url.path ?: ""

                    // 将 127.0.0.1:7863/m/* 路由精确拦截为本地 assets/web/* 静态资产
                    // 从而使前端与 127.0.0.1:7863 底层网关共享同一个 HTTP 域，彻底杜绝跨域与协议阻断
                    if (host == "127.0.0.1" && (path == "/" || path == "/m" || path.startsWith("/m/"))) {
                        val assetFile = when {
                            path == "/" || path == "/m" || path == "/m/" || path == "/m/index.html" -> "web/index.html"
                            path == "/m/style.css" -> "web/style.css"
                            path == "/m/app.js" -> "web/app.js"
                            path == "/m/manifest.json" -> "web/manifest.json"
                            else -> "web/" + path.removePrefix("/m/").removePrefix("/m")
                        }
                        val mime = when {
                            assetFile.endsWith(".html") -> "text/html"
                            assetFile.endsWith(".css") -> "text/css"
                            assetFile.endsWith(".js") -> "application/javascript"
                            assetFile.endsWith(".json") -> "application/json"
                            else -> "application/octet-stream"
                        }
                        return try {
                            val stream = assets.open(assetFile)
                            WebResourceResponse(mime, "utf-8", stream)
                        } catch (e: Exception) {
                            null
                        }
                    }

                    // 其它路径（如 /panel/api/、/v1/ 等）直接放行给 127.0.0.1:7863 处理
                    return null
                }

                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val url = request?.url?.toString() ?: return false
                    // 腾讯官方授权链接跳出到手机系统默认浏览器完成授权
                    if (url.startsWith("https://copilot.tencent.com") ||
                        url.startsWith("https://www.workbuddy.ai") ||
                        url.startsWith("https://oauth2")) {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
                        return true
                    }
                    return false
                }
            }
        }

        setContentView(webView)

        // 等待后台引擎就绪后载入同源界面
        waitForEngineAndLoad()
    }

    private fun waitForEngineAndLoad() {
        Thread {
            for (i in 1..25) {
                try {
                    val s = Socket("127.0.0.1", 7863)
                    s.close()
                    break
                } catch (e: Exception) {
                    Thread.sleep(200)
                }
            }
            handler.post {
                // 加载同源路由，让前端与后端处于完全相同的 HTTP 域中
                webView.loadUrl("http://127.0.0.1:7863/m/index.html")
            }
        }.start()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        webView.destroy()
    }
}
