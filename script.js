// 1. Manual Naming Dictionary
// Since your JSON doesn't have names, add them here based on the BoroCD
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

// 2. Setup the Map
const manhattanBounds = [
    [40.68, -74.05], // Southwest
    [40.89, -73.88]  // Northeast
];

const map = L.map('map', {
    maxBounds: manhattanBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 12
}).setView([40.7831, -73.9712], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

let geojson; 

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function highlightFeature(e) {
    var layer = e.target;

    const currentRandomColor = getRandomColor();

    layer.setStyle({
        weight: 5,
        color: '#2c3e50',
        fillOpacity: 0.7,
        fillColor: currentRandomColor // Use the variable, not 'yellow'
    });

    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }
}

function resetHighlight(e) {
    geojson.resetStyle(e.target);
}
// 5. Load and Filter the Data
fetch('manhattan_districts.json')
    .then(res => res.json())
    .then(data => {
        geojson = L.geoJSON(data, {
            filter: function(feature) {
                const boroId = feature.properties.BoroCD || "";
                return boroId.toString().startsWith('1');
            },
            style: {
                color: "#34495e",
                weight: 2,
                fillColor: "#3498db",
                fillOpacity: 0.3
            },
            onEachFeature: function(feature, layer) {
                const id = feature.properties.BoroCD;
                
                const districtName = districtNames[id] || `District ${id}`;

                layer.bindTooltip(districtName, {
                    sticky: true,
                    direction: 'auto',
                    className: 'district-label'
                });

                layer.on({
                    mouseover: highlightFeature,
                    mouseout: resetHighlight,
                    click: function(e) {
                        map.fitBounds(e.target.getBounds());
                        
                        const uploadSection = document.getElementById('upload-section');
                        if(uploadSection) uploadSection.classList.remove('hidden');
                        
                        const infoPanel = document.getElementById('district-info');
                        if(infoPanel) {
                            infoPanel.innerHTML = `
                                <h2>${districtName}</h2>
                                <p>District ID: <strong>${id}</strong></p>
                                <p>Status: <strong>Locked</strong></p>
                            `;
                        }
                    }
                });
            }
        }).addTo(map);
    })
    .catch(err => console.error("Error loading GeoJSON:", err));