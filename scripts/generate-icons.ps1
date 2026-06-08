Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sizes = @(16, 32, 48, 128)

function New-RoundedRectPath {
  param(
    [float] $X,
    [float] $Y,
    [float] $Width,
    [float] $Height,
    [float] $Radius
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2

  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  return $path
}

function Scale-Point {
  param([float] $X, [float] $Y, [float] $Scale)
  return [System.Drawing.PointF]::new($X * $Scale, $Y * $Scale)
}

foreach ($size in $sizes) {
  $scale = $size / 128
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $backgroundPath = New-RoundedRectPath -X (8 * $scale) -Y (8 * $scale) -Width (112 * $scale) -Height (112 * $scale) -Radius (28 * $scale)
    $backgroundBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      [System.Drawing.PointF]::new(20 * $scale, 14 * $scale),
      [System.Drawing.PointF]::new(108 * $scale, 116 * $scale),
      [System.Drawing.Color]::FromArgb(255, 0, 168, 137),
      [System.Drawing.Color]::FromArgb(255, 0, 111, 99)
    )
    $graphics.FillPath($backgroundBrush, $backgroundPath)

    $shadowPath = New-RoundedRectPath -X (38 * $scale) -Y (27 * $scale) -Width (59 * $scale) -Height (78 * $scale) -Radius (7 * $scale)
    $shadowMatrix = [System.Drawing.Drawing2D.Matrix]::new()
    $shadowMatrix.Translate(0, 5 * $scale)
    $shadowPath.Transform($shadowMatrix)
    $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(42, 0, 61, 54))
    $graphics.FillPath($shadowBrush, $shadowPath)

    $pagePath = New-RoundedRectPath -X (37 * $scale) -Y (21 * $scale) -Width (59 * $scale) -Height (82 * $scale) -Radius (7 * $scale)

    $pageBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      [System.Drawing.PointF]::new(43 * $scale, 24 * $scale),
      [System.Drawing.PointF]::new(86 * $scale, 101 * $scale),
      [System.Drawing.Color]::White,
      [System.Drawing.Color]::FromArgb(255, 238, 248, 246)
    )
    $graphics.FillPath($pageBrush, $pagePath)

    $foldBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 215, 239, 235))
    $foldPoints = @(
      (Scale-Point 76 21 $scale),
      (Scale-Point 76 36 $scale),
      (Scale-Point 82 42 $scale),
      (Scale-Point 96 42 $scale)
    )
    $graphics.FillPolygon($foldBrush, $foldPoints)

    $mutedPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 143, 189, 182), [Math]::Max(1.2, 5 * $scale))
    $mutedPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $mutedPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($mutedPen, 51 * $scale, 55 * $scale, 82 * $scale, 55 * $scale)

    if ($size -ge 32) {
      $lightPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 177, 212, 207), [Math]::Max(1.2, 5 * $scale))
      $lightPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
      $lightPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
      $graphics.DrawLine($lightPen, 51 * $scale, 69 * $scale, 76 * $scale, 69 * $scale)
      $lightPen.Dispose()
    }

    $accentPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 0, 131, 116), [Math]::Max(2, 9 * $scale))
    $accentPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $accentPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $accentPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawLine($accentPen, 66 * $scale, 51 * $scale, 66 * $scale, 78 * $scale)
    $graphics.DrawLines($accentPen, @(
      (Scale-Point 55 68 $scale),
      (Scale-Point 66 79 $scale),
      (Scale-Point 77 68 $scale)
    ))

    $trayPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 0, 131, 116), [Math]::Max(2, 8 * $scale))
    $trayPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $trayPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($trayPen, 51 * $scale, 91 * $scale, 81 * $scale, 91 * $scale)

    $outputPath = Join-Path $root "icon$size.png"
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Generated icon$size.png"
  } finally {
    if ($backgroundBrush) { $backgroundBrush.Dispose() }
    if ($backgroundPath) { $backgroundPath.Dispose() }
    if ($shadowBrush) { $shadowBrush.Dispose() }
    if ($shadowPath) { $shadowPath.Dispose() }
    if ($shadowMatrix) { $shadowMatrix.Dispose() }
    if ($pageBrush) { $pageBrush.Dispose() }
    if ($pagePath) { $pagePath.Dispose() }
    if ($foldBrush) { $foldBrush.Dispose() }
    if ($mutedPen) { $mutedPen.Dispose() }
    if ($accentPen) { $accentPen.Dispose() }
    if ($trayPen) { $trayPen.Dispose() }
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}
