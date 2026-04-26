# Manhattan Unlocked 🗽
**Hackathon project — Hunter Hacks**
*Team: Zainab S, Jocsan R, Anyssa Q, Eric G*

A gamified NYC tourist map. Start in the Financial District and unlock adjacent neighborhoods by uploading geotagged photos taken on-location.

---

## Project structure

```
manhattan-unlocked/
├── index.html           ← Landing page (parallax hero)
├── map.html             ← Main game map
├── script.js            ← Game logic + Firebase API calls
├── style.css            ← All styles (landing + map)
├── landingpage.js       ← Parallax scroll for landing page
├── locations.json       ← Points of interest per district
├── manhattan_districts.json  ← GeoJSON district boundaries
├── img/
│   └── manhattancity.jpg
├── public/js/
│   └── firebase-config.js   ← ⚠️ Fill in your Firebase credentials
├── app.py               ← Flask backend (photo validation + Firestore)
├── imageValidation.py   ← GPS EXIF extraction (Eric G)
└── demo_runner.py       ← Test runner
```

---

## How the game works

1. **FiDi (district 101) starts unlocked** — it's your origin.
2. Click a district on the map to see its local spots and challenge.
3. Upload a geotagged photo taken at that location.
4. The Flask backend (`app.py`) validates GPS EXIF metadata.
5. If approved → the district unlocks and its **adjacent** neighbors become available.
6. Goal: unlock all 12 Manhattan districts.

### Adjacency map
```
101 FiDi  →  102 (Greenwich/SoHo), 103 (LES)
102       →  101, 103, 104 (Chelsea)
103       →  101, 102, 106 (Turtle Bay)
104       →  102, 105 (Midtown)
105       →  104, 106, 107 (UWS), 108 (UES)
...and so on up to 112 (Washington Heights)
```

---

## Setup

### Frontend (no build step needed)
Open `index.html` in a browser — works offline in demo mode (photo validation is simulated).

### Backend (Python / Flask)
```bash
pip install flask flask-cors firebase-admin Pillow pillow-heif geopy
# Add your service-account.json from Firebase Console
python app.py
```

### Firebase
1. Create a project at https://console.firebase.google.com
2. Enable Firestore Database
3. Download `service-account.json` → place in project root
4. Fill in `public/js/firebase-config.js` with your web app credentials

---

## API endpoints (app.py)

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/spots` | List all spots from Firestore |
| POST   | `/spots` | Add a new spot |
| POST   | `/validate` | Validate photo GPS + unlock spot |
| GET    | `/districts/:uid` | Get a user's district unlock progress |

---

## Demo mode
If the Flask backend isn't running, `script.js` automatically falls back to demo mode — photo uploads are accepted without GPS validation so you can demo the UI flow.
