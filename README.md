# AD-police-hackathon — ScamShield AI

Front end for **ScamShield AI** (Abu Dhabi Police × 42 Abu Dhabi): an investigator dashboard for spotting scam websites and fake Google Maps listings. English and Arabic (RTL).

## Screens
- **Scan**: paste a link and get a risk score, the reasons, screenshots and WHOIS/hosting facts.
- **Discovery**: a live feed of newly found scam sites and Maps listings.
- **Network**: a force-directed graph of scam clusters linked by shared IP, phone, registrar or template.
- **Reports**: investigation cases with English and Arabic AI summaries, evidence and export.

A **Demo** button in the header runs a ~35s guided walkthrough of all four screens.

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build to dist/
```

## Structure
- `src/data.ts`: all mock data and translations (swap for API calls later)
- `src/useDashboard.ts`: app state, scan flow, live feed, demo script
- `src/screens/*`: one component per screen
- `src/components/GraphView.tsx`: network graph simulation
- `src/styles.css`: design tokens and styles
