from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
from imageValidation import validate_location
import tempfile
import os

app = Flask(__name__)
CORS(app)

cred = credentials.Certificate("service-account.json")
firebase_admin.initialize_app(cred)
db = firestore.client()


@app.route("/spots", methods=["GET"])
def get_spots():
    docs = db.collection("spots").stream()
    spots = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        spots.append(data)
    return jsonify(spots), 200


@app.route("/spots", methods=["POST"])
def add_spot():
    body = request.get_json()
    required = ["name", "description", "latitude", "longitude", "challenge", "category", "district"]
    if not all(k in body for k in required):
        return jsonify({"error": f"Missing fields. Required: {required}"}), 400

    doc_ref = db.collection("spots").add({
        "name": body["name"],
        "description": body["description"],
        "latitude": body["latitude"],
        "longitude": body["longitude"],
        "challenge": body["challenge"],
        "category": body["category"],
        "district": body["district"],
        "radius": body.get("radius", 100),
        "addedBy": body.get("uid", "anonymous"),
        "unlockCount": 0,
        "createdAt": firestore.SERVER_TIMESTAMP,
    })
    return jsonify({"id": doc_ref[1].id}), 201


@app.route("/validate", methods=["POST"])
def validate():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400
    if "spotId" not in request.form:
        return jsonify({"error": "Missing spotId"}), 400
    if "uid" not in request.form:
        return jsonify({"error": "Missing uid"}), 400

    spot_doc = db.collection("spots").document(request.form["spotId"]).get()
    if not spot_doc.exists:
        return jsonify({"error": "Spot not found"}), 404

    spot = spot_doc.to_dict()
    target_coords = (spot["latitude"], spot["longitude"])
    radius = spot.get("radius", 100)

    image = request.files["image"]
    suffix = os.path.splitext(image.filename)[1] or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        image.save(tmp.name)
        approved, message = validate_location(tmp.name, target_coords, radius)
    os.unlink(tmp.name)

    if approved:
        uid = request.form["uid"]
        spot_id = request.form["spotId"]
        db.collection("users").document(uid).collection("unlocked").document(spot_id).set({
            "unlockedAt": firestore.SERVER_TIMESTAMP,
            "spotName": spot["name"],
            "category": spot.get("category"),
            "challenge": spot["challenge"],
        })
        db.collection("spots").document(spot_id).update({
            "unlockCount": firestore.Increment(1)
        })
        db.collection("users").document(uid).collection("unlocked").document(spot_id).update({
            "district": spot.get("district"),
        })

    return jsonify({"approved": approved, "message": message}), 200


@app.route("/districts/<uid>", methods=["GET"])
def get_districts(uid):
    UNLOCK_THRESHOLD = 3

    docs = db.collection("users").document(uid).collection("unlocked").stream()

    district_counts = {}
    for doc in docs:
        data = doc.to_dict()
        district = data.get("district")
        if district:
            district_counts[district] = district_counts.get(district, 0) + 1

    result = {}
    for district, count in district_counts.items():
        result[district] = {
            "spotsUnlocked": count,
            "districtUnlocked": count >= UNLOCK_THRESHOLD,
        }

    return jsonify(result), 200


if __name__ == "__main__":
    app.run(debug=True)
