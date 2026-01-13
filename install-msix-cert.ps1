# Create Self-Signed Certificate and Install MSIX
# Run this script as Administrator

Write-Host "MSIX Self-Signed Certificate Installer" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    pause
    exit 1
}

$publisher = "CN=A88C2469-F5AC-4051-8F73-1796F3C79FA2"
$certName = "Ovox MSIX Certificate"
$appxPath = "release\Ovox 0.8.7.appx"

Write-Host "Step 1: Creating self-signed certificate..." -ForegroundColor Cyan

try {
    # Create self-signed certificate
    $cert = New-SelfSignedCertificate -Type Custom `
        -Subject $publisher `
        -KeyUsage DigitalSignature `
        -FriendlyName $certName `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
    
    Write-Host "Certificate created successfully!" -ForegroundColor Green
    Write-Host "Thumbprint: $($cert.Thumbprint)" -ForegroundColor Yellow
    
} catch {
    Write-Host "Failed to create certificate: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 2: Exporting certificate..." -ForegroundColor Cyan

$certPath = "OvoxCertificate.cer"

try {
    Export-Certificate -Cert $cert -FilePath $certPath | Out-Null
    Write-Host "Certificate exported to: $certPath" -ForegroundColor Green
} catch {
    Write-Host "Failed to export certificate: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 3: Installing certificate to Trusted Root..." -ForegroundColor Cyan

try {
    # Import to Trusted Root Certification Authorities
    Import-Certificate -FilePath $certPath -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
    Write-Host "Certificate installed to Trusted Root!" -ForegroundColor Green
} catch {
    Write-Host "Failed to install certificate: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 4: Installing MSIX package..." -ForegroundColor Cyan

if (-not (Test-Path $appxPath)) {
    Write-Host "ERROR: MSIX package not found at: $appxPath" -ForegroundColor Red
    exit 1
}

try {
    # Remove old version if exists
    $existing = Get-AppxPackage | Where-Object { $_.Name -like "*Ovox*" }
    
    if ($existing) {
        Write-Host "Removing existing version..." -ForegroundColor Yellow
        $existing | Remove-AppxPackage
    }
    
    # Install new version
    Add-AppxPackage -Path $appxPath
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Installation successful!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now launch Ovox from the Start menu." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Certificate file saved at: $certPath" -ForegroundColor Cyan
    Write-Host "You can delete this file after installation." -ForegroundColor Cyan
    
} catch {
    Write-Host ""
    Write-Host "Installation failed!" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host ""
pause
