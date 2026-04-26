const BACKEND_URL   = window.APP_CONFIG?.BACKEND_URL  || "YOUR_CLOUD_RUN_URL";
const MAPBOX_TOKEN  = window.APP_CONFIG?.MAPBOX_TOKEN || "";

const districtNames = {
    "101": "Financial District / Battery Park City",
    "102": "Greenwich Village / Soho",
    "103": "Lower East Side / Chinatown",
    "104": "Chelsea / Clinton",
    "105": "Midtown",
    "106": "Stuyvesant Town / Turtle Bay",
    "107": "Upper West Side",
    "108": "Upper East Side",
    "109": "Morningside Heights / Hamilton Heights",
    "110": "Central Harlem",
    "111": "East Harlem",
    "112": "Washington Heights / Inwood"
};

// ─── District data ────────────────────────────────────────────────────────────
const districtData = {
    "101": { name: "Financial District & Battery Park City", info: "The historic heart of NYC and home to Wall Street. Start your Manhattan journey here." },
    "102": { name: "Greenwich Village & SoHo",              info: "Famous for its jazz clubs, cafes, and Washington Square Park." },
    "103": { name: "Lower East Side & Chinatown",           info: "A vibrant area known for its nightlife, Jewish heritage, and rich immigrant culture." },
    "104": { name: "Chelsea & Clinton",                     info: "Home to the High Line and hundreds of art galleries." },
    "105": { name: "Midtown",                               info: "The bustling center of Manhattan, including Times Square and Rockefeller Center." },
    "106": { name: "Stuyvesant Town & Turtle Bay",          info: "A largely residential area near the United Nations headquarters." },
    "107": { name: "Upper West Side",                       info: "A cultural hub near Lincoln Center and the Museum of Natural History." },
    "108": { name: "Upper East Side",                       info: "Known for the Museum Mile, upscale shopping, and Carnegie Hill." },
    "109": { name: "Morningside Heights & Hamilton Heights", info: "Home to Columbia University and Riverside Park." },
    "110": { name: "Central Harlem",                        info: "The historic epicenter of African American culture and the Harlem Renaissance." },
    "111": { name: "East Harlem",                           info: "Also known as El Barrio, famous for its murals, street food, and Latino heritage." },
    "112": { name: "Washington Heights & Inwood",           info: "Home to The Met Cloisters and Highbridge Park — the northern frontier of Manhattan." },
    "164": { name: "Central Park",                          info: "NYC's great green escape. With miles of paths, meadows, and the reservoir, you can feel transported from the city entirely." },
};

function dName(id) { return districtData[String(id)]?.name || `District ${id}`; }

const MANHATTAN_CDS = ['101','102','103','104','105','106','107','108','109','110','111','112','164'];

// ─── Adjacency map ────────────────────────────────────────────────────────────
const adjacency = {
    "101": ["102", "103"],
    "102": ["103", "104"],
    "103": ["106"],
    "104": ["105"],
    "105": ["106", "107", "108"],
    "106": ["108"],
    "107": ["109"],
    "108": ["111"],
    "109": ["110"],
    "110": ["112"],
    "111": ["110"],
    "112": []
};

// ─── State ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = "manhattan_unlocked_state_v2";

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            return {
                unlockedDistricts:  Array.isArray(p.unlockedDistricts)  ? p.unlockedDistricts  : ["101"],
                completedDistricts: Array.isArray(p.completedDistricts) ? p.completedDistricts : [],
                visitCounts: (p.visitCounts && typeof p.visitCounts === 'object') ? p.visitCounts : {}
            };
        }
    } catch(e) {}
    return { unlockedDistricts: ["101"], completedDistricts: [], visitCounts: {} };
}

function saveState(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

let state = loadState();
let selectedDistrictId = null;

// ─── Firebase auth ────────────────────────────────────────────────────────────
let currentUid = null;
let allSpots = [];

try {
    firebase.auth().signInAnonymously().catch(err => console.warn("Auth error:", err));
    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) return;
        currentUid = user.uid;
        await loadSpots();
        await syncDistrictsFromBackend();
    });
} catch (err) {
    console.warn("Firebase not configured, running in demo mode.", err);
}

async function loadSpots() {
    try {
        const res = await fetch(`${BACKEND_URL}/spots`);
        allSpots = await res.json();
    } catch (err) {
        console.error("Failed to load spots:", err);
    }
}

async function syncDistrictsFromBackend() {
    try {
        const res = await fetch(`${BACKEND_URL}/districts/${currentUid}`);
        const backendDistricts = await res.json();
        Object.entries(backendDistricts).forEach(([districtName, info]) => {
            const id = Object.keys(districtNames).find(k => districtNames[k] === districtName);
            if (!id) return;
            if (!state.unlockedDistricts.includes(id) && (info.spotsUnlocked > 0 || info.districtUnlocked))
                state.unlockedDistricts.push(id);
            if (info.districtUnlocked && !state.completedDistricts.includes(id))
                state.completedDistricts.push(id);
            if (info.spotsUnlocked) state.visitCounts[id] = info.spotsUnlocked;
        });
        saveState(state);
        refreshAllLayers();
        updateCounter();
        updateStatsPanel();
    } catch (err) {
        console.error("Failed to sync districts:", err);
    }
}

// ─── Mapbox setup ─────────────────────────────────────────────────────────────
mapboxgl.accessToken = MAPBOX_TOKEN;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-73.9855, 40.7580],
    zoom: 12,
    pitch: 45,
    bearing: -10,
    maxBounds: [[-74.10, 40.65], [-73.85, 40.92]],
    minZoom: 11
});

map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');

// ─── Mapbox expression builders ───────────────────────────────────────────────

function isStartDistrict(id) {
    return id === '101' && !state.completedDistricts.length && !(state.visitCounts['101'] || 0);
}

function buildColorExpression() {
    const pairs = [];
    for (const id of MANHATTAN_CDS) {
        if (state.completedDistricts.includes(id))        pairs.push(id, '#4a7c59');
        else if (state.unlockedDistricts.includes(id))    pairs.push(id, isStartDistrict(id) ? '#c8972a' : '#76a889');
        else                                               pairs.push(id, '#3a3a4a');
    }
    return ['match', ['to-string', ['get', 'BoroCD']], ...pairs, '#3a3a4a'];
}

function buildHeightExpression() {
    const pairs = [];
    for (const id of MANHATTAN_CDS) {
        if (state.completedDistricts.includes(id))        pairs.push(id, 250);
        else if (state.unlockedDistricts.includes(id))    pairs.push(id, isStartDistrict(id) ? 180 : 120);
        else                                               pairs.push(id, 25);
    }
    return ['match', ['to-string', ['get', 'BoroCD']], ...pairs, 25];
}

function buildOutlineExpression() {
    const pairs = [];
    for (const id of MANHATTAN_CDS) {
        if (state.completedDistricts.includes(id))        pairs.push(id, '#2e5c3a');
        else if (state.unlockedDistricts.includes(id))    pairs.push(id, isStartDistrict(id) ? '#8a6218' : '#2e5c3a');
        else                                               pairs.push(id, '#222233');
    }
    return ['match', ['to-string', ['get', 'BoroCD']], ...pairs, '#222233'];
}

const CD_FILTER = ['in', ['to-string', ['get', 'BoroCD']], ['literal', MANHATTAN_CDS]];

// ─── Map load ─────────────────────────────────────────────────────────────────
map.on('load', () => {
    // Real 3D buildings behind the districts
    map.addLayer({
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
            'fill-extrusion-color': '#0f0f1a',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.65
        }
    });

    map.addSource('districts', { type: 'geojson', data: 'manhattan_districts.json' });

    // Colored 3D district blocks
    map.addLayer({
        id: 'districts-extrusion',
        type: 'fill-extrusion',
        source: 'districts',
        filter: CD_FILTER,
        paint: {
            'fill-extrusion-color':   buildColorExpression(),
            'fill-extrusion-height':  buildHeightExpression(),
            'fill-extrusion-base':    0,
            'fill-extrusion-opacity': 0.85
        }
    });

    // District borders
    map.addLayer({
        id: 'districts-outline',
        type: 'line',
        source: 'districts',
        filter: CD_FILTER,
        paint: {
            'line-color': buildOutlineExpression(),
            'line-width': 1.5
        }
    });

    // Invisible hover highlight layer — filter set dynamically on hover
    map.addLayer({
        id: 'districts-hover',
        type: 'fill-extrusion',
        source: 'districts',
        filter: ['==', ['to-string', ['get', 'BoroCD']], ''],
        paint: {
            'fill-extrusion-color':   '#ffffff',
            'fill-extrusion-height':  350,
            'fill-extrusion-opacity': 0.12
        }
    });

    map.on('mousemove',  'districts-extrusion', onDistrictHover);
    map.on('mouseleave', 'districts-extrusion', onDistrictLeave);
    map.on('click',      'districts-extrusion', onDistrictClick);

    updateCounter();
    updateStatsPanel();
    showDefaultPanel();
});

// ─── Map event handlers ───────────────────────────────────────────────────────
let hoveredId = null;

function onDistrictHover(e) {
    const id = String(e.features[0].properties.BoroCD);
    if (id === hoveredId) return;
    hoveredId = id;
    map.getCanvas().style.cursor = 'pointer';
    map.setFilter('districts-hover', ['==', ['to-string', ['get', 'BoroCD']], id]);

    if (!selectedDistrictId) {
        const entry = districtData[id] || {};
        if (entry.info) {
            document.getElementById('hover-preview-name').textContent = entry.name || `District ${id}`;
            document.getElementById('hover-preview-info').textContent = entry.info;
            document.getElementById('hover-preview').classList.remove('hidden');
        }
    }
}

function onDistrictLeave() {
    hoveredId = null;
    map.getCanvas().style.cursor = 'default';
    map.setFilter('districts-hover', ['==', ['to-string', ['get', 'BoroCD']], '']);
    document.getElementById('hover-preview').classList.add('hidden');
}

function onDistrictClick(e) {
    const id = String(e.features[0].properties.BoroCD);
    selectedDistrictId = id;
    map.flyTo({
        center: e.lngLat,
        zoom: Math.max(map.getZoom(), 13),
        pitch: 55,
        bearing: (Math.random() - 0.5) * 20,
        duration: 1000,
        essential: true
    });
    showSelectedPanel(id);
}

// ─── Layer refresh ────────────────────────────────────────────────────────────
function refreshAllLayers() {
    if (!map.getLayer('districts-extrusion')) return;
    map.setPaintProperty('districts-extrusion', 'fill-extrusion-color',  buildColorExpression());
    map.setPaintProperty('districts-extrusion', 'fill-extrusion-height', buildHeightExpression());
    map.setPaintProperty('districts-outline',   'line-color',            buildOutlineExpression());
}

// ─── Counter ──────────────────────────────────────────────────────────────────
function updateCounter() {
    const count = state.completedDistricts.length;
    const el = document.getElementById('counter-num');
    el.textContent = count;
    el.classList.remove('counter-pop');
    void el.offsetWidth;
    el.classList.add('counter-pop');
    document.getElementById('progress-fill').style.width = `${(count / 12) * 100}%`;
}

// ─── Stats panel ──────────────────────────────────────────────────────────────
function getNextTarget() {
    for (const id of state.unlockedDistricts) {
        if (!state.completedDistricts.includes(id)) return dName(id);
    }
    return state.completedDistricts.length >= 12 ? 'Manhattan conquered!' : 'Start at FiDi';
}

function updateStatsPanel() {
    const count = state.completedDistricts.length;
    const totalVisits = Object.values(state.visitCounts).reduce((a, b) => a + b, 0);
    document.getElementById('stat-pct').textContent    = `${Math.round(count / 12 * 100)}%`;
    document.getElementById('stat-count').textContent  = `${count} / 12`;
    document.getElementById('stat-visits').textContent = `${totalVisits}`;
    document.getElementById('stat-next').textContent   = getNextTarget();
}

// ─── Panel rendering ──────────────────────────────────────────────────────────
function showDefaultPanel() {
    document.getElementById('panel-default').classList.remove('hidden');
    document.getElementById('panel-selected').classList.add('hidden');
    document.getElementById('panel-congrats').classList.add('hidden');
    updateStatsPanel();
}

function showSelectedPanel(id) {
    document.getElementById('panel-default').classList.add('hidden');
    document.getElementById('panel-congrats').classList.add('hidden');
    document.getElementById('panel-selected').classList.remove('hidden');

    const sid = String(id);
    const entry = districtData[sid] || {};
    const name = entry.name || `District ${sid}`;
    const info = entry.info || '';
    const isUnlocked  = state.unlockedDistricts.includes(sid);
    const isCompleted = state.completedDistricts.includes(sid);
    const visits  = state.visitCounts[sid] || 0;
    const REQUIRED = 2;
    const TOTAL    = 3;

    const statusEl = document.getElementById('panel-status-label');
    if (isCompleted)      statusEl.textContent = "Completed ✓";
    else if (isUnlocked)  statusEl.textContent = "Unlocked — explore to complete";
    else                  statusEl.textContent = "Locked";

    document.getElementById('panel-district-name').textContent = name;

    const descEl = document.getElementById('panel-description');
    descEl.textContent = info;
    descEl.classList.toggle('hidden', !info);

    const pillsEl = document.getElementById('panel-visit-count');
    pillsEl.innerHTML = '';
    if (isUnlocked) {
        for (let i = 0; i < TOTAL; i++) {
            const pill = document.createElement('span');
            if (i < visits)        { pill.className = 'pill pill-done';   pill.textContent = `Visit ${i + 1} ✓`; }
            else if (i < REQUIRED) { pill.className = 'pill pill-needed'; pill.textContent = `Visit ${i + 1} needed`; }
            else                   { pill.className = 'pill pill-extra';  pill.textContent = `Visit ${i + 1} bonus`; }
            pillsEl.appendChild(pill);
        }
    }

    const bodyEl = document.getElementById('panel-body-text');
    if (!isUnlocked) {
        const unlockedBy = Object.entries(adjacency)
            .filter(([, targets]) => targets.includes(sid))
            .map(([src]) => dName(src));
        bodyEl.textContent = unlockedBy.length
            ? `Complete ${unlockedBy.join(" or ")} to unlock this district.`
            : "This district is not yet reachable.";
    } else if (isCompleted) {
        bodyEl.textContent = `You've fully explored ${name}. ${adjacency[sid]?.length ? "The districts it unlocked are now available." : "This is a final district!"}`;
    } else {
        const remaining = REQUIRED - visits;
        bodyEl.textContent = `Visit ${remaining} more location${remaining !== 1 ? 's' : ''} in ${name} to unlock adjacent districts. Upload a photo taken here to check in.`;
    }

    const uploadSection = document.getElementById('upload-section');
    if (isUnlocked && !isCompleted) {
        uploadSection.classList.remove('hidden');
        document.getElementById('file-chosen').classList.add('hidden');
        document.getElementById('file-chosen').textContent = '';
        document.getElementById('submit-btn').classList.add('hidden');
        document.getElementById('photo-upload').value = '';
    } else {
        uploadSection.classList.add('hidden');
    }
}

function showCongratsPanel(districtId, newlyUnlocked) {
    const sid  = String(districtId);
    const name = dName(sid);

    document.getElementById('panel-default').classList.add('hidden');
    document.getElementById('panel-selected').classList.add('hidden');
    document.getElementById('panel-congrats').classList.remove('hidden');

    document.getElementById('congrats-district').textContent = name;

    const unlockedNames = (newlyUnlocked || []).map(id => dName(id));
    let bodyText = `You've now explored ${name}!`;
    if (unlockedNames.length > 0) {
        bodyText += ` You've unlocked ${unlockedNames.length === 1
            ? unlockedNames[0]
            : unlockedNames.slice(0, -1).join(", ") + " and " + unlockedNames.at(-1)}.`;
    } else {
        bodyText += " Keep going — there's more of Manhattan to discover.";
    }
    document.getElementById('congrats-body').textContent = bodyText;

    const list = document.getElementById('congrats-unlocked-list');
    list.innerHTML = '';
    unlockedNames.forEach((uname, i) => {
        const chip = document.createElement('div');
        chip.className = 'unlock-chip';
        chip.style.animationDelay = `${i * 0.1}s`;
        chip.innerHTML = `<span class="unlock-chip-icon">🗺</span><span>${uname} is now open</span>`;
        list.appendChild(chip);
    });
    if (unlockedNames.length === 0) {
        const chip = document.createElement('div');
        chip.className = 'unlock-chip';
        chip.innerHTML = `<span class="unlock-chip-icon">⭐</span><span>All adjacent districts already open</span>`;
        list.appendChild(chip);
    }

    // Wire up the share button for this specific district
    document.getElementById('share-btn').onclick = () => shareUnlock(sid);
}

// ─── Check-in logic ───────────────────────────────────────────────────────────
async function handleCheckIn() {
    const file = document.getElementById('photo-upload').files[0];
    if (!file || !selectedDistrictId) return;

    const btn = document.getElementById('submit-btn');
    btn.textContent = "Verifying…";
    btn.disabled = true;

    let result;
    const sid = String(selectedDistrictId);

    if (currentUid && BACKEND_URL !== "YOUR_CLOUD_RUN_URL") {
        try {
            const formData = new FormData();
            formData.append("image", file);
            formData.append("spotId", sid);
            formData.append("uid", currentUid);
            const res = await fetch(`${BACKEND_URL}/validate`, { method: "POST", body: formData });
            result = await res.json();
        } catch (err) {
            alert("Error connecting to server.");
            console.error(err);
            btn.textContent = "Verify & Unlock";
            btn.disabled = false;
            return;
        }
    } else {
        await new Promise(r => setTimeout(r, 1200));
        result = { approved: true, message: "Check-in approved! (demo mode)" };
    }

    btn.textContent = "Verify & Unlock";
    btn.disabled = false;

    if (!result.approved) {
        alert(`Check-in denied: ${result.message}`);
        return;
    }

    if (!state.visitCounts[sid]) state.visitCounts[sid] = 0;
    state.visitCounts[sid]++;

    const REQUIRED = 2;
    let newlyUnlocked = [];

    if (state.visitCounts[sid] >= REQUIRED && !state.completedDistricts.includes(sid)) {
        state.completedDistricts.push(sid);
        (adjacency[sid] || []).forEach(adjId => {
            if (!state.unlockedDistricts.includes(adjId)) {
                state.unlockedDistricts.push(adjId);
                newlyUnlocked.push(adjId);
            }
        });
        saveState(state);
        refreshAllLayers();
        updateCounter();
        updateStatsPanel();
        showCongratsPanel(sid, newlyUnlocked);
    } else {
        saveState(state);
        showSelectedPanel(sid);
    }
}

// ─── Share card ───────────────────────────────────────────────────────────────
function generateShareCard(districtId) {
    const canvas  = document.createElement('canvas');
    canvas.width  = 600;
    canvas.height = 300;
    const ctx  = canvas.getContext('2d');
    const name = dName(districtId);
    const count = state.completedDistricts.length;

    // Background
    const grad = ctx.createLinearGradient(0, 0, 600, 300);
    grad.addColorStop(0, '#1a1a18');
    grad.addColorStop(1, '#252520');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 300);

    // Gold left accent bar
    ctx.fillStyle = '#c8972a';
    ctx.fillRect(0, 0, 5, 300);

    // App label
    ctx.fillStyle = '#c8972a';
    ctx.font = '600 11px monospace';
    ctx.fillText('MANHATTAN UNLOCKED', 28, 48);

    // District name
    ctx.fillStyle = '#f2efe8';
    ctx.font = 'bold 40px Georgia, serif';
    ctx.fillText(name, 28, 125);

    // "Explored" badge
    ctx.fillStyle = '#2e5c3a';
    ctx.beginPath();
    ctx.roundRect(28, 148, 115, 28, 4);
    ctx.fill();
    ctx.fillStyle = '#a3cfb0';
    ctx.font = '600 11px monospace';
    ctx.fillText('✓  EXPLORED', 42, 167);

    // Progress text
    ctx.fillStyle = '#888882';
    ctx.font = '13px monospace';
    ctx.fillText(`${count} of 12 Manhattan districts explored`, 28, 222);

    // Progress bar track
    ctx.fillStyle = '#2e2e2a';
    ctx.beginPath();
    ctx.roundRect(28, 238, 544, 5, 3);
    ctx.fill();

    // Progress bar fill
    ctx.fillStyle = '#c8972a';
    ctx.beginPath();
    ctx.roundRect(28, 238, Math.round(544 * count / 12), 5, 3);
    ctx.fill();

    // Percentage label
    ctx.fillStyle = '#c8972a';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(count / 12 * 100)}%`, 572, 250);
    ctx.textAlign = 'left';

    return canvas;
}

async function shareUnlock(districtId) {
    const canvas = generateShareCard(districtId);
    canvas.toBlob(async (blob) => {
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            showToast('Card copied to clipboard!');
        } catch {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `manhattan-unlocked-${districtId}.png`;
            a.click();
            showToast('Card downloaded!');
        }
    }, 'image/png');
}

function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('toast-show');
    setTimeout(() => toast.classList.remove('toast-show'), 2500);
}

// ─── UI events ────────────────────────────────────────────────────────────────
document.getElementById('photo-upload').addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        document.getElementById('file-chosen').textContent = `📎 ${file.name}`;
        document.getElementById('file-chosen').classList.remove('hidden');
        document.getElementById('submit-btn').classList.remove('hidden');
    }
});

document.getElementById('submit-btn').addEventListener('click', handleCheckIn);

document.getElementById('congrats-continue-btn').addEventListener('click', () => {
    showSelectedPanel(selectedDistrictId);
});
