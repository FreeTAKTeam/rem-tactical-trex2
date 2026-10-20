import { RADAR_CONFIG_KEY } from "../common/radar/phoneClient.js";

AppSettingsPage({
  build(props) {
    let saved = {};
    try { saved = JSON.parse(props.settingsStorage.getItem(RADAR_CONFIG_KEY) || "{}"); } catch { /* Empty draft. */ }
    const draft = { enabled: saved.enabled === true, port: String(saved.port || 29863), token: saved.token || "" };
    return View({ style: { padding: "20px" } }, [
      Section({ title: "REM radar", description: "Pair with Watch Status Server in REM on this phone." }, [
        Text({ paragraph: true }, "Grant local-position and nearby-marker access in REM, enable radar, then copy its pairing code here. The code stays in Zepp on this phone and expires after eight hours."),
        Toggle({ label: "Connect radar", value: draft.enabled, onChange: (value) => { draft.enabled = value === true; } }),
        TextInput({ label: "REM server port", value: draft.port, onChange: (value) => { draft.port = value; } }),
        TextInput({ label: "Radar pairing code", value: "", placeholder: draft.token ? "Paired code saved; leave blank to keep" : "Paste code from REM", onChange: (value) => { if (value.trim()) draft.token = value.trim(); } }),
        Button({ label: "Save radar connection", onClick: () => {
          const port = Number(draft.port);
          if (!Number.isInteger(port) || port < 1024 || port > 65535 || (draft.enabled && !/^[a-f0-9]{64}$/.test(draft.token))) {
            props.settingsStorage.setItem("radarSettingsMessage", "Enter a port from 1024 to 65535 and the 64-character code from REM.");
            return;
          }
          props.settingsStorage.setItem(RADAR_CONFIG_KEY, JSON.stringify({ enabled: draft.enabled, port, token: draft.enabled ? draft.token : "" }));
          props.settingsStorage.setItem("radarSettingsMessage", draft.enabled ? "Saved. Open the radar on your watch." : "Radar disconnected and pairing code removed.");
        } }),
        Text({ paragraph: true }, props.settingsStorage.getItem("radarSettingsMessage") || "Radar is off until paired."),
      ]),
    ]);
  },
});
