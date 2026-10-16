package org.santkabir.fleetshield;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * 100% Custom Native Foreground Location Service
 * Runs continuously in background with wake lock and persistent notification.
 * Uses pure Android LocationManager (AOSP).
 */
public class LocationTrackingService extends Service implements LocationListener {

    private static final String TAG = "FleetShieldService";
    private static final String CHANNEL_ID = "santkabir_fleet_channel";
    private static final int NOTIFICATION_ID = 1001;

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;

    private String serverUrl = "https://fleet.mrps.in";
    private String vehicleId = "SK-AMB-01";
    private String driverName = "Emergency Driver";

    private Location lastLocation = null;
    private long lastTransmitTime = 0;
    private static final long MIN_INTERVAL_MS = 2500; // 2.5s

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SantKabir::LocationWakeLock");
            wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 hours
        }

        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            if (intent.hasExtra("serverUrl")) serverUrl = intent.getStringExtra("serverUrl");
            if (intent.hasExtra("vehicleId")) vehicleId = intent.getStringExtra("vehicleId");
            if (intent.hasExtra("driverName")) driverName = intent.getStringExtra("driverName");
        }

        Notification notification = buildNotification("Ambulance " + vehicleId + " Live on Duty");
        startForeground(NOTIFICATION_ID, notification);

        startLocationUpdates();

        return START_STICKY;
    }

    private void startLocationUpdates() {
        if (locationManager == null) return;
        try {
            // Request updates from GPS Provider (High Accuracy)
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        2000L, // 2 seconds
                        2.0f,  // 2 meters
                        this
                );
            }

            // Also fallback to Network Provider if GPS is indoors
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER,
                        3000L,
                        5.0f,
                        this
                );
            }
        } catch (SecurityException e) {
            Log.e(TAG, "Location permission not granted: " + e.getMessage());
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null) return;

        long now = System.currentTimeMillis();
        if (now - lastTransmitTime < MIN_INTERVAL_MS) return;
        lastTransmitTime = now;
        lastLocation = location;

        float speedKmh = 0f;
        if (location.hasSpeed()) {
            speedKmh = Math.round(location.getSpeed() * 3.6f);
        }

        float bearing = location.hasBearing() ? location.getBearing() : 0f;
        double altitude = location.hasAltitude() ? location.getAltitude() : 0.0;
        int battery = getBatteryPercentage();

        // Dispatch telemetry packet
        NetworkClient.sendLocationPing(
                serverUrl,
                vehicleId,
                driverName,
                location.getLatitude(),
                location.getLongitude(),
                speedKmh,
                bearing,
                altitude,
                battery,
                new NetworkClient.Callback() {
                    @Override
                    public void onSuccess(int statusCode) {
                        updateNotification("Broadcasting • " + (int)speedKmh + " km/h");
                    }

                    @Override
                    public void onError(Exception e) {
                        Log.w(TAG, "Network warning: " + e.getMessage());
                    }
                }
        );
    }

    private int getBatteryPercentage() {
        IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
        Intent batteryStatus = registerReceiver(null, ifilter);
        if (batteryStatus != null) {
            int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            if (level >= 0 && scale > 0) {
                return Math.round((level / (float) scale) * 100);
            }
        }
        return 100;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Ambulance GPS Telemetry",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Continuous real-time ambulance tracking service for Sant Kabir Hospital");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String contentText) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Sant Kabir Fleet Shield")
                .setContentText(contentText)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, buildNotification(text));
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (locationManager != null) {
            locationManager.removeUpdates(this);
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}
}
