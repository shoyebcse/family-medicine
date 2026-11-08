Set-StrictMode -Version Latest

$optionalDevelopmentSettings = @(
    'OPENAI_API_KEY', 'PRESCRIPTION_EXTRACTION_ENABLED', 'PRESCRIPTION_ENCRYPTION_KEY',
    'OPENAI_LOG_RESPONSES', 'PRESCRIPTION_EXTRACTION_MODE',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL', 'GOOGLE_WEB_RETURN_URL',
    'SMS_SIGN_IN_ENABLED', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'
)

function Get-DevelopmentEnvironment {
    param([Parameter(Mandatory)][string]$RepositoryRoot)

    $environmentFile = Join-Path $RepositoryRoot '.env'
    if (-not (Test-Path -LiteralPath $environmentFile)) {
        throw 'Create the gitignored root .env with DATABASE_PASSWORD and DEV_API_TOKEN first.'
    }

    $settings = @{}
    $names = @('DATABASE_PASSWORD', 'DATABASE_PORT', 'DEV_API_TOKEN') + $optionalDevelopmentSettings
    foreach ($line in Get-Content -LiteralPath $environmentFile) {
        if ($line -match '^\s*([A-Z][A-Z0-9_]*)=(.*)$' -and $Matches[1] -cin $names) {
            $settings[$Matches[1]] = $Matches[2].Trim()
        }
    }
    # Match Docker Compose precedence: shell values override the env file.
    foreach ($name in $names) {
        $override = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ($override) { $settings[$name] = $override }
    }
    if (-not $settings.ContainsKey('DATABASE_PASSWORD') -or -not $settings['DATABASE_PASSWORD']) {
        throw 'DATABASE_PASSWORD is missing from the local .env file.'
    }
    if (-not $settings.ContainsKey('DATABASE_PORT')) { $settings['DATABASE_PORT'] = '5432' }
    $port = 0
    if (-not [int]::TryParse($settings['DATABASE_PORT'], [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
        throw 'DATABASE_PORT must be an integer between 1 and 65535.'
    }
    return $settings
}

function Set-DevelopmentJavaHome {
    param([string]$JavaHome)

    if ($JavaHome) {
        if (-not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe'))) {
            throw 'The supplied JavaHome does not contain bin/java.exe.'
        }
        $env:JAVA_HOME = $JavaHome
    }
    if (-not (Get-Command mvn -ErrorAction SilentlyContinue)) {
        throw 'Maven must be installed and available on PATH.'
    }
}



