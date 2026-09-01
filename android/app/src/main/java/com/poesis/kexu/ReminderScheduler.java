package com.poesis.kexu;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

public final class ReminderScheduler {
    public static final String CHANNEL_ID = "class_reminders";
    private static final String PREFS = "kexu_class_reminders";
    private static final String KEY_DATA = "scheduled";

    private ReminderScheduler() {}

    public static boolean canScheduleExact(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return manager != null && manager.canScheduleExactAlarms();
    }

    public static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "上课提醒", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("在上课前显示课程名称、倒计时与教室地址");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    public static int sync(Context context, String json) throws Exception {
        cancelStored(context);
        JSONArray reminders = new JSONArray(json == null ? "[]" : json);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_DATA, reminders.toString()).apply();
        createChannel(context);
        int count = 0;
        for (int index = 0; index < reminders.length(); index++) {
            JSONObject reminder = reminders.getJSONObject(index);
            if (schedule(context, reminder)) count++;
        }
        return count;
    }

    public static void rescheduleStored(Context context) {
        try {
            String json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_DATA, "[]");
            JSONArray reminders = new JSONArray(json);
            createChannel(context);
            for (int index = 0; index < reminders.length(); index++) schedule(context, reminders.getJSONObject(index));
        } catch (Exception ignored) {}
    }

    private static boolean schedule(Context context, JSONObject reminder) throws Exception {
        long notifyAt = reminder.getLong("notifyAt");
        if (notifyAt <= System.currentTimeMillis()) return false;
        Intent intent = new Intent(context, ClassReminderReceiver.class)
            .putExtra("id", reminder.getString("id"))
            .putExtra("title", reminder.optString("title", "课程提醒"))
            .putExtra("teacher", reminder.optString("teacher", "教师待定"))
            .putExtra("location", reminder.optString("location", "地点待定"))
            .putExtra("startClock", reminder.optString("startClock", ""))
            .putExtra("startAt", reminder.getLong("startAt"))
            .putExtra("leadMinutes", reminder.optInt("leadMinutes", 10));
        PendingIntent pending = PendingIntent.getBroadcast(context, requestCode(reminder.getString("id")), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, notifyAt, pending);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, notifyAt, pending);
        } else {
            manager.setExact(AlarmManager.RTC_WAKEUP, notifyAt, pending);
        }
        return true;
    }

    private static void cancelStored(Context context) {
        try {
            JSONArray previous = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_DATA, "[]"));
            AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (manager == null) return;
            for (int index = 0; index < previous.length(); index++) {
                String id = previous.getJSONObject(index).getString("id");
                Intent intent = new Intent(context, ClassReminderReceiver.class);
                PendingIntent pending = PendingIntent.getBroadcast(context, requestCode(id), intent, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
                if (pending != null) { manager.cancel(pending); pending.cancel(); }
            }
        } catch (Exception ignored) {}
    }

    private static int requestCode(String id) { return id.hashCode() & 0x7fffffff; }
}
