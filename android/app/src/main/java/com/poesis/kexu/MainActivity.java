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
    }
}
