package com.poesis.kexu;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(ReminderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
