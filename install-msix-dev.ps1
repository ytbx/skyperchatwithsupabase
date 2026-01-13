# Enable Developer Mode and Install MSIX

Write-Host "Checking Developer Mode status..." -ForegroundColor Cyan

# Check if Developer Mode is enabled
$devMode = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" -ErrorAction SilentlyContinue

if ($devMode.AllowDevelopmentWithoutDevLicense -eq 1) {
    Write-Host "Developer Mode is already enabled!" -ForegroundColor Green
} else {
    Write-Host "Developer Mode is NOT enabled." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To enable Developer Mode:" -ForegroundColor Cyan
    Write-Host "1. Open Settings (Win + I)" -ForegroundColor White
    Write-Host "2. Go to: Update & Security > For developers" -ForegroundColor White
    Write-Host "   (Windows 11: Privacy & security > For developers)" -ForegroundColor White
    Write-Host "3. Turn on 'Developer Mode'" -ForegroundColor White
    Write-Host ""
    
    $response = Read-Host "Have you enabled Developer Mode? (y/n)"
    if ($response -ne 'y') {
        Write-Host "Please enable Developer Mode first, then run this script again." -ForegroundColor Yellow
        exit
    }
}

Write-Host ""
Write-Host "Installing MSIX package..." -ForegroundColor Cyan

$appxPath = "release\Ovox 0.8.7.appx"

if (-not (Test-Path $appxPath)) {
    Write-Host "ERROR: MSIX package not found at: $appxPath" -ForegroundColor Red
    exit 1
}

try {
    # Remove old version if exists
    Write-Host "Checking for existing installation..." -ForegroundColor Yellow
    $existing = Get-AppxPackage | Where-Object { $_.Name -like "*Ovox*" }
    
    if ($existing) {
        Write-Host "Removing existing version..." -ForegroundColor Yellow
        $existing | Remove-AppxPackage
        Write-Host "Old version removed." -ForegroundColor Green
    }
    
    # Install new version
    Write-Host "Installing new version..." -ForegroundColor Cyan
    Add-AppxPackage -Path $appxPath
    
    Write-Host ""
    Write-Host "Installation successful!" -ForegroundColor Green
    Write-Host "You can now launch Ovox from the Start menu." -ForegroundColor Yellow
    
} catch {
    Write-Host ""
    Write-Host "Installation failed!" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "If you see certificate errors, try Option 2 (self-signed certificate)" -ForegroundColor Yellow
}
