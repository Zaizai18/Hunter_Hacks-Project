const BACKEND_URL = "YOUR_CLOUD_RUN_URL"; // e.g. https://manhattan-unlocked-xyz.run.app

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

// ─── District data (name + description) ──────────────────────────────────────
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

// ─── Adjacency map ────────────────────────────────────────────────────────────
const adjacency = {
    "101": ["102", "103"],          // FiDi → Greenwich/SoHo, LES/Chinatown
    "102": ["103", "104"],          // Greenwich → LES, Chelsea
    "103": ["106"],                 // LES → Stuyvesant/Turtle Bay
    "104": ["105"],                 // Chelsea → Midtown
    "105": ["106", "107", "108"],   // Midtown → Stuyvesant, UWS, UES
    "106": ["108"],                 // Stuyvesant → UES
    "107": ["109"],                 // UWS → Morningside/Hamilton Heights
    "108": ["111"],                 // UES → East Harlem
    "109": ["110"],                 // Morningside → Central Harlem
    "110": ["112"],                 // Central Harlem → Washington Heights
    "111": ["110"],                 // East Harlem → Central Harlem
    "112": []                       // Washington Heights — final district
};

// ─── State ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = "manhattan_unlocked_state_v2";

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                unlockedDistricts: Array.isArray(parsed.unlockedDistricts) ? parsed.unlockedDistricts : ["101"],
                completedDistricts: Array.isArray(parsed.completedDistricts) ? parsed.completedDistricts : [],
                visitCounts: (parsed.visitCounts && typeof parsed.visitCounts === 'object') ? parsed.visitCounts : {}
            };
        }
    } catch(e) {}
    return {
        unlockedDistricts: ["101"],
        completedDistricts: [],
        visitCounts: {}
    };
}

function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();
let geojsonLayer;
let layerMap = {};         // BoroCD → Leaflet layer
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
        // Merge backend district state into local state
        Object.entries(backendDistricts).forEach(([districtName, info]) => {
            const id = Object.keys(districtNames).find(k => districtNames[k] === districtName);
            if (!id) return;
            if (!state.unlockedDistricts.includes(id) && (info.spotsUnlocked > 0 || info.districtUnlocked)) {
                state.unlockedDistricts.push(id);
            }
            if (info.districtUnlocked && !state.completedDistricts.includes(id)) {
                state.completedDistricts.push(id);
            }
            if (info.spotsUnlocked) state.visitCounts[id] = info.spotsUnlocked;
        });
        saveState(state);
        refreshAllLayers();
        updateCounter();
    } catch (err) {
        console.error("Failed to sync districts from backend:", err);
    }
}

// ─── Map setup ────────────────────────────────────────────────────────────────
const manhattanBounds = [[40.68, -74.05], [40.89, -73.88]];

const map = L.map('map', {
    maxBounds: [[40.68, -74.05], [40.89, -73.88]],
    maxBoundsViscosity: 1.0,
    minZoom: 12
}).setView([40.7580, -73.9855], 13);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_matter/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// ─── District style logic ─────────────────────────────────────────────────────

function getDistrictStyle(id) {
    const sid = String(id);
    if (state.completedDistricts.includes(sid)) {
        return { color: "#2e5c3a", weight: 2, fillColor: "#4a7c59", fillOpacity: 0.65 };
    }
    if (state.unlockedDistricts.includes(sid)) {
        if (sid === "101" && state.completedDistricts.length === 0 && (state.visitCounts["101"] || 0) === 0) {
            // Starting district, not yet visited — gold
            return { color: "#8a6218", weight: 2.5, fillColor: "#c8972a", fillOpacity: 0.55 };
        }
        return { color: "#2e5c3a", weight: 2, fillColor: "#76a889", fillOpacity: 0.45 };
    }
    return { color: "#8a867c", weight: 1, fillColor: "#b0aba0", fillOpacity: 0.5 };
}

function getHoverStyle(id) {
    const sid = String(id);
    const isLocked = !state.unlockedDistricts.includes(sid);
    if (isLocked) {
        return { weight: 2, color: "#8a867c", fillColor: "#999490", fillOpacity: 0.6 };
    }
    return { weight: 3, color: "#1a3a24", fillColor: "#3a6a49", fillOpacity: 0.8 };
}

// ─── Counter ──────────────────────────────────────────────────────────────────

function updateCounter() {
    const count = state.completedDistricts.length;
    const el = document.getElementById('counter-num');
    el.textContent = count;
    el.classList.remove('counter-pop');
    void el.offsetWidth; // reflow to restart animation
    el.classList.add('counter-pop');
    document.getElementById('progress-fill').style.width = `${(count / 12) * 100}%`;
}

// ─── Panel rendering ──────────────────────────────────────────────────────────

function showDefaultPanel() {
    document.getElementById('panel-default').classList.remove('hidden');
    document.getElementById('panel-selected').classList.add('hidden');
    document.getElementById('panel-congrats').classList.add('hidden');
}

function showSelectedPanel(id) {
    // Swap panel first so a state error never leaves the default panel stuck
    document.getElementById('panel-default').classList.add('hidden');
    document.getElementById('panel-congrats').classList.add('hidden');
    document.getElementById('panel-selected').classList.remove('hidden');

    const sid = String(id);
    const entry = districtData[sid] || {};
    const name = entry.name || `District ${sid}`;
    const info = entry.info || '';
    const isUnlocked = state.unlockedDistricts.includes(sid);
    const isCompleted = state.completedDistricts.includes(sid);
    const visits = state.visitCounts[sid] || 0;
    const REQUIRED = 2;
    const TOTAL = 3;

    const statusEl = document.getElementById('panel-status-label');
    if (isCompleted) statusEl.textContent = "Completed ✓";
    else if (isUnlocked) statusEl.textContent = "Unlocked — explore to complete";
    else statusEl.textContent = "Locked";

    document.getElementById('panel-district-name').textContent = name;

    const descEl = document.getElementById('panel-description');
    descEl.textContent = info;
    descEl.classList.toggle('hidden', !info);

    // Visit count pills
    const pillsEl = document.getElementById('panel-visit-count');
    pillsEl.innerHTML = '';
    if (isUnlocked) {
        for (let i = 0; i < TOTAL; i++) {
            const pill = document.createElement('span');
            if (i < visits) {
                pill.className = 'pill pill-done';
                pill.textContent = `Visit ${i + 1} ✓`;
            } else if (i < REQUIRED) {
                pill.className = 'pill pill-needed';
                pill.textContent = `Visit ${i + 1} needed`;
            } else {
                pill.className = 'pill pill-extra';
                pill.textContent = `Visit ${i + 1} bonus`;
            }
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
    const sid = String(districtId);
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
        // Use real Firebase backend
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
        // Demo mode — always approves after a short delay
        await new Promise(r => setTimeout(r, 1200));
        result = { approved: true, message: "Check-in approved! (demo mode)" };
    }

    btn.textContent = "Verify & Unlock";
    btn.disabled = false;

    if (!result.approved) {
        alert(`Check-in denied: ${result.message}`);
        return;
    }

    // Update local state
    if (!state.visitCounts[sid]) state.visitCounts[sid] = 0;
    state.visitCounts[sid]++;

    const REQUIRED = 2;
    let newlyUnlocked = [];

    if (state.visitCounts[sid] >= REQUIRED && !state.completedDistricts.includes(sid)) {
        state.completedDistricts.push(sid);
        const toUnlock = adjacency[sid] || [];
        toUnlock.forEach(adjId => {
            if (!state.unlockedDistricts.includes(adjId)) {
                state.unlockedDistricts.push(adjId);
                newlyUnlocked.push(adjId);
            }
        });
        saveState(state);
        refreshAllLayers();
        updateCounter();
        showCongratsPanel(sid, newlyUnlocked);
    } else {
        saveState(state);
        showSelectedPanel(sid);
    }
}

// ─── Layer management ─────────────────────────────────────────────────────────

function refreshAllLayers() {
    Object.entries(layerMap).forEach(([id, layer]) => {
        layer.setStyle(getDistrictStyle(id));
    });
}

// ─── Load GeoJSON ─────────────────────────────────────────────────────────────

fetch('manhattan_districts.json')
    .then(res => res.json())
    .then(data => {
        geojsonLayer = L.geoJSON(data, {
            filter: feature => String(feature.properties.BoroCD).startsWith('1'),
            style: feature => getDistrictStyle(feature.properties.BoroCD),
            onEachFeature: (feature, layer) => {
                const id = String(feature.properties.BoroCD);
                const entry = districtData[id] || {};
                const name = entry.name || `District ${id}`;
                layerMap[id] = layer;

                layer.bindTooltip(name, {
                    sticky: true,
                    direction: 'auto',
                    className: 'district-label'
                });

                layer.on({
                    mouseover(e) {
                        e.target.setStyle(getHoverStyle(id));
                        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                            e.target.bringToFront();
                        }
                        // Show description preview in default panel when nothing is selected
                        if (!selectedDistrictId && entry.info) {
                            const defaultPanel = document.getElementById('panel-default');
                            if (!defaultPanel.classList.contains('hidden')) {
                                document.getElementById('hover-preview-name').textContent = name;
                                document.getElementById('hover-preview-info').textContent = entry.info;
                                document.getElementById('hover-preview').classList.remove('hidden');
                            }
                        }
                    },
                    mouseout(e) {
                        e.target.setStyle(getDistrictStyle(id));
                        document.getElementById('hover-preview').classList.add('hidden');
                    },
                    click(e) {
                        map.fitBounds(e.target.getBounds(), { padding: [20, 20] });
                        selectedDistrictId = id;
                        showSelectedPanel(id);
                    }
                });
            }
        }).addTo(map);

        updateCounter();
    })
    .catch(err => console.error("Error loading GeoJSON:", err));

// ─── UI events ────────────────────────────────────────────────────────────────

document.getElementById('photo-upload').addEventListener('change', function() {
    const file = this.files[0];
    const fileChosen = document.getElementById('file-chosen');
    const submitBtn = document.getElementById('submit-btn');
    if (file) {
        fileChosen.textContent = `📎 ${file.name}`;
        fileChosen.classList.remove('hidden');
        submitBtn.classList.remove('hidden');
    }
});

document.getElementById('submit-btn').addEventListener('click', handleCheckIn);

document.getElementById('congrats-continue-btn').addEventListener('click', () => {
    showSelectedPanel(selectedDistrictId);
});

showDefaultPanel();
