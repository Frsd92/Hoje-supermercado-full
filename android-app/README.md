# Hoje Supermercado Android

This is the Android Trusted Web Activity (TWA) project for the Hoje Supermercado store. It opens the PWA hosted at `https://www.hojesupermercado.com.br/index.html?source=pwa`.

- Android application ID: `br.com.hojesupermercado.app`
- Target and compile SDK: Android 16 (API 36)
- Push notification delegation is disabled until web push is implemented.

## Local debug build

Install JDK 17 and Android SDK API 36, then run from this directory:

```powershell
.\gradlew.bat assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`. This debug build is for local testing only and is signed with the Android debug key.

## Production release requirements

Deploy and validate the PWA before building a release. To hide the browser toolbar, publish `/.well-known/assetlinks.json` on the official domain with this application ID and the SHA-256 fingerprint of the certificate used by Google Play App Signing. The release must be signed with a protected upload key. Do not commit keystores, private keys, or passwords.
