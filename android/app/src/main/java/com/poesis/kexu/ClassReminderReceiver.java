package com.poesis.kexu;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public class ClassReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        ReminderScheduler.createChannel(context);
        String id = intent.getStringExtra("id");
        ReminderScheduler.recordTriggered(context, id);
        String title = intent.getStringExtra("title");
        String teacher = intent.getStringExtra("teacher");
        String location = intent.getStringExtra("location");
        String startClock = intent.getStringExtra("startClock");
        long startAt = intent.getLongExtra("startAt", System.currentTimeMillis() + 600_000);
        int leadMinutes = intent.getIntExtra("leadMinutes", 10);

        Intent openIntent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openApp = PendingIntent.getActivity(context, 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String safeLocation = location == null || location.isEmpty() ? "地点待定" : location;
        String safeTeacher = teacher == null || teacher.isEmpty() ? "教师待定" : teacher;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_schedule)
            .setContentTitle(leadMinutes + " 分钟后 · " + (title == null ? "课程" : title))
            .setContentText(startClock + " · " + safeLocation)
            .setStyle(new NotificationCompat.BigTextStyle().bigText("上课地点：" + safeLocation + "\n教师：" + safeTeacher))
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setWhen(startAt)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setOngoing(false)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setTimeoutAfter(Math.max(300_000, startAt - System.currentTimeMillis() + 300_000))
            .setContentIntent(openApp);

        try {
            NotificationManagerCompat.from(context).notify((id == null ? title : id).hashCode() & 0x7fffffff, builder.build());
        } catch (SecurityException ignored) {}
    }
}
