# MSIX Asset Generator Script
# This script converts the existing icon.ico to all required MSIX asset sizes

param(
    [string]$SourceIcon = "public\icon.ico",
    [string]$OutputDir = "build\appx-assets"
)

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    Write-Host "Created output directory: $OutputDir" -ForegroundColor Green
}

# Required asset sizes for MSIX
$assets = @(
    @{Name="Square44x44Logo.png"; Width=44; Height=44},
    @{Name="Square71x71Logo.png"; Width=71; Height=71},
    @{Name="Square150x150Logo.png"; Width=150; Height=150},
    @{Name="Square310x310Logo.png"; Width=310; Height=310},
    @{Name="Wide310x150Logo.png"; Width=310; Height=150},
    @{Name="StoreLogo.png"; Width=50; Height=50},
    @{Name="SplashScreen.png"; Width=620; Height=300}
)

Write-Host "Starting MSIX asset generation..." -ForegroundColor Cyan
Write-Host "Source: $SourceIcon" -ForegroundColor Yellow

# Check if source icon exists
if (-not (Test-Path $SourceIcon)) {
    Write-Host "ERROR: Source icon not found at $SourceIcon" -ForegroundColor Red
    exit 1
}

# Load System.Drawing assembly for image manipulation
Add-Type -AssemblyName System.Drawing

# Load the source icon
try {
    $sourceImage = [System.Drawing.Image]::FromFile((Resolve-Path $SourceIcon).Path)
    Write-Host "Loaded source icon: $($sourceImage.Width) x $($sourceImage.Height)" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to load icon" -ForegroundColor Red
    exit 1
}

# Generate each required asset
foreach ($asset in $assets) {
    $outputPath = Join-Path $OutputDir $asset.Name
    
    Write-Host "Generating $($asset.Name)..." -ForegroundColor Cyan
    
    try {
        # Create new bitmap with target size
        $bitmap = New-Object System.Drawing.Bitmap $asset.Width, $asset.Height
        
        # Create graphics object for high-quality resizing
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        
        # Draw resized image
        $graphics.DrawImage($sourceImage, 0, 0, $asset.Width, $asset.Height)
        
        # Save as PNG
        $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
        
        # Cleanup
        $graphics.Dispose()
        $bitmap.Dispose()
        
        Write-Host "  Created: $outputPath" -ForegroundColor Green
    } catch {
        Write-Host "  Failed to create $($asset.Name)" -ForegroundColor Red
    }
}

# Cleanup source image
$sourceImage.Dispose()

Write-Host ""
Write-Host "Asset generation complete!" -ForegroundColor Green
Write-Host "Generated assets in: $OutputDir" -ForegroundColor Yellow
Write-Host ""
Write-Host "You can now rebuild the MSIX package with:" -ForegroundColor Yellow
Write-Host "  pnpm run electron:build:msix" -ForegroundColor White
