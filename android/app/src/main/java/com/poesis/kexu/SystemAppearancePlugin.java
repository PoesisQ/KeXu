package com.poesis.kexu;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SystemAppearance")
public class SystemAppearancePlugin extends Plugin {
    @PluginMethod
    public void apply(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            SystemBars.apply(getActivity(), dark, true);
            JSObject result = new JSObject();
            result.put("dark", dark);
            call.resolve(result);
        });
    }
}
