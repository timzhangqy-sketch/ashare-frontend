$OutputName = [System.Uri]::UnescapeDataString('%E5%AD%90%E4%BB%BB%E5%8A%A102_%E6%80%BB%E7%BB%93%E5%BD%92%E6%A1%A3_Phase4_P1_Signals%E5%B7%A5%E4%BD%9C%E5%9F%9F%E6%89%BF%E6%8E%A5%E9%A1%B5%E6%B7%B1%E5%8C%96.docx')
$OutputPath = Join-Path 'D:\ashare-frontend' $OutputName
$ZipPath = 'D:\ashare-frontend\signals_phase4_p1_archive.zip'
$TempDir = 'D:\ashare-frontend\.docx_tmp_signals_p1'
$TextPath = 'D:\ashare-frontend\archives\signals_phase4_p1_archive.txt'
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-Utf8File([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, $Utf8)
}

function Escape-Xml([string]$Text) {
  $escaped = [System.Security.SecurityElement]::Escape($Text)
  if ($null -eq $escaped) { return '' }
  return $escaped
}

if (Test-Path -LiteralPath $TempDir) {
  Remove-Item -LiteralPath $TempDir -Recurse -Force
}

if (Test-Path -LiteralPath $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}

if (Test-Path -LiteralPath $OutputPath) {
  Remove-Item -LiteralPath $OutputPath -Force
}

New-Item -ItemType Directory -Path $TempDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $TempDir '_rels') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $TempDir 'word') | Out-Null

$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
'@
Write-Utf8File -Path (Join-Path $TempDir '[Content_Types].xml') -Content $contentTypes

$rels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'@
Write-Utf8File -Path (Join-Path $TempDir '_rels\.rels') -Content $rels

$lines = [System.IO.File]::ReadAllLines($TextPath, $Utf8)
$title = '子任务02_总结归档_Phase4_P1_Signals工作域承接页深化'

$paragraphs = foreach ($line in $lines) {
  if ($line -eq '') {
    '<w:p/>'
  } elseif ($line -eq $title) {
    "<w:p><w:r><w:rPr><w:b/><w:sz w:val='32'/></w:rPr><w:t>$(Escape-Xml $line)</w:t></w:r></w:p>"
  } elseif ($line -match '^[0-9]+\.' ) {
    "<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>$(Escape-Xml $line)</w:t></w:r></w:p>"
  } else {
    "<w:p><w:r><w:t xml:space='preserve'>$(Escape-Xml $line)</w:t></w:r></w:p>"
  }
}

$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
  <w:body>
    $($paragraphs -join "`n    ")
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"@
Write-Utf8File -Path (Join-Path $TempDir 'word\document.xml') -Content $documentXml

Compress-Archive -Path (Join-Path $TempDir '*') -DestinationPath $ZipPath -Force
[System.IO.File]::Move($ZipPath, $OutputPath)
Remove-Item -LiteralPath $TempDir -Recurse -Force
Write-Output $OutputPath
