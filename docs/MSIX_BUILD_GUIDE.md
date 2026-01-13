# MSIX Build Guide for Ovox

This guide covers building and testing the MSIX package for Microsoft Store submission.

## Prerequisites

### Required Software
- **Windows 10/11** (version 1809 or later)
- **Node.js** (v16 or later)
- **pnpm** package manager
- **Windows SDK** (for signing and testing)
  - Download from: https://developer.microsoft.com/windows/downloads/windows-sdk/

### Optional Tools
- **Windows App Certification Kit (WACK)** - Included with Windows SDK
- **Visual Studio** - For advanced debugging (optional)

## Building MSIX Package

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Build the Application

```bash
# Build both NSIS and MSIX packages
pnpm run electron:build

# Or build only (after manual compilation)
npx electron-builder --win appx
```

The MSIX package will be created in the `release/` directory.

### 3. Build Output

After successful build, you'll find:
- `release/Ovox-0.8.7.appx` - The MSIX package
- `release/win-unpacked/` - Unpacked application files

## Testing MSIX Package

### Installing for Testing

Before you can install the MSIX package, you need to trust the certificate:

#### Option 1: Self-Signed Certificate (Development)

1. **Generate a self-signed certificate** (if not already done by electron-builder):

```powershell
# Run PowerShell as Administrator
New-SelfSignedCertificate -Type Custom -Subject "CN=YourPublisher" `
  -KeyUsage DigitalSignature -FriendlyName "Ovox Test Certificate" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
```

2. **Export the certificate**:
   - Open `certmgr.msc`
   - Navigate to Personal > Certificates
   - Right-click your certificate > All Tasks > Export
   - Export without private key as .cer file

3. **Install to Trusted Root**:
   - Double-click the .cer file
   - Click "Install Certificate"
   - Select "Local Machine"
   - Place in "Trusted Root Certification Authorities"

4. **Install the MSIX**:

```powershell
Add-AppxPackage -Path ".\release\Ovox-0.8.7.appx"
```

#### Option 2: Developer Mode (Easier for Testing)

1. Enable Developer Mode:
   - Settings > Update & Security > For developers
   - Select "Developer mode"

2. Install the package:

```powershell
Add-AppxPackage -Path ".\release\Ovox-0.8.7.appx"
```

### Uninstalling Test Package

```powershell
Get-AppxPackage *Ovox* | Remove-AppxPackage
```

## Running Windows App Certification Kit (WACK)

WACK tests ensure your app meets Microsoft Store requirements.

### 1. Launch WACK

```powershell
# Open Windows App Cert Kit
"C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe"
```

### 2. Test Your Package

1. Select "Validate App Package"
2. Browse to your .appx file
3. Choose test categories (select all)
4. Run tests (takes 10-20 minutes)
5. Review results

### 3. Common Issues and Fixes

**Issue: "App doesn't meet security requirements"**
- Ensure all executables are signed
- Check that no prohibited APIs are used

**Issue: "Performance test failed"**
- Optimize app startup time
- Reduce memory usage during launch

**Issue: "Supported API test failed"**
- Review native module usage
- Ensure Windows 10 compatibility

## Verifying Native Modules

Your C++ audio loopback modules must work in the MSIX container:

### Test Checklist

1. **Install MSIX package**
2. **Launch Ovox**
3. **Test screen sharing with audio**:
   - Start a call
   - Share screen
   - Verify audio loopback works
   - Check `ApplicationLoopback.exe` is running in Task Manager
4. **Test process enumeration**:
   - Verify `ProcessList.exe` can list audio processes
   - Check permissions are correct

### Debugging Native Modules

If native modules fail:

1. **Check file paths**:
```javascript
// In Electron main process
const { app } = require('electron');
console.log('App path:', app.getAppPath());
console.log('Resources path:', process.resourcesPath);
```

2. **Verify executables are unpacked**:
   - Check `release/win-unpacked/resources/app.asar.unpacked/`
   - Ensure `ApplicationLoopback.exe` and `ProcessList.exe` are present

3. **Check MSIX container permissions**:
   - MSIX apps run in a container with restricted file system access
   - Verify `runFullTrust` capability is set in manifest

## Troubleshooting

### Build Fails

**Error: "Cannot find module 'electron-builder'"**
```bash
pnpm install --save-dev electron-builder
```

**Error: "Invalid publisher"**
- Update publisher info in `package.json` after getting real values from Partner Center

### Installation Fails

**Error: "The package could not be installed because the publisher is not trusted"**
- Install the certificate to Trusted Root (see above)
- Or enable Developer Mode

**Error: "Deployment failed with HRESULT: 0x80073CF3"**
- Uninstall existing version first
- Check Windows Event Viewer for details

### Runtime Issues

**App won't launch**
- Check Windows Event Viewer > Application logs
- Look for AppX deployment errors
- Verify all dependencies are included

**Native modules not working**
- Check `asarUnpack` configuration in package.json
- Verify file paths in code use `process.resourcesPath`
- Test with unpacked version first

## Next Steps

After successful local testing:

1. **Get real app identity** from Microsoft Partner Center
2. **Update package.json** with real publisher info
3. **Create proper visual assets** (see `build/appx-assets/README.md`)
4. **Pass WACK tests**
5. **Submit to Microsoft Store** (see STORE_SUBMISSION_GUIDE.md)

## Additional Resources

- [Microsoft MSIX Documentation](https://docs.microsoft.com/windows/msix/)
- [Electron Builder MSIX](https://www.electron.build/configuration/appx)
- [Windows App Certification Kit](https://docs.microsoft.com/windows/uwp/debug-test-perf/windows-app-certification-kit)
