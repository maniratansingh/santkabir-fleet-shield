package org.santkabir.fleetshield;

import android.util.Log;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * 100% Custom Native Telemetry Network Client for Sant Kabir Fleet Shield
 * Transmits GPS telemetry packets directly to Cloudflare Pages server over HTTPS.
 * Zero external libraries or Traccar dependencies. Pure Android standard library.
 */
public class NetworkClient {

    private static final String TAG = "FleetShieldNet";

    public interface Callback {
        void onSuccess(int statusCode);
        void onError(Exception e);
    }

    public static void sendLocationPing(
            String serverUrl,
            String vehicleId,
            String driverName,
            double lat,
            double lon,
            float speedKmh,
            float bearing,
            double altitude,
            int batteryLevel,
            Callback callback
    ) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                // Ensure server URL has protocol
                String target = serverUrl.trim();
                if (!target.startsWith("http://") && !target.startsWith("https://")) {
                    target = "https://" + target;
                }

                // Construct query parameters (Standard OsmAnd / Traccar protocol)
                StringBuilder query = new StringBuilder();
                query.append("id=").append(URLEncoder.encode(vehicleId, "UTF-8"));
                query.append("&driver=").append(URLEncoder.encode(driverName, "UTF-8"));
                query.append("&lat=").append(lat);
                query.append("&lon=").append(lon);
                query.append("&speed=").append(speedKmh);
                query.append("&bearing=").append(bearing);
                query.append("&altitude=").append(altitude);
                query.append("&batt=").append(batteryLevel);
                query.append("&timestamp=").append(System.currentTimeMillis());

                String fullUrl = target.contains("?") ? target + "&" + query : target + "?" + query;

                URL url = new URL(fullUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                conn.setRequestProperty("User-Agent", "SantKabirFleetShield-NativeAndroid/1.0");

                // Empty body since parameters are in query (compatible with Traccar and Cloudflare Pages)
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(new byte[0]);
                    os.flush();
                }

                int responseCode = conn.getResponseCode();
                Log.d(TAG, "Telemetry dispatched to " + fullUrl + " -> HTTP " + responseCode);

                if (responseCode >= 200 && responseCode < 300) {
                    if (callback != null) callback.onSuccess(responseCode);
                } else {
                    if (callback != null) callback.onError(new Exception("HTTP " + responseCode));
                }
            } catch (Exception e) {
                Log.e(TAG, "Transmission failed: " + e.getMessage());
                if (callback != null) callback.onError(e);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }).start();
    }
}
