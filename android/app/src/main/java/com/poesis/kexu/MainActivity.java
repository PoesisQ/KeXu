package com.poesis.kexu;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(ReminderPlugin.class);
        registerPlugin(SystemAppearancePlugin.class);
        SystemBars.apply(this, SystemBars.storedDark(this), false);
        super.onCreate(savedInstanceState);
        SystemBars.apply(this, SystemBars.storedDark(this), false);
        syncSystemBarsFromWeb();
    }

    @Override
    public void onResume() {
        super.onResume();
        SystemBars.apply(this, SystemBars.storedDark(this), false);
        syncSystemBarsFromWeb();
    }

    private void syncSystemBarsFromWeb() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().postDelayed(() -> getBridge().getWebView().evaluateJavascript(
            "document.documentElement.dataset.theme || 'light'",
            value -> SystemBars.apply(this, "\"dark\"".equals(value), true)
        ), 300);
    }
}
