#!/usr/bin/env bash
set -euo pipefail

# Tap a UI element by exact visible text from the current screen.
tap_text() {
  local label="$1"
  local dump_local="/tmp/ui_${RANDOM}.xml"
  local bounds
  local x1 y1 x2 y2 x y

  adb shell uiautomator dump /sdcard/ui.xml >/dev/null
  adb pull /sdcard/ui.xml "$dump_local" >/dev/null

  bounds=$(grep -o "text=\"${label}\"[^>]*bounds=\"\\[[0-9,]*\\]\\[[0-9,]*\\]\"" "$dump_local" | head -n1 | sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/')
  rm -f "$dump_local"

  if [[ -z "$bounds" ]]; then
    echo "UI label not found: $label" >&2
    return 1
  fi

  read -r x1 y1 x2 y2 <<< "$bounds"
  x=$(((x1 + x2) / 2))
  y=$(((y1 + y2) / 2))
  adb shell input tap "$x" "$y" >/dev/null
}

set_first_seekbar_percent() {
  local dump_local="/tmp/ui_${RANDOM}.xml"
  local bounds
  local x1 y1 x2 y2 x y width

  adb shell uiautomator dump /sdcard/ui.xml >/dev/null
  adb pull /sdcard/ui.xml "$dump_local" >/dev/null

  bounds=$(grep -o 'class="[^"]*SeekBar"[^>]*bounds="\[[0-9,]*\]\[[0-9,]*\]"' "$dump_local" | head -n1 | sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/')
  rm -f "$dump_local"

  if [[ -z "$bounds" ]]; then
    echo "SeekBar not found on screen" >&2
    return 1
  fi

  read -r x1 y1 x2 y2 <<< "$bounds"
  width=$((x2 - x1))
  x=$((x1 + (width * 30 / 100)))
  y=$(((y1 + y2) / 2))
  adb shell input tap "$x" "$y" >/dev/null
}

# Configure keyboard preferences through app settings UI after install.
# Replace labels below with the exact on-screen text on your device.
configure_keyboard_preferences() {
  adb shell am start -n rkr.simplekeyboard.inputmethod/.latin.settings.SettingsActivity >/dev/null 2>&1 || true
  sleep 1
  tap_text "Preferences" || true
  tap_text "Show separate number row" || true
  tap_text "Show language switch key" || true
  tap_text "Show special characters" || true
  adb shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
  tap_text "Key press" || true
  tap_text "Sound on keypress" || true
  adb shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
  tap_text "Appearance" || true
  tap_text "Keyboard height" || true
  sleep 1
  set_first_seekbar_percent || true
  tap_text "OK" || true
  sleep 1
  adb shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
  adb shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
}

adb install -r keyboard.apk
sleep 9
adb shell ime enable rkr.simplekeyboard.inputmethod/.latin.LatinIME
adb shell ime set rkr.simplekeyboard.inputmethod/.latin.LatinIME
configure_keyboard_preferences;
adb shell pm disable-user --user 0 com.android.camera2
adb shell pm disable-user --user 0 com.android.cameraextensions
adb shell pm disable-user --user 0 com.google.android.tts
adb shell pm disable-user --user 0 com.google.android.apps.turbo
adb shell pm disable-user --user 0 com.android.emergency
adb shell pm disable-user --user 0 com.android.providers.calendar
adb shell pm disable-user --user 0 com.google.android.setupwizard
adb shell pm disable-user --user 0 com.android.printspooler
adb shell pm disable-user --user 0 com.android.wallpaper
adb shell pm disable-user --user 0 com.android.traceur
adb install -r freekiosk-v1.2.18.apk
sleep 9
adb shell settings put secure sysui_qs_tiles internet
adb shell pm uninstall -k --user 0 com.google.android.apps.books || true
adb shell pm uninstall -k --user 0 com.google.android.apps.photos || true
adb shell pm uninstall -k --user 0 com.google.android.apps.wellbeing || true
adb shell pm uninstall -k --user 0 com.google.android.gm || true
adb shell pm uninstall -k --user 0 com.google.android.inputmethod.latin || true
adb shell pm uninstall -k --user 0 com.google.android.apps.tachyon || true
adb shell pm uninstall -k --user 0 com.google.android.apps.youtube.music || true
adb shell pm uninstall -k --user 0 com.android.nfc || true
adb shell pm uninstall -k --user 0 com.android.calculator2 || true
adb shell pm uninstall -k --user 0 com.google.android.partnersetup || true
adb shell pm uninstall -k --user 0 com.google.android.apps.docs || true
adb shell pm uninstall -k --user 0 com.google.android.apps.kids.home || true
adb shell pm uninstall -k --user 0 com.google.android.googlequicksearchbox || true
adb shell pm uninstall -k --user 0 com.google.android.apps.safetyhub || true
adb shell pm uninstall -k --user 0 com.google.android.apps.youtube.kids || true
adb shell pm uninstall -k --user 0 com.android.vending || true
adb shell pm uninstall -k --user 0 com.google.android.apps.nbu.files || true
adb shell pm uninstall -k --user 0 com.google.android.videos || true
adb shell pm uninstall -k --user 0 com.google.android.calendar || true
adb shell pm uninstall -k --user 0 com.google.android.contacts || true
adb shell pm uninstall -k --user 0 com.google.android.keep || true
adb shell pm uninstall -k --user 0 com.android.chrome || true
adb shell pm uninstall -k --user 0 com.android.deskclock || true
adb shell pm uninstall -k --user 0 com.google.android.apps.adm || true
adb shell pm uninstall -k --user 0 com.google.android.apps.maps || true
adb shell pm uninstall -k --user 0 com.google.android.youtube || true
adb shell pm uninstall -k --user 0 com.google.android.gms.supervision || true
adb shell pm uninstall -k --user 0 com.android.soundrecorder || true
adb shell pm uninstall -k --user 0 com.google.android.apps.googleassistant || true
adb shell pm uninstall -k --user 0 com.google.android.overlay.gmsconfig.searchlauncherqs || true
adb shell pm uninstall -k --user 0 com.google.android.cellbroadcastreceiver || true
adb shell pm uninstall -k --user 0 com.google.android.cellbroadcastservice || true
adb shell appops set com.freekiosk SYSTEM_ALERT_WINDOW allow
adb shell appops set com.freekiosk WRITE_SETTINGS allow
adb shell appops set com.freekiosk GET_USAGE_STATS allow
adb shell pm grant com.freekiosk android.permission.SYSTEM_ALERT_WINDOW
adb shell dumpsys deviceidle whitelist +com.freekiosk
adb shell pm grant com.freekiosk android.permission.READ_EXTERNAL_STORAGE
adb shell pm grant com.freekiosk android.permission.WRITE_EXTERNAL_STORAGE
adb shell pm grant com.freekiosk android.permission.ACCESS_FINE_LOCATION
adb shell appops set com.freekiosk CAMERA ignore
adb shell appops set com.freekiosk RECORD_AUDIO ignore
adb shell appops set com.freekiosk RUN_IN_BACKGROUND allow
adb shell appops set com.freekiosk START_FOREGROUND allow
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver || true
adb shell am start -n com.freekiosk/.MainActivity \
  --es pin "3334" \
  --es url "https://judaschwartz.github.io/weather" \
  --ez kiosk_enabled true \
  --es auto_relaunch "true" \
  --ez auto_launch true \
  --ez auto_start true \
  --es brightness "0.85" \
  --ez overlay_button_visible false \
  --ez allow_power_button true \
  --es back_button_mode "immediate" \
  --ez allow_system_info false \
  --ez brightness_management_enabled true \
  --ez kiosk_keep_screen_on true \
  --es test_mode "false"
adb shell settings put global heads_up_notifications_enabled 0
adb shell settings put secure user_setup_complete 0
adb shell settings put secure status_bar_disabled 1
adb shell settings put global device_provisioned 1
adb shell settings put global webview_geolocation_api 1
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 1
adb shell wm user-rotation lock 1
adb shell settings put global user_switcher_enabled 0
adb shell settings put global add_users_when_locked 0
adb shell settings put system screen_brightness_mode 0
adb shell settings put system screen_brightness 215
adb shell settings put global low_power 1
adb shell settings put global low_power_trigger_level 100
adb shell settings put global stay_on_while_plugged_in 3
adb shell settings put global ota_disable_automatic_update 1
adb shell settings put global wifi_sleep_policy 2
adb shell settings put global wifi_scan_interval_ms 500000
adb shell svc bluetooth disable
adb shell settings put global mobile_data 0
adb shell svc data disable
adb shell settings put global app_restriction_enabled true
adb shell dumpsys deviceidle whitelist +com.freekiosk
adb shell settings put global master_sync_automatically 0
adb shell settings put global wifi_scan_always_enabled 0
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell setprop debug.atrace.tags.enableflags 0
adb shell setprop debug.force_rtl 0
adb shell settings put global max_phantom_processes 1
adb shell settings put global background_data 0
adb shell settings put global app_standby_enabled 0
adb shell settings put global bg_apps_limit 0
adb shell settings put global background_data 0
