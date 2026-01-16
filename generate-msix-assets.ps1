# MSIX Asset Generator Script
# This script converts the existing icon.ico to all required MSIX asset sizes
# Including all scales and targetsize variants required for Microsoft Store

param(
    [string]$SourceIcon = "public\icon.ico",
    [string]$OutputDir = "build\appx"
)

# Ensure output directory exists (using 'appx' as per electron-builder standard)
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    Write-Host "Created output directory: $OutputDir" -ForegroundColor Green
}

# Extensive list of asset sizes and variants for MSIX Store submission
# Using electron-builder naming conventions (SmallTile, LargeTile, etc.)
$assets = @(
    # Standard Assets
    @{Name="Square44x44Logo.png"; Width=44; Height=44},
    @{Name="SmallTile.png"; Width=71; Height=71},        # Required by electron-builder for 71x71
    @{Name="Square150x150Logo.png"; Width=150; Height=150},
    @{Name="LargeTile.png"; Width=310; Height=310},        # Required by electron-builder for 310x310
    @{Name="Wide310x150Logo.png"; Width=310; Height=150},
    @{Name="StoreLogo.png"; Width=50; Height=50},
    @{Name="SplashScreen.png"; Width=620; Height=300},

    # TargetSize variants (Required for Taskbar/App List/Certification)
    # Windows looks for these automatically if the base name exists
    @{Name="Square44x44Logo.targetsize-16.png"; Width=16; Height=16},
    @{Name="Square44x44Logo.targetsize-24.png"; Width=24; Height=24},
    @{Name="Square44x44Logo.targetsize-32.png"; Width=32; Height=32},
    @{Name="Square44x44Logo.targetsize-48.png"; Width=48; Height=48},
    @{Name="Square44x44Logo.targetsize-256.png"; Width=256; Height=256},

    # Altform-unplated variants (Essential for clean taskbar icons)
    @{Name="Square44x44Logo.altform-unplated_targetsize-16.png"; Width=16; Height=16},
    @{Name="Square44x44Logo.altform-unplated_targetsize-24.png"; Width=24; Height=24},
    @{Name="Square44x44Logo.altform-unplated_targetsize-32.png"; Width=32; Height=32},
    @{Name="Square44x44Logo.altform-unplated_targetsize-48.png"; Width=48; Height=48},
    @{Name="Square44x44Logo.altform-unplated_targetsize-256.png"; Width=256; Height=256},

    # Scale variants for different display densities
    @{Name="StoreLogo.scale-100.png"; Width=50; Height=50},
    @{Name="StoreLogo.scale-125.png"; Width=63; Height=63},
    @{Name="StoreLogo.scale-150.png"; Width=75; Height=75},
    @{Name="StoreLogo.scale-200.png"; Width=100; Height=100},
    @{Name="StoreLogo.scale-400.png"; Width=200; Height=200},

    @{Name="Square150x150Logo.scale-100.png"; Width=150; Height=150},
    @{Name="Square150x150Logo.scale-200.png"; Width=300; Height=300},
    @{Name="Square150x150Logo.scale-400.png"; Width=600; Height=600}
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
    Write-Host "ERROR: Failed to load icon. Make sure public\icon.ico exists." -ForegroundColor Red
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
