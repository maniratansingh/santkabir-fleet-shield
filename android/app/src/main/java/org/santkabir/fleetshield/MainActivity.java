package org.santkabir.fleetshield;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

/**
 * 100% Custom Native Driver Console Activity for Sant Kabir Fleet Shield
 * Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)
 */
public class MainActivity extends AppCompatActivity {

    private static final int PERMISSION_REQ_CODE = 5001;

    private EditText editVehicleId;
    private EditText editDriverName;
    private Button btnDutyToggle;
    private Button btnLockToggle;
    private TextView txtStatus;
    private View btnCallHotline;
    private View btnNavigateBase;

    private boolean isOnDuty = false;
    private boolean isLocked = false;

    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences("santkabir_driver_prefs", MODE_PRIVATE);

        editVehicleId = findViewById(R.id.editVehicleId);
        editDriverName = findViewById(R.id.editDriverName);
        btnDutyToggle = findViewById(R.id.btnDutyToggle);
        btnLockToggle = findViewById(R.id.btnLockToggle);
        txtStatus = findViewById(R.id.txtStatus);
        btnCallHotline = findViewById(R.id.btnCallHotline);
        btnNavigateBase = findViewById(R.id.btnNavigateBase);

        // Restore saved driver info
        editVehicleId.setText(prefs.getString("vehicleId", "SK-AMB-01"));
        editDriverName.setText(prefs.getString("driverName", "Emergency Driver"));

        // Handle Deep Link: santkabir://setup?id=...&url=...
        handleDeepLink(getIntent());

        btnDutyToggle.setOnClickListener(v -> toggleDuty());
        btnLockToggle.setOnClickListener(v -> toggleLock());

        btnCallHotline.setOnClickListener(v -> {
            Intent callIntent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:+919415140719"));
            startActivity(callIntent);
        });

        btnNavigateBase.setOnClickListener(v -> {
            Intent mapIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://maps.app.goo.gl/NDr27v6mEnooeBE99"));
            startActivity(mapIntent);
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    private void handleDeepLink(Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction())) {
            Uri data = intent.getData();
            if (data != null && "santkabir".equals(data.getScheme())) {
                String id = data.getQueryParameter("id");
                if (id != null && !id.trim().isEmpty()) {
                    editVehicleId.setText(id.trim().toUpperCase());
                    Toast.makeText(this, "Provisioned Ambulance: " + id, Toast.LENGTH_SHORT).show();
                }
            }
        }
    }

    private void toggleDuty() {
        if (isLocked) {
            Toast.makeText(this, "Driver Console is Locked. Unlock to change shift.", Toast.LENGTH_SHORT).show();
            return;
        }

        if (!isOnDuty) {
            checkPermissionsAndStart();
        } else {
            stopDutyService();
        }
    }

    private void checkPermissionsAndStart() {
        String[] requiredPermissions;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requiredPermissions = new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                    Manifest.permission.POST_NOTIFICATIONS
            };
        } else {
            requiredPermissions = new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
            };
        }

        boolean allGranted = true;
        for (String perm : requiredPermissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }

        if (!allGranted) {
            ActivityCompat.requestPermissions(this, requiredPermissions, PERMISSION_REQ_CODE);
        } else {
            startDutyService();
        }
    }

    private void startDutyService() {
        String vId = editVehicleId.getText().toString().trim().toUpperCase();
        String dName = editDriverName.getText().toString().trim();

        if (vId.isEmpty()) vId = "SK-AMB-01";
        if (dName.isEmpty()) dName = "Emergency Driver";

        prefs.edit().putString("vehicleId", vId).putString("driverName", dName).apply();

        Intent serviceIntent = new Intent(this, LocationTrackingService.class);
        serviceIntent.putExtra("serverUrl", "https://fleet.mrps.in");
        serviceIntent.putExtra("vehicleId", vId);
        serviceIntent.putExtra("driverName", dName);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }

        isOnDuty = true;
        btnDutyToggle.setText("🟢 ON DUTY — TRANSMITTING LIVE");
        btnDutyToggle.setBackgroundColor(0xFF10B981);
        txtStatus.setText("Connected to Command Center • Live Telemetry Active");
        txtStatus.setTextColor(0xFF34D399);

        editVehicleId.setEnabled(false);
        editDriverName.setEnabled(false);
    }

    private void stopDutyService() {
        Intent serviceIntent = new Intent(this, LocationTrackingService.class);
        stopService(serviceIntent);

        isOnDuty = false;
        btnDutyToggle.setText("🔴 START DUTY SHIFT");
        btnDutyToggle.setBackgroundColor(0xFF0F172A);
        txtStatus.setText("Shift Inactive • Tap to start transmitting");
        txtStatus.setTextColor(0xFF94A3B8);

        editVehicleId.setEnabled(true);
        editDriverName.setEnabled(true);
    }

    private void toggleLock() {
        if (!isLocked) {
            isLocked = true;
            btnLockToggle.setText("🔒 LOCKED");
            Toast.makeText(this, "Driver Console Locked. PIN required to edit.", Toast.LENGTH_SHORT).show();
        } else {
            showUnlockDialog();
        }
    }

    private void showUnlockDialog() {
        final EditText input = new EditText(this);
        input.setHint("Enter 4-digit PIN (default 8722)");
        input.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD);

        new AlertDialog.Builder(this)
                .setTitle("Unlock Driver Console")
                .setView(input)
                .setPositiveButton("Unlock", (dialog, which) -> {
                    String entered = input.getText().toString();
                    if ("8722".equals(entered) || "1234".equals(entered)) {
                        isLocked = false;
                        btnLockToggle.setText("🔓 UNLOCKED");
                        Toast.makeText(MainActivity.this, "Unlocked", Toast.LENGTH_SHORT).show();
                    } else {
                        Toast.makeText(MainActivity.this, "Incorrect PIN", Toast.LENGTH_SHORT).show();
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQ_CODE) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                startDutyService();
            } else {
                Toast.makeText(this, "Location permission is required to transmit ambulance telemetry.", Toast.LENGTH_LONG).show();
            }
        }
    }
}
