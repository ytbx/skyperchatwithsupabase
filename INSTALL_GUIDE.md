# MSIX Installation Guide

## Quick Install (Recommended)

### Step 1: Open PowerShell as Administrator
1. Press `Win + X`
2. Select "Windows PowerShell (Admin)" or "Terminal (Admin)"
3. Click "Yes" on UAC prompt

### Step 2: Run Installation Script
```powershell
cd C:\Users\yusuf\Desktop\skyperchat
.\install-msix-cert.ps1
```

The script will:
- ✅ Create self-signed certificate
- ✅ Install certificate to Trusted Root
- ✅ Remove old version (if exists)
- ✅ Install MSIX package

### Step 3: Launch Ovox
- Open Start Menu
- Search for "Ovox"
- Click to launch

---

## Troubleshooting

### "Execution Policy" Error
If you see: `cannot be loaded because running scripts is disabled`

Run this first:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Then run the install script again.

### "Not Running as Administrator" Error
- Close PowerShell
- Right-click PowerShell icon
- Select "Run as Administrator"
- Try again

### Installation Still Fails
Try Developer Mode method:
1. Settings > Privacy & security > For developers
2. Enable "Developer Mode"
3. Run: `.\install-msix-dev.ps1` (no admin needed)

---

## Uninstalling

To remove Ovox:
```powershell
Get-AppxPackage *Ovox* | Remove-AppxPackage
```

---

## Testing Checklist

After installation, test:
- [ ] App launches successfully
- [ ] Login/signup works
- [ ] Voice calls work
- [ ] **Screen sharing with audio** (critical!)
- [ ] Text messaging
- [ ] Voice channels

**Important**: Pay special attention to screen sharing - this uses your C++ native modules and must work correctly in the MSIX container.
