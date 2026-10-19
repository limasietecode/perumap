<#
  Cuts final_map.png into a zoom pyramid of 256x256 JPEG tiles (tiles/{z}/{x}/{y}.jpg)
  so the browser only downloads the part of the map that is on screen.

  Run it again only if final_map.png changes:
    powershell -ExecutionPolicy Bypass -File tools\make-tiles.ps1

  If the image size changes, update CONFIG.map (width, height, maxNativeZoom) in assets/js/config.js
  with the values printed at the end.
#>
param(
  [string]$Source = (Join-Path $PSScriptRoot "..\final_map.png"),
  [string]$OutDir = (Join-Path $PSScriptRoot "..\tiles"),
  [int]$TileSize = 256,
  [int]$Quality = 82,
  [string]$Background = "#F0EEF1"
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Source).Path)
$W = $src.Width; $H = $src.Height
$maxZoom = [int][Math]::Ceiling([Math]::Log([Math]::Max($W, $H) / $TileSize, 2))
$bg = [System.Drawing.ColorTranslator]::FromHtml($Background)

$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters 1
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)

# Avoids dark fringes at the image border when downscaling
$wrap = New-Object System.Drawing.Imaging.ImageAttributes
$wrap.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)

if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
$total = 0

for ($z = $maxZoom; $z -ge 0; $z--) {
  $scale = [Math]::Pow(2, $z - $maxZoom)
  $lw = [int][Math]::Ceiling($W * $scale)
  $lh = [int][Math]::Ceiling($H * $scale)

  if ($z -eq $maxZoom) {
    $level = $src
  } else {
    $level = New-Object System.Drawing.Bitmap $lw, $lh, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($level)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $lw, $lh), 0, 0, $W, $H, [System.Drawing.GraphicsUnit]::Pixel, $wrap)
    $g.Dispose()
  }

  $cols = [int][Math]::Ceiling($lw / $TileSize)
  $rows = [int][Math]::Ceiling($lh / $TileSize)
  for ($tx = 0; $tx -lt $cols; $tx++) {
    $dir = Join-Path $OutDir "$z\$tx"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    for ($ty = 0; $ty -lt $rows; $ty++) {
      [int]$sx = $tx * $TileSize
      [int]$sy = $ty * $TileSize
      [int]$cw = [Math]::Min($TileSize, $lw - $sx)
      [int]$ch = [Math]::Min($TileSize, $lh - $sy)
      $tile = New-Object System.Drawing.Bitmap $TileSize, $TileSize, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
      $tg = [System.Drawing.Graphics]::FromImage($tile)
      $tg.Clear($bg)
      $tg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $tg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $tg.DrawImage($level, (New-Object System.Drawing.Rectangle 0, 0, $cw, $ch), $sx, $sy, $cw, $ch, [System.Drawing.GraphicsUnit]::Pixel)
      $tg.Dispose()
      $tile.Save((Join-Path $dir "$ty.jpg"), $jpeg, $encParams)
      $tile.Dispose()
      $total++
    }
  }
  if ($z -ne $maxZoom) { $level.Dispose() }
  Write-Host ("zoom {0}: {1}x{2} tiles ({3}x{4} px)" -f $z, $cols, $rows, $lw, $lh)
}
$src.Dispose()

$bytes = (Get-ChildItem $OutDir -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host ("Done: {0} tiles, {1:N1} MB" -f $total, ($bytes / 1MB))
Write-Host "CONFIG.map -> width: $W, height: $H, tileSize: $TileSize, maxNativeZoom: $maxZoom"
