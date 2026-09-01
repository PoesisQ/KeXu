package com.poesis.kexu;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

final class SystemBars {
    private static final String PREFS = "kexu-appearance";
    private static final String DARK_KEY = "dark";
    private static final int LIGHT_SURFACE = Color.rgb(247, 243, 241);
    private static final int LIGHT_NAV = Color.rgb(250, 249, 245);
    private static final int DARK_SURFACE = Color.rgb(16, 21, 18);
    private static final int DARK_NAV = Color.rgb(17, 22, 19);

    private SystemBars() {}

    static boolean storedDark(Activity activity) {
        return activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE).getBoolean(DARK_KEY, false);
    }

    static void apply(Activity activity, boolean dark, boolean persist) {
        if (persist) activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE).edit().putBoolean(DARK_KEY, dark).apply();
        Window window = activity.getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, true);
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(dark ? DARK_SURFACE : LIGHT_SURFACE);
        window.setNavigationBarColor(dark ? DARK_NAV : LIGHT_NAV);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(dark ? DARK_NAV : LIGHT_NAV);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }
}
