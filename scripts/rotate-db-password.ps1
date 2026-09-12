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

# ————— ٣. استخراج رابط الاتصال —————
# لا نشترط اسم متغيّر بعينه: Neon يغيّر التسمية بين نوافذ التنزيل.
# القاعدة: أول سطر قيمته تبدأ بـ postgres:// أو postgresql:// أياً كان اسمه.

function Get-CleanValue([string]$Raw) {
    $v = $Raw.Trim()
    # Neon قد يغلّف القيمة بعلامتي اقتباس — تُنزع قبل أي فحص.
    if ($v.Length -ge 2) {
        if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
            $v = $v.Substring(1, $v.Length - 2).Trim()
        }
    }
    return $v
}

$lines = Get-Content -LiteralPath $candidate.FullName -Encoding UTF8
$url = $null
$foundName = $null

foreach ($line in $lines) {
    $text = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($text)) { continue }
    if ($text.StartsWith('#')) { continue }

    # الرابط المجرّد بلا اسم يُفحص أولاً: معاملاته تحوي علامة = فتخدع محلّل «اسم=قيمة».
    $bare = Get-CleanValue $text
    if ($bare -match '^postgres(ql)?://') {
        $url = $bare
        $foundName = '(رابط مجرّد بلا اسم متغيّر)'
        break
    }

    # اسم المتغيّر مقيّد بحروف ويُبدأ بحرف أو شرطة سفلية، فلا يُلتقط رابط بالخطأ كأنه اسم.
    $eq = [regex]::Match($text, '^(?:export\s+)?(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<value>.*)$')
    if ($eq.Success) {
        $value = Get-CleanValue $eq.Groups['value'].Value
        if ($value -match '^postgres(ql)?://') {
            $url = $value
            $foundName = $eq.Groups['name'].Value
            break
        }
    }
}

if ($null -eq $url) {
    Stop-WithMessage "الملف «$($candidate.Name)» لا يحتوي على أي سطر قيمته رابط اتصال يبدأ بـ postgres:// أو postgresql://. في Neon اختر صيغة تعطي الرابط كاملاً (Connection string أو ملف .env فيه DATABASE_URL) — لا صيغة تفصل اسم المستخدم وكلمة المرور في حقلين."
}

# اسم الحقل فقط — لا قيمته.
Write-Host "الحقل المستعمل: $foundName" -ForegroundColor Cyan

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
if (-not ($url -match '^postgres(ql)?://')) {
    Stop-WithMessage 'القيمة المستخرجة لا تبدأ بـ postgres:// ولا بـ postgresql:// — لن أكتبها.'
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
