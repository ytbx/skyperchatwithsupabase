# MSIX Packaging - Quick Start

Ovox is now configured for Microsoft Store deployment via MSIX packaging.

## What's Been Configured

✅ **Build Configuration** - `package.json` updated with MSIX target  
✅ **App Manifest** - Windows app manifest with required capabilities  
✅ **Native Modules** - C++ executables configured for MSIX container  
✅ **Documentation** - Complete build and submission guides  

## Quick Build

```bash
# Build MSIX package only
pnpm run electron:build:msix

# Build both NSIS and MSIX
pnpm run electron:build
```

Output: `release/Ovox-0.8.7.appx`

## Next Steps

### 1. Create Visual Assets (Required)

Create PNG images in `build/appx-assets/`:
- Square44x44Logo.png (44x44px)
- Square71x71Logo.png (71x71px)
- Square150x150Logo.png (150x150px)
- Square310x310Logo.png (310x310px)
- Wide310x150Logo.png (310x150px)
- StoreLogo.png (50x50px)
- SplashScreen.png (620x300px)

See `build/appx-assets/README.md` for details.

### 2. Test Locally

```bash
# Build package
pnpm run electron:build:msix

# Install (requires Developer Mode or certificate)
Add-AppxPackage -Path ".\release\Ovox-0.8.7.appx"

# Test all features, especially screen sharing with audio
```

### 3. Get Microsoft Store Identity

1. Create Microsoft Partner Center account
2. Reserve app name "Ovox"
3. Get identity values (Package Name, Publisher ID)
4. Update `package.json` with real values:

```json
"appx": {
  "identityName": "12345YourPublisher.Ovox",  // Replace
  "publisher": "CN=12345678-...",  // Replace
  "publisherDisplayName": "Your Name"  // Replace
}
```

### 4. Run WACK Tests

```powershell
# Open Windows App Certification Kit
"C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe"
```

### 5. Submit to Store

Follow the complete guide in `docs/STORE_SUBMISSION_GUIDE.md`

## Important Notes

### Native C++ Modules

Your audio loopback executables are configured to work in MSIX:
- `ApplicationLoopback.exe` - System audio capture
- `ProcessList.exe` - Audio process enumeration

These are unpacked via `asarUnpack` configuration and will run with `runFullTrust` capability.

**⚠️ Critical**: Test screen sharing thoroughly after MSIX installation to ensure native modules work correctly in the container environment.

### Placeholder Values

Current configuration uses placeholder values:
- **identityName**: `YourPublisher.Ovox` → Replace with real value
- **publisher**: `CN=YourPublisher` → Replace with real value
- **publisherDisplayName**: `Your Publisher Name` → Replace with real name

These MUST be updated with real values from Microsoft Partner Center before Store submission.

### Privacy Policy Required

Your app needs a privacy policy because it:
- Accesses the internet
- Allows user communication
- Collects user data (via Supabase)

Create and host a privacy policy before submission.

## Documentation

- **Build Guide**: `docs/MSIX_BUILD_GUIDE.md` - Complete build and testing instructions
- **Submission Guide**: `docs/STORE_SUBMISSION_GUIDE.md` - Step-by-step Store submission
- **Asset Requirements**: `build/appx-assets/README.md` - Visual asset specifications

## Troubleshooting

### Build fails
- Ensure Windows SDK is installed
- Check `electron-builder` is in devDependencies
- Run `pnpm install` first

### Installation fails
- Enable Developer Mode in Windows Settings
- Or install certificate to Trusted Root (see build guide)

### Native modules don't work
- Check `asarUnpack` configuration in package.json
- Verify executables are in `resources/app.asar.unpacked/`
- Ensure `runFullTrust` capability is in manifest

## Support

For detailed information, see the comprehensive guides in the `docs/` directory.

Good luck with your Microsoft Store submission! 🚀
