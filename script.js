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

// 3. HOVER FUNCTIONS (Must be defined before fetch)
function highlightFeature(e) {
    var layer = e.target;

    // 1. Visual highlight logic
    layer.setStyle({
        weight: 4,
        color: '#2c3e50',
        fillOpacity: 0.7,
        fillColor: '#f1c40f' 
    });
    layer.bringToFront();

    // 2. THE NEW DATA LOGIC GOES HERE
    const id = layer.feature.properties.BoroCD.toString();
    const infoPanel = document.getElementById('district-info');

    // This looks up the info in your districtData dictionary
    const data = districtData[id] || { 
        name: `District ${id}`, 
        info: "Data coming soon."
    };

    // This pushes the info into your HTML sidebar/box
    if (infoPanel) {
        infoPanel.innerHTML = `
            <h2>${data.name}</h2>
            <p>${data.info}</p>
        `;
    }
}

function resetHighlight(e) {
    geojson.resetStyle(e.target);
    // Optional: Reset message when mouse leaves
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
            filter: (f) => f.properties.BoroCD.toString().startsWith('1'),
            style: { color: "#34495e", weight: 2, fillColor: "#3498db", fillOpacity: 0.3 },
            onEachFeature: function(feature, layer) {
                const id = feature.properties.BoroCD.toString();
                const name = districtData[id] ? districtData[id].name : `District ${id}`;
                
                layer.bindTooltip(name, { sticky: true });
                layer.on({
                    mouseover: highlightFeature,
                    mouseout: resetHighlight,
                    click: (e) => map.fitBounds(e.target.getBounds())
                });
            }
        }).addTo(map);
    });