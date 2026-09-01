package com.poesis.kexu;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
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
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("native", true);
        result.put("notifications", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        result.put("exactAlarms", ReminderScheduler.canScheduleExact(getContext()));
        call.resolve(result);
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
        JSObject result = new JSObject();
        result.put("native", true);
        result.put("notifications", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        result.put("exactAlarms", ReminderScheduler.canScheduleExact(getContext()));
        call.resolve(result);
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
    public void sync(PluginCall call) {
        try {
            JSArray reminders = call.getArray("reminders");
            int count = ReminderScheduler.sync(getContext(), reminders == null ? "[]" : reminders.toString());
            JSObject result = new JSObject();
            result.put("native", true);
            result.put("count", count);
            result.put("exactAlarms", ReminderScheduler.canScheduleExact(getContext()));
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("无法同步课程提醒", exception);
        }
    }
}
