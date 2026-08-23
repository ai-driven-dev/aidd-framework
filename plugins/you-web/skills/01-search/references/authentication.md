# Authentication Setup

## Getting a You.com API Key

1. Visit https://you.com/platform/api-keys?utm_source=aidd&utm_medium=plugin&utm_campaign=setup
2. Sign up or log in to your You.com account
3. Create a new API key for your AIDD usage
4. Copy the key (starts with `yk_...`)

## Setting Environment Variables

### Option 1: Shell Export (Temporary)
```bash
export YDC_API_KEY=yk_your_api_key_here
```

### Option 2: Profile File (Persistent)  
Add to `~/.bashrc`, `~/.zshrc`, or equivalent:
```bash
echo 'export YDC_API_KEY=yk_your_api_key_here' >> ~/.bashrc
source ~/.bashrc
```

### Option 3: Project .env File
Create `.env` in your project root:
```
YDC_API_KEY=yk_your_api_key_here
```

## Verification

Test your setup:
```bash
echo $YDC_API_KEY  # Should show your key
/you-web:01-search "test query"  # Should work with enhanced features
```

## Keyless Mode

If no API key is configured, the plugin automatically falls back to keyless mode with:
- Basic search functionality
- Rate-limited requests  
- Reduced feature set
- Perfect for testing and light usage

## Security Notes

- Never commit API keys to version control
- Use project-specific keys when possible
- Rotate keys periodically for security