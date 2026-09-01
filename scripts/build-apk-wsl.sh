#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLCHAIN_ENV="/home/poesis/tryout_DSHarness/dsh-remote/.runtime.env"

if [ -f "$TOOLCHAIN_ENV" ]; then
  # Machine-local path only; the file is never bundled into the app.
  source "$TOOLCHAIN_ENV"
fi

if [ -n "${DSH_REMOTE_ANDROID_TOOLCHAIN:-}" ]; then
  export JAVA_HOME="$DSH_REMOTE_ANDROID_TOOLCHAIN/jdk"
  export ANDROID_HOME="$DSH_REMOTE_ANDROID_TOOLCHAIN/sdk"
  GRADLE_BIN="$DSH_REMOTE_ANDROID_TOOLCHAIN/gradle-8.7/bin/gradle"
fi

if [ -z "${JAVA_HOME:-}" ] || [ -z "${ANDROID_HOME:-}" ]; then
  echo "缺少 Android 构建环境：请设置 JAVA_HOME 与 ANDROID_HOME。" >&2
  exit 1
fi

# Reuse the host's local proxy for any AndroidX artifact not present in cache.
export GRADLE_OPTS="${GRADLE_OPTS:-} -Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897"

# The machine already has the audited AGP 8.6.1 toolchain cached. Capacitor 7's
# generated library is source-compatible with it; align the nested buildscript
# so APK builds remain reproducible without downloading another AGP release.
CAPACITOR_BUILD="$PROJECT_ROOT/node_modules/@capacitor/android/capacitor/build.gradle"
if [ -f "$CAPACITOR_BUILD" ]; then
  sed -i "s/com.android.tools.build:gradle:8.7.2/com.android.tools.build:gradle:8.6.1/" "$CAPACITOR_BUILD"
fi
CORDOVA_BUILD="$PROJECT_ROOT/android/capacitor-cordova-android-plugins/build.gradle"
if [ -f "$CORDOVA_BUILD" ]; then
  sed -i "s/com.android.tools.build:gradle:8.7.2/com.android.tools.build:gradle:8.6.1/" "$CORDOVA_BUILD"
fi

cd "$PROJECT_ROOT/android"
if [ -x "${GRADLE_BIN:-}" ]; then
  "$GRADLE_BIN" --no-daemon assembleDebug
else
  ./gradlew --no-daemon assembleDebug
fi

mkdir -p "$PROJECT_ROOT/dist-apk"
APP_VERSION="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$PROJECT_ROOT/package.json" | head -n 1)"
APK_TARGET="$PROJECT_ROOT/dist-apk/KeXu-v${APP_VERSION:-dev}-debug.apk"
cp "$PROJECT_ROOT/android/app/build/outputs/apk/debug/app-debug.apk" "$APK_TARGET"
echo "APK: $APK_TARGET"
