<#
    تبديل كلمة مرور قاعدة البيانات دون أن تمرّ القيمة بعينك ولا بحافظة مرئية.

    الاستعمال:
        1. من لوحة Neon اضغط Reset password ثم نزّل ملف الـ env.
        2. شغّل هذا السكربت:  powershell -ExecutionPolicy Bypass -File scripts\rotate-db-password.ps1
        3. الصق في Render (القيمة صارت في الحافظة) ثم أعد النشر.

    السكربت لا يطبع القيمة ولا أي جزء منها — يطبع طولها وعدد أسطر الملف فقط.
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Stop-WithMessage([string]$Message) {
    Write-Host ''
    Write-Host "توقّف: $Message" -ForegroundColor Red
    Write-Host 'لم يُكتب شيء ولم يُحذف شيء.' -ForegroundColor Red
    exit 1
}

# ————— ١. أين مجلد التنزيلات —————
# المسار يُقرأ من السجل لأن المستخدم قد يكون نقل المجلد عن مكانه الافتراضي.
$downloads = $null
try {
    $key = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders' -ErrorAction Stop
    $downloads = $key.'{374DE290-123F-4565-9164-39C4925E467B}'
} catch {
    $downloads = $null
}
if ([string]::IsNullOrWhiteSpace($downloads)) {
    $downloads = Join-Path $env:USERPROFILE 'Downloads'
}
if (-not (Test-Path -LiteralPath $downloads)) {
    Stop-WithMessage "لم أجد مجلد التنزيلات على المسار: $downloads"
}

# ————— ٢. أحدث ملف اسمه يطابق env —————
$candidate = Get-ChildItem -LiteralPath $downloads -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'env' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($null -eq $candidate) {
    Stop-WithMessage "لا يوجد في مجلد التنزيلات أي ملف اسمه يحتوي على env. نزّل ملف الـ env من نافذة Reset password في Neon ثم أعد المحاولة."
}

Write-Host "الملف المقروء: $($candidate.Name)  —  نُزّل في $($candidate.LastWriteTime)" -ForegroundColor Cyan

# ————— ٣. استخراج سطر DATABASE_URL —————
$downloaded = Get-Content -LiteralPath $candidate.FullName -Raw -Encoding UTF8
$match = [regex]::Match($downloaded, '(?m)^\s*(?:export\s+)?DATABASE_URL\s*=\s*(?<value>.+?)\s*$')
if (-not $match.Success) {
    Stop-WithMessage "الملف «$($candidate.Name)» لا يحتوي على سطر DATABASE_URL. تأكد أنك نزّلت ملف الـ env الصحيح."
}

$url = $match.Groups['value'].Value.Trim()
# Neon قد يغلّف القيمة بعلامتي اقتباس — تُنزع قبل أي شيء آخر.
if ($url.Length -ge 2) {
    if (($url.StartsWith('"') -and $url.EndsWith('"')) -or ($url.StartsWith("'") -and $url.EndsWith("'"))) {
        $url = $url.Substring(1, $url.Length - 2).Trim()
    }
}

# ————— ٤. حذف channel_binding —————
# node-postgres يرفض هذا المعامل، فوجوده يعني فشل كل اتصال.
$url = [regex]::Replace($url, '[?&]channel_binding=[^&]*', {
    param($m)
    # إن كان أول معامل في الرابط فالعلامة ؟ تبقى لما بعده، وإلا يُحذف المقطع كله.
    if ($m.Value.StartsWith('?')) { '?' } else { '' }
})
# لو كان channel_binding هو المعامل الوحيد بقيت ؟ معلّقة في آخر الرابط.
$url = $url -replace '\?$', ''
$url = $url -replace '\?&', '?'

# ————— ٥. التحقق قبل الكتابة —————
# لا يُكتب شيء قبل أن تثبت القيمة أنها رابط اتصال فعلي بطول معقول.
if (-not $url.StartsWith('postgresql://')) {
    Stop-WithMessage 'القيمة المستخرجة لا تبدأ بـ postgresql:// — لن أكتبها.'
}
if ($url.Length -lt 40 -or $url.Length -gt 600) {
    Stop-WithMessage "طول القيمة المستخرجة ($($url.Length) محرفاً) غير معقول لرابط اتصال — لن أكتبها."
}
if ($url -match '\s') {
    Stop-WithMessage 'القيمة المستخرجة تحتوي على مسافة — لن أكتبها.'
}
if ($url -match 'channel_binding') {
    Stop-WithMessage 'ما زال channel_binding موجوداً في القيمة بعد التنظيف — لن أكتبها.'
}

# ————— ٦. الكتابة فوق سطر DATABASE_URL وحده —————
$envPath = Join-Path $PSScriptRoot '..\apps\api\.env'
try {
    $envPath = (Resolve-Path -LiteralPath $envPath -ErrorAction Stop).Path
} catch {
    Stop-WithMessage 'لم أجد الملف apps\api\.env — شغّل السكربت من داخل المستودع.'
}

$before = Get-Content -LiteralPath $envPath -Raw -Encoding UTF8
$linePattern = '(?m)^(?<head>\s*(?:export\s+)?DATABASE_URL\s*=).*$'
$hits = [regex]::Matches($before, $linePattern)
if ($hits.Count -eq 0) {
    Stop-WithMessage 'الملف apps\api\.env لا يحتوي على سطر DATABASE_URL — لن أضيف سطراً لم يكن موجوداً.'
}
if ($hits.Count -gt 1) {
    Stop-WithMessage "الملف apps\api\.env يحتوي على $($hits.Count) أسطر DATABASE_URL — صحّحها يدوياً أولاً."
}

# MatchEvaluator لا MatchEvaluator-less: كلمة المرور قد تحتوي على $ فتُفسَّر كمرجع استبدال.
$after = [regex]::Replace($before, $linePattern, {
    param($m)
    $m.Groups['head'].Value + $url
})

$linesBefore = ([regex]::Matches($before, "`n")).Count
$linesAfter  = ([regex]::Matches($after,  "`n")).Count
if ($linesBefore -ne $linesAfter) {
    Stop-WithMessage 'عدد الأسطر تغيّر بعد الاستبدال — أوقفت العملية حفاظاً على الملف.'
}

# UTF8 بلا BOM: وجود BOM يفسد اسم أول متغيّر عند قراءة dotenv له.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, $after, $utf8NoBom)

# ————— ٧. الحافظة —————
try {
    Set-Clipboard -Value $url
    $clipboardOk = $true
} catch {
    $clipboardOk = $false
}

# ————— ٨. حذف الملف المنزَّل —————
$deleted = $false
try {
    Remove-Item -LiteralPath $candidate.FullName -Force -Confirm:$false -ErrorAction Stop
    $deleted = $true
} catch {
    $deleted = $false
}

# ————— ٩. التقرير: طول وعدد أسطر فقط —————
$finalLineCount = (Get-Content -LiteralPath $envPath -Encoding UTF8).Count

Write-Host ''
Write-Host 'تم التبديل.' -ForegroundColor Green
Write-Host "  طول رابط الاتصال : $($url.Length) محرفاً"
Write-Host "  أسطر apps\api\.env : $finalLineCount"
if ($clipboardOk) {
    Write-Host '  الحافظة           : القيمة جاهزة للّصق في Render' -ForegroundColor Green
} else {
    Write-Host '  الحافظة           : تعذّر النسخ — انسخ القيمة من apps\api\.env يدوياً' -ForegroundColor Yellow
}
if ($deleted) {
    Write-Host "  الملف المنزَّل      : حُذف من مجلد التنزيلات" -ForegroundColor Green
} else {
    Write-Host "  الملف المنزَّل      : تعذّر حذفه — احذف «$($candidate.Name)» يدوياً" -ForegroundColor Yellow
}
Write-Host ''
Write-Host 'الخطوة التالية: الصق القيمة في متغيّر DATABASE_URL في Render ثم أعد النشر.' -ForegroundColor Cyan
Write-Host 'وبعد اللصق: امسح الحافظة بنسخ أي نص آخر.' -ForegroundColor Cyan
