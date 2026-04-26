// --- 1. CONFIGURATION & DATA ---
const districtData = {
    "101": { name: "Financial District", info: "The historic heart of NYC and home to Wall Street." },
    "102": { name: "Greenwich Village / Soho", info: "Famous for its jazz clubs, cafes, and Washington Square Park." },
    "103": { name: "Lower East Side", info: "A vibrant area known for its nightlife and the East River Park." },
    "104": { name: "Chelsea / Clinton", info: "Home to the High Line and hundreds of art galleries." },
    "105": { name: "Midtown", info: "The bustling center of Manhattan, including Times Square." },
    "106": { name: "Stuyvesant Town / Turtle Bay", info: "A largely residential area near the United Nations." },
    "107": { name: "Upper West Side", info: "A cultural hub near Lincoln Center and the Museum of Natural History." },
    "108": { name: "Upper East Side", info: "Known for the Museum Mile and upscale shopping." },
    "109": { name: "Morningside Heights", info: "Home to Columbia University and Riverside Park." },
    "110": { name: "Central Harlem", info: "The historic epicenter of African American culture." },
    "111": { name: "East Harlem", info: "Also known as El Barrio, famous for its murals and street food." },
    "112": { name: "Washington Heights / Inwood", info: "Home to The Met Cloisters and Highbridge Park." }
};

// Unique colors for each district
function getColor(id) {
    const colors = {
        "101": "#e74c3c", "102": "#9b59b6", "103": "#2ecc71", 
        "104": "#f39c12", "105": "#1abc9c", "106": "#34495e", 
        "107": "#d35400", "108": "#7f8c8d", "109": "#c0392b", 
        "110": "#16a085", "111": "#27ae60", "112": "#2980b9"
    };
    return colors[id] || "#3498db";
}

// --- 2. MAP SETUP & GLOBALS ---
const map = L.map('map', {
    maxBounds: [[40.68, -74.05], [40.89, -73.88]],
    maxBoundsViscosity: 1.0,
    minZoom: 12
}).setView([40.7831, -73.9712], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

let geojson;
let allLocations = []; 
let markerGroup = L.layerGroup().addTo(map);
let lockedDistrict = null; // Prevents sidebar from clearing after click

const treeSVG = `
    <svg viewBox="0 0 24 24" width="50" height="50" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L4.5 12h3V22h9V12h3L12 2z" fill="#27ae60" stroke="#1e8449" stroke-width="1"/>
    </svg>`;

// --- 3. INTERACTION FUNCTIONS ---

function highlightFeature(e) {
    const layer = e.target;
    layer.setStyle({
        weight: 5,
        color: '#666',
        fillOpacity: 0.8
    });
    layer.bringToFront();

    const id = layer.feature.properties.BoroCD.toString();
    const data = districtData[id] || { name: `District ${id}`, info: "Hover to explore." };
    
    // Only update text on hover if we haven't locked a selection
    if (!lockedDistrict) {
        document.getElementById('district-info').innerHTML = `
            <h2>${data.name}</h2>
            <p>${data.info}</p>
            <p class="hint">Click to view local spots</p>
        `;
    }
}

function resetHighlight(e) {
    const layer = e.target;
    const id = layer.feature.properties.BoroCD.toString();
    
    // Return to original unique color
    layer.setStyle({
        weight: 2,
        color: "#ffffff",
        fillColor: getColor(id),
        fillOpacity: 0.6
    });

    if (!lockedDistrict) {
        document.getElementById('district-info').innerHTML = `
            <h2>Manhattan</h2>
            <p>Select a district to see available locations.</p>
        `;
    }
}

// --- 4. DATA LOADING & CLICK LOGIC ---

fetch('locations.json')
    .then(res => res.json())
    .then(data => { allLocations = data.features || []; })
    .catch(err => console.error("Error loading locations:", err));

fetch('manhattan_districts.json')
    .then(res => res.json())
    .then(data => {
        geojson = L.geoJSON(data, {
            filter: (f) => f.properties.BoroCD.toString().startsWith('1'),
            style: function(feature) {
                return {
                    color: "#ffffff",
                    weight: 2,
                    fillColor: getColor(feature.properties.BoroCD.toString()),
                    fillOpacity: 0.6
                };
            },
            onEachFeature: function(feature, layer) {
                const id = feature.properties.BoroCD.toString();
                const dData = districtData[id] || { name: `District ${id}` };

                layer.bindTooltip(dData.name, { sticky: true });

                layer.on({
                    mouseover: highlightFeature,
                    mouseout: resetHighlight,
                    click: function(e) {
                        map.fitBounds(e.target.getBounds());
                        lockedDistrict = id; // Lock the sidebar to this district

                        // UI Updates
                        document.getElementById('upload-section').classList.remove('hidden');
                        markerGroup.clearLayers();

                        // Filter locations (Super-Safe Version)
                        const localSpots = allLocations.filter(spot => {
                            return String(spot.properties.BoroCD).trim() === String(id).trim();
                        });

                        let spotsHTML = "<h3>Locations:</h3><ul>";
                        localSpots.forEach(spot => {
                            const [lng, lat] = spot.geometry.coordinates;
                            const iconMarkup = spot.properties.type === "Park" ? treeSVG : "📍";

                            const customIcon = L.divIcon({
                                html: iconMarkup,
                                className: 'custom-svg-marker',
                                iconSize: [50, 50],
                                iconAnchor: [25, 25]
                            });

                            const marker = L.marker([lat, lng], { icon: customIcon })
                                .bindPopup(`<strong>${spot.properties.name}</strong><br>${spot.properties.description}`);
                            
                            markerGroup.addLayer(marker);
                            spotsHTML += `<li><strong>${spot.properties.name}</strong></li>`;
                        });

                        spotsHTML += "</ul>";
                        if (localSpots.length === 0) spotsHTML = "<p>No special locations recorded here yet.</p>";

                        document.getElementById('district-info').innerHTML = `
                            <h2>${dData.name}</h2>
                            <p>${dData.info}</p>
                            <hr>
                            ${spotsHTML}
                        `;
                    }
                });
            }
        }).addTo(map);
    });

// --- 5. BUTTON LOGIC ---
document.getElementById('submit-btn').addEventListener('click', function() {
    const fileInput = document.getElementById('photo-upload');
    if (fileInput.files.length > 0) {
        alert("Photo uploaded! District exploration saved.");
        fileInput.value = ""; 
    } else {
        alert("Please select a photo first!");
    }
});