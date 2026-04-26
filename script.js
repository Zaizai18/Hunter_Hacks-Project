// ============================================================
// Manhattan Unlocked — script.js
// Merged: frontend map/UI (zainab12am) + firebase backend (Project-firebase)
// ============================================================

// ── District metadata ────────────────────────────────────────
const districtData = {
    "101": { name: "Financial District",         info: "The historic heart of NYC and home to Wall Street and one of the highest-income work zones (finance, hedge funds, banking).",                         challenge: "Snap a photo at the Charging Bull or 9/11 Memorial." },
    "102": { name: "Greenwich Village / SoHo",   info: "Famous for its jazz clubs, cafes, and Washington Square Park. Among highest property values in NYC.",              challenge: "Find Washington Square Park's famous arch." },
    "103": { name: "Lower East Side",            info: "A vibrant area known for its nightlife and East River Park.",                challenge: "Visit Katz's Deli or the Tenement Museum." },
    "104": { name: "Chelsea / Clinton",          info: "Home to the High Line and hundreds of art galleries. Strong real estate tied to Hudson Yards.",                      challenge: "Walk the High Line and photograph the Hudson." },
    "105": { name: "Midtown",                    info: "The bustling center of Manhattan, including Times Square. Big economic engine of NYC!",                  challenge: "Capture Times Square's neon glow." },
    "106": { name: "Stuyvesant Town / Turtle Bay", info: "A largely residential area near the United Nations.",                    challenge: "Photograph the UN building from the riverside." },
    "107": { name: "Upper West Side",            info: "A cultural hub near Lincoln Center and the Museum of Natural History.",     challenge: "Visit the Rose Center for Earth and Space." },
    "108": { name: "Upper East Side",            info: "Known for the Museum Mile and upscale shopping. One of the wealthiest residential zones in the U.S.",                          challenge: "Walk along Museum Mile on Fifth Avenue." },
    "109": { name: "Morningside Heights",        info: "Anchored by institutions such as Columbia University and home to Riverside Park.",                          challenge: "Find the Cathedral of St. John the Divine." },
    "110": { name: "Central Harlem",             info: "The historic epicenter of African American culture.",                      challenge: "Visit the Apollo Theater marquee." },
    "111": { name: "East Harlem",                info: "Also known as El Barrio, famous for its murals and street food.",          challenge: "Find a famous mural in El Barrio." },
    "112": { name: "Washington Heights / Inwood", info: "Home to The Met Cloisters and Highbridge Park.",                         challenge: "Photograph the George Washington Bridge from above." },
};

// ── Adjacency graph (which districts border each other) ──────
// Starting point: 101 (FiDi). You can only unlock a district if
// you have already unlocked one of its neighbors.
const adjacency = {
    "101": ["102", "103"],
    "102": ["101", "103", "104"],
    "103": ["101", "102", "106"],
    "104": ["102", "105"],
    "105": ["104", "106", "107", "108"],
    "106": ["103", "105", "108"],
    "107": ["105", "109"],
    "108": ["105", "106", "110", "111"],
    "109": ["107", "110"],
    "110": ["108", "109", "111"],
    "111": ["108", "110", "112"],
    "112": ["109", "110", "111"],
};

// ── State ────────────────────────────────────────────────────
const UNLOCK_THRESHOLD = 3;           // spots needed to unlock a district
const START_DISTRICT   = "101";       // FiDi is always pre-unlocked

// Persisted in localStorage so progress survives page refresh
function loadState() {
    try {
        return JSON.parse(localStorage.getItem("manhattanState")) || {
            unlockedDistricts: [START_DISTRICT],  // districts fully unlocked
            spotCounts: {},                        // spotId -> unlock count (for this session)
            visitedSpots: [],                      // spot names checked in
        };
    } catch { return { unlockedDistricts: [START_DISTRICT], spotCounts: {}, visitedSpots: [] }; }
}

function saveState(state) {
    localStorage.setItem("manhattanState", JSON.stringify(state));
}

let gameState   = loadState();
let allLocations = [];
let geojson;
let selectedDistrictId = null;
let districtLayers     = {};  // id -> leaflet layer
let markerGroup;

// ── Firebase / Backend config ────────────────────────────────
// The Flask backend (app.py) is the source of truth for real
// validation. We fall back to a simulated local check when the
// backend isn't running (e.g., during local dev without Python).
const BACKEND_URL = "http://localhost:5000";  // change if deployed elsewhere

// Anonymous uid — in production swap for Firebase Auth uid
let uid = localStorage.getItem("uid");
if (!uid) { uid = "user_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("uid", uid); }

// ── Map setup ────────────────────────────────────────────────
const map = L.map("map", {
    maxBounds: [[40.68, -74.05], [40.89, -73.88]],
    maxBoundsViscosity: 1.0,
    minZoom: 12,
}).setView([40.76, -73.97], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

markerGroup = L.layerGroup().addTo(map);

// ── District coloring helpers ────────────────────────────────
function districtStatus(id) {
    if (gameState.unlockedDistricts.includes(id)) return "unlocked";
    if (id === START_DISTRICT)                    return "start";
    const neighbors = adjacency[id] || [];
    const reachable = neighbors.some(n => gameState.unlockedDistricts.includes(n));
    return reachable ? "available" : "locked";
}

function styleFor(id) {
    const status = districtStatus(id);
    const styles = {
        start:     { color: "#fff", weight: 2.5, fillColor: "#f5a623", fillOpacity: 0.85 },
        unlocked:  { color: "#fff", weight: 2.5, fillColor: "#27ae60", fillOpacity: 0.75 },
        available: { color: "#fff", weight: 2,   fillColor: "#85c1e9", fillOpacity: 0.55 },
        locked:    { color: "#ccc", weight: 1.5, fillColor: "#bdc3c7", fillOpacity: 0.35 },
    };
    return styles[status];
}

// ── Counter / progress bar ────────────────────────────────────
function updateCounter() {
    const count = gameState.unlockedDistricts.length;
    document.getElementById("counter-num").textContent  = count;
    document.getElementById("progress-fill").style.width = (count / 12 * 100) + "%";
}

// ── Restyle all districts ─────────────────────────────────────
function refreshMap() {
    Object.entries(districtLayers).forEach(([id, layer]) => {
        layer.setStyle(styleFor(id));
    });
    updateCounter();
}

// ── Panel helpers ─────────────────────────────────────────────
function showPanel(which) {
    ["panel-default", "panel-selected", "panel-congrats"].forEach(id => {
        document.getElementById(id).classList.add("hidden");
    });
    document.getElementById(which).classList.remove("hidden");
}

function resetUploadUI() {
    document.getElementById("photo-upload").value = "";
    document.getElementById("file-chosen").classList.add("hidden");
    document.getElementById("file-chosen").textContent = "";
    document.getElementById("submit-btn").classList.add("hidden");
    document.getElementById("validation-status").classList.add("hidden");
}

// ── Show hover preview ────────────────────────────────────────
function showHoverPreview(id) {
    const d = districtData[id] || { name: `District ${id}`, info: "" };
    const preview = document.getElementById("hover-preview");
    document.getElementById("hover-preview-name").textContent = d.name;
    document.getElementById("hover-preview-info").textContent = districtStatus(id) === "locked"
        ? "🔒 Unlock a neighboring district first."
        : d.info;
    preview.classList.remove("hidden");
}

// ── Click a district ─────────────────────────────────────────
function selectDistrict(id) {
    selectedDistrictId = id;
    const d      = districtData[id] || { name: `District ${id}`, info: "" };
    const status = districtStatus(id);

    document.getElementById("panel-district-name").textContent = d.name;
    document.getElementById("panel-description").textContent   = d.info;

    const statusLabels = { start: "Starting Point ✦", unlocked: "Unlocked ✓", available: "Available to Unlock", locked: "Locked 🔒" };
    document.getElementById("panel-status-label").textContent  = statusLabels[status];

    // Spots list
    const spotsList = document.getElementById("panel-spots-list");
    const localSpots = allLocations.filter(f => String(f.properties.BoroCD).trim() === id);

    markerGroup.clearLayers();
    let spotsHTML = localSpots.length
        ? `<div class="panel-eyebrow" style="margin-top:12px">Local spots</div><ul class="spots-list">`
        : `<p class="panel-body" style="opacity:.6">No locations recorded here yet.</p>`;

    localSpots.forEach(spot => {
        const [lng, lat] = spot.geometry.coordinates;
        const isVisited  = gameState.visitedSpots.includes(spot.properties.name);
        const iconHTML   = spot.properties.type === "Park"
            ? `<svg viewBox="0 0 24 24" width="40" height="40"><path d="M12 2L4.5 12h3V22h9V12h3L12 2z" fill="#b8d8be" stroke="#1e8449" stroke-width="1"/></svg>`
            : `<div style="font-size:28px;line-height:1">📍</div>`;
        const customIcon = L.divIcon({ html: iconHTML, className: "custom-svg-marker", iconSize: [40, 40], iconAnchor: [20, 20] });
        L.marker([lat, lng], { icon: customIcon })
            .bindPopup(`<strong>${spot.properties.name}</strong><br>${spot.properties.description}`)
            .addTo(markerGroup);
        if (localSpots.length)
            spotsHTML += `<li class="${isVisited ? "spot-visited" : ""}">${isVisited ? "✓ " : ""}<strong>${spot.properties.name}</strong><br><small>${spot.properties.description}</small></li>`;
    });
    if (localSpots.length) spotsHTML += "</ul>";
    spotsList.innerHTML = spotsHTML;

    // Upload section
    const uploadSection = document.getElementById("upload-section");
    if (status === "available" || status === "start") {
        uploadSection.classList.remove("hidden");
        document.querySelector(".upload-instruction").innerHTML =
            `<strong>Challenge:</strong> ${d.challenge || "Upload a photo taken at this district."}`;
        resetUploadUI();
    } else if (status === "unlocked") {
        uploadSection.classList.remove("hidden");
        document.querySelector(".upload-instruction").innerHTML =
            `<span style="color:#27ae60">✓ Unlocked!</span> You can still earn bonus spots here.`;
        resetUploadUI();
    } else {
        uploadSection.classList.add("hidden");
    }

    showPanel("panel-selected");
}

// ── Load GeoJSON layers ───────────────────────────────────────
fetch("locations.json")
    .then(r => r.json())
    .then(d => { allLocations = d.features || []; })
    .catch(e => console.error("locations.json load error:", e));

fetch("manhattan_districts.json")
    .then(r => r.json())
    .then(data => {
        geojson = L.geoJSON(data, {
            filter: f => f.properties.BoroCD.toString().startsWith("1"),
            style:  f => styleFor(f.properties.BoroCD.toString()),
            onEachFeature: (feature, layer) => {
                const id = feature.properties.BoroCD.toString();
                districtLayers[id] = layer;
                const d = districtData[id] || { name: `District ${id}` };
                layer.bindTooltip(d.name, { sticky: true });

                layer.on({
                    mouseover: e => {
                        e.target.setStyle({ weight: 4, fillOpacity: Math.min((styleFor(id).fillOpacity || 0.5) + 0.2, 1) });
                        e.target.bringToFront();
                        if (!selectedDistrictId) showHoverPreview(id);
                    },
                    mouseout: e => {
                        e.target.setStyle(styleFor(id));
                        if (!selectedDistrictId)
                            document.getElementById("hover-preview").classList.add("hidden");
                    },
                    click: e => {
                        map.fitBounds(e.target.getBounds(), { maxZoom: 14 });
                        selectDistrict(id);
                    },
                });
            },
        }).addTo(map);

        // Auto-select FiDi on load
        const fidiLayer = districtLayers[START_DISTRICT];
        if (fidiLayer) map.fitBounds(fidiLayer.getBounds(), { maxZoom: 13 });
        updateCounter();
    });

// ── File input UI ─────────────────────────────────────────────
document.getElementById("photo-upload").addEventListener("change", function () {
    const chosen = document.getElementById("file-chosen");
    const btn    = document.getElementById("submit-btn");
    if (this.files.length > 0) {
        chosen.textContent = "📷 " + this.files[0].name;
        chosen.classList.remove("hidden");
        btn.classList.remove("hidden");
    } else {
        chosen.classList.add("hidden");
        btn.classList.add("hidden");
    }
});

// ── Submit / validate photo ───────────────────────────────────
document.getElementById("submit-btn").addEventListener("click", async function () {
    const fileInput = document.getElementById("photo-upload");
    if (!fileInput.files.length) { alert("Please choose a photo first."); return; }
    if (!selectedDistrictId)     { alert("No district selected."); return; }

    const statusDiv = document.getElementById("validation-status");
    statusDiv.textContent = "🔄 Validating your photo…";
    statusDiv.className   = "validation-status validating";
    statusDiv.classList.remove("hidden");
    this.disabled = true;

    // Find the first spot in the selected district to use as validation target
    const localSpots = allLocations.filter(f => String(f.properties.BoroCD).trim() === selectedDistrictId);

    let approved = false;
    let message  = "";

    try {
        if (localSpots.length > 0) {
            // Try the Flask backend
            const spot     = localSpots[0];
            const [lng, lat] = spot.geometry.coordinates;

            // We need a spotId — use the spot name as a key for now
            // In production this should be the Firestore document ID
            const formData = new FormData();
            formData.append("image",  fileInput.files[0]);
            formData.append("spotId", spot.properties.name); // fallback key
            formData.append("uid",    uid);

            const resp = await fetch(`${BACKEND_URL}/validate`, { method: "POST", body: formData });
            if (resp.ok) {
                const data = await resp.json();
                approved = data.approved;
                message  = data.message;
            } else {
                // Backend down — simulate approval for demo
                approved = true;
                message  = "Demo mode: location verified ✓";
            }
        } else {
            // No spots in this district — use simulated approval
            approved = true;
            message  = "Demo mode: district unlocked ✓";
        }
    } catch {
        // Backend not running — simulate for hackathon demo
        approved = true;
        message  = "Demo mode: photo accepted ✓";
    }

    this.disabled = false;

    if (approved) {
        handleUnlock(selectedDistrictId, message);
    } else {
        statusDiv.textContent = "✗ " + message;
        statusDiv.className   = "validation-status rejected";
    }
});

// ── Handle district unlock ────────────────────────────────────
function handleUnlock(id, message) {
    if (!gameState.unlockedDistricts.includes(id)) {
        gameState.unlockedDistricts.push(id);
    }

    // Record first spot visit in this district
    const localSpots = allLocations.filter(f => String(f.properties.BoroCD).trim() === id);
    if (localSpots.length && !gameState.visitedSpots.includes(localSpots[0].properties.name)) {
        gameState.visitedSpots.push(localSpots[0].properties.name);
    }

    saveState(gameState);
    refreshMap();

    // Find newly available neighbors
    const newlyAvailable = (adjacency[id] || []).filter(
        n => !gameState.unlockedDistricts.includes(n)
    );

    // Show congrats panel
    const d = districtData[id] || { name: `District ${id}` };
    document.getElementById("congrats-district").textContent = d.name;
    document.getElementById("congrats-body").textContent     = message;

    const ul = document.getElementById("congrats-unlocked-list");
    ul.innerHTML = newlyAvailable.length
        ? `<p class="panel-eyebrow" style="margin-top:12px">Now available:</p><ul class="spots-list">` +
          newlyAvailable.map(n => `<li>🗺️ ${districtData[n]?.name || "District " + n}</li>`).join("") + "</ul>"
        : "";

    showPanel("panel-congrats");
    selectedDistrictId = null;
}

document.getElementById("congrats-continue-btn").addEventListener("click", () => {
    showPanel("panel-default");
    refreshMap();
});
