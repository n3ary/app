# Getting Started

## Prerequisites
- Node.js 18+
- npm

## Setup

```bash
git clone <repository-url>
cd neary
npm install
npm run dev
```

Open `http://localhost:5175`. The setup wizard will guide you through API key and city selection.

## Verify

- App loads without errors
- Route data appears after setup wizard
- Live bus positions show (if API key configured)

## Tests

```bash
npm test             # Run all tests
npm run test:watch   # Watch mode
npm run test:ui      # Visual runner
```

## Production Build

```bash
npm run build        # Creates dist/
npm run preview      # Preview locally
```

## Mobile Testing

Visit `http://YOUR-IP:5175` on your phone. Add to home screen for PWA experience.

## Common Issues

| Problem | Fix |
|---------|-----|
| Port 5175 busy | `npm run dev -- --port 3000` |
| API key not working | Check key, verify network, check console |
| Tests failing | `rm -rf node_modules package-lock.json && npm install && npm test` |

## Next Steps

- [User Guide](user-guide.md) — how to use the app
- [Developer Guide](developer-guide.md) — technical details
- [Troubleshooting](troubleshooting/README.md) — fix problems
