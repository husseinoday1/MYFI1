# Smart Capture

This project supports smart transaction intake from:

- receipt images
- voice recording
- pasted free text

## What works now

- users can pick a receipt image from camera or gallery
- users can record voice inside the add-transaction modal
- on web browsers that support SpeechRecognition, voice text can appear live while the user is still speaking, then gets replaced by the final server transcription after stop
- recognized or pasted text is parsed locally to infer amount, type, category, wallet, and date
- transactions now keep a lightweight `smartSource` marker so the app can show where the entry came from
- if no custom OCR or transcription URLs are provided, the app now falls back automatically to Supabase Edge Functions on the same project

## App environment variables

Set these in your local Expo environment:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=your_publishable_key
```

Optional overrides:

```env
EXPO_PUBLIC_OCR_URL=https://your-secure-ocr-endpoint
EXPO_PUBLIC_TRANSCRIBE_URL=https://your-secure-transcribe-endpoint
```

## Supabase function secrets

Set these on Supabase before deployment:

```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key
supabase secrets set OPENAI_VISION_MODEL=gpt-4.1-mini
supabase secrets set OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

Optional prompts:

```bash
supabase secrets set OPENAI_VISION_PROMPT="Custom receipt OCR prompt"
supabase secrets set OPENAI_TRANSCRIBE_PROMPT="Custom finance transcription prompt"
```

## Deploy the functions

```bash
supabase functions deploy smart-ocr
supabase functions deploy smart-transcribe
```

Or use the project helper:

```bash
npm run smart:capture:deploy
```

Before running it, set your OpenAI key in the same shell:

```powershell
$env:OPENAI_API_KEY="sk-..."
```

## Security note

This repository now sets both functions to `verify_jwt = true` in [supabase/config.toml](/C:/Users/nitro%20v15/Documents/MYFI/supabase/config.toml:1).

That means:

- the app user must be signed in before using receipt OCR or voice transcription
- the Expo client sends the current Supabase session token automatically when available
- anonymous callers can no longer consume your OpenAI-backed functions directly

If a user is not signed in, the app now shows a clear message asking them to sign in first.

If you want to run them locally:

```bash
npm run smart:capture:serve
```

## Expected API response

Each endpoint can return JSON with one of these fields:

- `text`
- `transcript`
- `result`
- `analysis`

Example:

```json
{
  "text": "Coffee 3000 IQD from cash",
  "analysis": {
    "merchant": "Coffee",
    "total": 3000,
    "currency": "IQD",
    "date": "",
    "preview": "Coffee 3000 IQD from cash"
  }
}
```

## Recommended next step

The mobile app already parses returned text locally into an editable draft. The best next step is to deploy the two functions above, then test one image receipt and one short Arabic voice note on a real device.
