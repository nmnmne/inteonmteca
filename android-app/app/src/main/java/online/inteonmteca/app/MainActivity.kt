package online.inteonmteca.app

import android.app.Activity
import android.os.Bundle
import android.view.Window
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestWindowFeature(Window.FEATURE_NO_TITLE)

        webView = WebView(this)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = true
            allowFileAccess = false
            allowContentAccess = false
            builtInZoomControls = false
            displayZoomControls = false
            userAgentString = "$userAgentString inteonmteca-android"
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return request.url.host != "inteonmteca.online"
            }
        }
        webView.webChromeClient = WebChromeClient()
        setContentView(webView)
        webView.loadUrl(SITE_URL)
    }

    @Deprecated("Deprecated in Android API 33; retained for older devices.")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val SITE_URL = "https://inteonmteca.online/"
    }
}
