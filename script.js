// 1. Setup the Map FIRST
const manhattanBounds = [
    [40.68, -74.05], // Southwest
    [40.89, -73.88]  // Northeast
];

const map = L.map('map', {
    maxBounds: manhattanBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 12
}).setView([40.7831, -73.9712], 13);

// 2. Add the Streets
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

let geojson; // We need this variable for the hover reset to work

// 3. Hover & Style Functions
function highlightFeature(e) {
    var layer = e.target;
    layer.setStyle({
        weight: 4,
        color: '#2c3e50',
        fillOpacity: 0.7,
        fillColor: '#f1c40f' // Yellow glow
    });
    layer.bringToFront();
}

function resetHighlight(e) {
    geojson.resetStyle(e.target);
}

// 4. Load the Data
fetch('manhattan_districts.json')
    .then(res => res.json())
    .then(data => {
        geojson = L.geoJSON(data, {
            style: {
                color: "#34495e",
                weight: 2,
                fillColor: "#3498db",
                fillOpacity: 0.3
            },
            onEachFeature: function(feature, layer) {
                layer.on({
                    mouseover: highlightFeature,
                    mouseout: resetHighlight,
                    click: function(e) {
                        map.fitBounds(e.target.getBounds());
                        document.getElementById('upload-section').classList.remove('hidden');
                        document.getElementById('district-info').innerHTML = `
                            <h2>District ${feature.properties.BoroCD}</h2>
                            <p>Status: <strong>Locked</strong></p>
                        `;
                    }
                });
            }
        }).addTo(map);
    });