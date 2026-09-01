package com.poesis.kexu;

import android.Manifest;
import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "ClassReminders",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class ReminderPlugin extends Plugin {
    private boolean channelEnabled() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        NotificationChannel channel = manager == null ? null : manager.getNotificationChannel(ReminderScheduler.CHANNEL_ID);
        return channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    private JSObject status() {
        ReminderScheduler.createChannel(getContext());
        boolean notifications = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        boolean channelEnabled = channelEnabled();
        boolean backgroundRestricted = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ActivityManager manager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            backgroundRestricted = manager != null && manager.isBackgroundRestricted();
        }
        PowerManager powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean batteryOptimized = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && powerManager != null
            && !powerManager.isIgnoringBatteryOptimizations(getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("native", true);
        result.put("notifications", notifications);
        result.put("channelEnabled", channelEnabled);
        result.put("exactAlarms", ReminderScheduler.canScheduleExact(getContext()));
        result.put("backgroundRestricted", backgroundRestricted);
        result.put("batteryOptimized", batteryOptimized);
        result.put("count", ReminderScheduler.scheduledCount(getContext()));
        result.put("nextNotifyAt", ReminderScheduler.nextNotifyAt(getContext()));
        result.put("lastTriggeredAt", ReminderScheduler.lastTriggeredAt(getContext()));
        return result;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }
        requestExactAlarmAccess(call);
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        requestExactAlarmAccess(call);
    }

    private void requestExactAlarmAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !ReminderScheduler.canScheduleExact(getContext())) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
            } catch (Exception ignored) {}
        }
        call.resolve(status());
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("native", true);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("无法打开系统权限设置", exception);
        }
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("native", true);
            call.resolve(result);
        } catch (Exception exception) {
            openAppSettings(call);
        }
    }

    @PluginMethod
    public void sendTest(PluginCall call) {
        ReminderScheduler.createChannel(getContext());
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled() || !channelEnabled()) {
            call.reject("通知权限或“上课提醒”渠道尚未开启");
            return;
        }
        long now = System.currentTimeMillis();
        Intent intent = new Intent(getContext(), ClassReminderReceiver.class)
            .putExtra("id", "kexu-test-" + now)
            .putExtra("title", "KeXu 测试课程")
            .putExtra("teacher", "通知链路测试")
            .putExtra("location", "这里会显示完整上课地址")
            .putExtra("startClock", "10 分钟后")
            .putExtra("startAt", now + 600_000L)
            .putExtra("leadMinutes", 10);
        getContext().sendBroadcast(intent);
        JSObject result = status();
        result.put("delivered", true);
        call.resolve(result);
    }

    @PluginMethod
    public void sync(PluginCall call) {
        try {
            JSArray reminders = call.getArray("reminders");
            int count = ReminderScheduler.sync(getContext(), reminders == null ? "[]" : reminders.toString());
            JSObject result = new JSObject();
            result.put("native", true);
            result.put("count", count);
            result.put("exactAlarms", ReminderScheduler.canScheduleExact(getContext()));
            result.put("notifications", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
            result.put("nextNotifyAt", ReminderScheduler.nextNotifyAt(getContext()));
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("无法同步课程提醒", exception);
        }
    }
}
