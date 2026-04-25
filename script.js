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

const manhattanBounds = [
    [40.68, -74.05],
    [40.89, -73.88]
];

// 1. DATA DICTIONARY (Put this first!)
const districtData = {
    "101": { name: "Financial District", info: "The historic heart of NYC and home to Wall Street." },
    "102": { name: "Greenwich Village / Soho", info: "Famous for its jazz clubs, cafes, and Washington Square Park." },
    "103": { name: "Lower East Side", info: "A vibrant area known for its nightlife and Jewish heritage." },
    "104": { name: "Chelsea / Clinton", info: "Home to the High Line and hundreds of art galleries." },
    "105": { name: "Midtown", info: "The bustling center of Manhattan, including Times Square." },
    "106": { name: "Stuyvesant Town / Turtle Bay", info: "A largely residential area near the United Nations." },
    "107": { name: "Upper West Side", info: "A cultural hub near Lincoln Center and the Museum of Natural History." },
    "108": { name: "Upper East Side", info: "Known for the Museum Mile and upscale shopping." },
    "109": { name: "Morningside Heights", info: "Home to Columbia University and Riverside Park." },
    "110": { name: "Central Harlem", info: "The historic epicenter of African American culture." },
    "111": { name: "East Harlem", info: "Also known as El Barrio, famous for its murals and street food." },
    "112": { name: "Washington Heights / Inwood", info: "Home to The Met Cloisters and Highbridge Park." },
    "164": { name: "Central Park", info: "Some would call this NYC's national park! With many beautiful paths to take, you can feel yourself transported from a big noisy city to a much quiter and tranquil nature spot."}
};

// 2. MAP SETUP
const map = L.map('map', {
    maxBounds: [[40.68, -74.05], [40.89, -73.88]],
    maxBoundsViscosity: 1.0,
    minZoom: 12
}).setView([40.7831, -73.9712], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

let geojson;
let allSpots = [];
let unlockedDistricts = {};
let selectedSpotId = null;
let currentUid = null;

// --- Firebase anonymous auth ---
firebase.auth().signInAnonymously().catch(err => console.error("Auth error:", err));

firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) return;
    currentUid = user.uid;
    await loadSpots();
    await loadDistricts();
});

async function loadSpots() {
    try {
        const res = await fetch(`${BACKEND_URL}/spots`);
        allSpots = await res.json();
    } catch (err) {
        console.error("Failed to load spots:", err);
    }
}

async function loadDistricts() {
    try {
        const res = await fetch(`${BACKEND_URL}/districts/${currentUid}`);
        unlockedDistricts = await res.json();
        updateMapColors();
    } catch (err) {
        console.error("Failed to load districts:", err);
    }
}

function updateMapColors() {
    if (!geojson) return;
    geojson.eachLayer((layer) => {
        const id = layer.feature.properties.BoroCD?.toString();
        const name = districtNames[id];
        const info = unlockedDistricts[name];
        if (info?.districtUnlocked) {
            layer.setStyle({ fillColor: "#2ecc71", fillOpacity: 0.6 });
        } else if (info?.spotsUnlocked > 0) {
            layer.setStyle({ fillColor: "#f39c12", fillOpacity: 0.5 });
        } else {
            layer.setStyle({ fillColor: "#3498db", fillOpacity: 0.3 });
        }
    });
}

// 3. HOVER FUNCTIONS (Must be defined before fetch)
function highlightFeature(e) {
    var layer = e.target;

    layer.setStyle({
        weight: 4,
        color: '#2c3e50',
        fillOpacity: 0.7,
        fillColor: '#f1c40f'
    });
    layer.bringToFront();

    const id = layer.feature.properties.BoroCD.toString();
    const infoPanel = document.getElementById('district-info');

    const data = districtData[id] || {
        name: `District ${id}`,
        info: "Data coming soon."
    };

    if (infoPanel) {
        infoPanel.innerHTML = `
            <h2>${data.name}</h2>
            <p>${data.info}</p>
        `;
    }
}

function resetHighlight(e) {
    geojson.resetStyle(e.target);
    updateMapColors();
    document.getElementById('district-info').innerHTML = `
        <h2>Manhattan</h2>
        <p>Hover over a district to explore.</p>
    `;
}

// 4. LOAD AND FILTER DATA
fetch('manhattan_districts.json')
    .then(res => res.json())
    .then(data => {
        geojson = L.geoJSON(data, {
            filter: (feature) => feature.properties.BoroCD?.toString().startsWith('1'),
            style: { color: "#34495e", weight: 2, fillColor: "#3498db", fillOpacity: 0.3 },
            onEachFeature: (feature, layer) => {
                const id = feature.properties.BoroCD?.toString();
                const districtName = districtNames[id] || `District ${id}`;

                layer.bindTooltip(districtName, { sticky: true, direction: 'auto', className: 'district-label' });

                layer.on({
                    mouseover: highlightFeature,
                    mouseout: resetHighlight,
                    click: (e) => {
                        map.fitBounds(e.target.getBounds());
                        showDistrictPanel(id, districtName);
                    }
                });
            }
        }).addTo(map);

        updateMapColors();
    })
    .catch(err => console.error("Error loading GeoJSON:", err));

function showDistrictPanel(id, districtName) {
    const info = unlockedDistricts[districtName];
    const spotsUnlocked = info?.spotsUnlocked || 0;
    const isUnlocked = info?.districtUnlocked || false;

    const districtSpots = allSpots.filter(s => s.district === districtName);
    selectedSpotId = null;

    const spotListHTML = districtSpots.length > 0
        ? districtSpots.map(s => `
            <div class="spot-item" data-id="${s.id}" onclick="selectSpot('${s.id}', this)">
                <strong>${s.name}</strong>
                <span class="spot-category">${s.category}</span>
                <p>${s.challenge}</p>
            </div>`).join("")
        : "<p>No spots added here yet.</p>";

    document.getElementById('district-info').innerHTML = `
        <h2>${districtName}</h2>
        <p>Spots unlocked: <strong>${spotsUnlocked} / 3</strong></p>
        <p>Status: <strong>${isUnlocked ? "🟢 Unlocked" : "🔒 Locked"}</strong></p>
        <hr>
        <h3>Pick a spot to visit:</h3>
        ${spotListHTML}
    `;

    const uploadSection = document.getElementById('upload-section');
    uploadSection.classList.remove('hidden');
}

function selectSpot(spotId, el) {
    document.querySelectorAll('.spot-item').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    selectedSpotId = spotId;
}

document.getElementById('submit-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('photo-upload');
    if (!selectedSpotId) return alert("Please select a spot first.");
    if (!fileInput.files[0]) return alert("Please upload a photo.");
    if (!currentUid) return alert("Not signed in yet, try again.");

    const formData = new FormData();
    formData.append("image", fileInput.files[0]);
    formData.append("spotId", selectedSpotId);
    formData.append("uid", currentUid);

    document.getElementById('submit-btn').textContent = "Checking...";
    document.getElementById('submit-btn').disabled = true;

    try {
        const res = await fetch(`${BACKEND_URL}/validate`, { method: "POST", body: formData });
        const result = await res.json();

        alert(result.approved ? `✅ ${result.message}` : `❌ ${result.message}`);

        if (result.approved) {
            await loadDistricts();
            updateMapColors();
        }
    } catch (err) {
        alert("Error connecting to server.");
        console.error(err);
    } finally {
        document.getElementById('submit-btn').textContent = "Unlock Next Area";
        document.getElementById('submit-btn').disabled = false;
    }
});
