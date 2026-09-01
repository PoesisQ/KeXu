package com.poesis.kexu;

import com.getcapacitor.BridgeActivity;

import android.view.View;
import android.view.Window;

import androidx.appcompat.app.ActionBar;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Do not rely on Theme.SplashScreen's post-theme hand-off here. Affected
        // OriginOS builds can retain its native title bar above the WebView.
        setTheme(R.style.AppTheme_NoActionBar);
        getWindow().requestFeature(Window.FEATURE_NO_TITLE);
        registerPlugin(ReminderPlugin.class);
        registerPlugin(SystemAppearancePlugin.class);
        super.onCreate(savedInstanceState);
        removeNativeActionBar();
        SystemBars.apply(this, SystemBars.storedDark(this), false);
        syncSystemBarsFromWeb();
    }

    @Override
    public void onResume() {
        super.onResume();
        removeNativeActionBar();
        SystemBars.apply(this, SystemBars.storedDark(this), false);
        syncSystemBarsFromWeb();
        // Returning from the exact-alarm or battery settings screen is not
        // guaranteed to emit a WebView visibility event on every OEM build.
        // Rebuild the saved schedule here so newly granted access takes effect.
        ReminderScheduler.rescheduleStored(this);
    }

    private void removeNativeActionBar() {
        ActionBar actionBar = getSupportActionBar();
        if (actionBar != null) actionBar.hide();

        // Defensive OEM fallback: hide an AppCompat action-bar container even if
        // the vendor framework created it despite the NoActionBar theme.
        View actionBarContainer = findViewById(androidx.appcompat.R.id.action_bar_container);
        if (actionBarContainer != null) actionBarContainer.setVisibility(View.GONE);
    }

    private void syncSystemBarsFromWeb() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().postDelayed(() -> getBridge().getWebView().evaluateJavascript(
            "document.documentElement.dataset.theme || 'light'",
            value -> SystemBars.apply(this, "\"dark\"".equals(value), true)
        ), 300);
    }
}
