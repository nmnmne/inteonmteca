$ErrorActionPreference = 'Stop'
if ($env:GITHUB_EVENT_NAME -ne 'workflow_dispatch' -or $env:GITHUB_REF -ne 'refs/heads/main' -or !$env:SITE_RELEASE_ACCOUNT) {
  throw 'This publisher must run from main using the manual GitHub workflow.'
}
$current = Invoke-RestMethod "https://api.github.com/repos/$env:GITHUB_REPOSITORY/git/ref/heads/main"
if ($current.object.sha -ne $env:GITHUB_SHA) { throw 'Main has changed. Start a new release for the current commit.' }

$audience = [Uri]::EscapeDataString("https://github.com/$env:GITHUB_REPOSITORY")
$identity = Invoke-RestMethod "$($env:ACTIONS_ID_TOKEN_REQUEST_URL)&audience=$audience" -Headers @{
  Authorization = "Bearer $env:ACTIONS_ID_TOKEN_REQUEST_TOKEN"
}
Write-Host "::add-mask::$($identity.value)"
$iam = Invoke-RestMethod 'https://auth.yandex.cloud/oauth/token' -Method Post -Body @{
  grant_type = 'urn:ietf:params:oauth:grant-type:token-exchange'
  requested_token_type = 'urn:ietf:params:oauth:token-type:access_token'
  audience = $env:SITE_RELEASE_ACCOUNT
  subject_token = $identity.value
  subject_token_type = 'urn:ietf:params:oauth:token-type:id_token'
}
Write-Host "::add-mask::$($iam.access_token)"
$bucket = 'arn:aws:s3:::inteonmteca.online'
$sessionPolicy = @{Version='2012-10-17'; Statement=@(
  @{Effect='Allow'; Principal='*'; Action=@('s3:ListBucket','s3:GetBucketLocation'); Resource=$bucket},
  @{Effect='Allow'; Principal='*'; Action=@('s3:GetObject','s3:PutObject','s3:AbortMultipartUpload','s3:ListMultipartUploadParts'); Resource="$bucket/*"}
)} | ConvertTo-Json -Depth 5 -Compress
$credentials = Invoke-RestMethod 'https://iam.api.cloud.yandex.net/iam/aws-compatibility/v1/ephemeralAccessKeys' -Method Post `
  -Headers @{Authorization="Bearer $($iam.access_token)"} -ContentType 'application/json' `
  -Body (@{sessionName="github-$env:GITHUB_RUN_ID"; duration='1800s'; policy=$sessionPolicy} | ConvertTo-Json)
foreach ($secret in @($credentials.accessKeyId,$credentials.secret,$credentials.sessionToken)) {
  if (!$secret) { throw 'The short-lived storage credentials are incomplete.' }
  Write-Host "::add-mask::$secret"
}
$env:AWS_ACCESS_KEY_ID = $credentials.accessKeyId
$env:AWS_SECRET_ACCESS_KEY = $credentials.secret
$env:AWS_SESSION_TOKEN = $credentials.sessionToken
& (Join-Path $PSScriptRoot '../deploy-site.ps1') -WebOnly
