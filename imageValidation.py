# Author - Eric Gardiner
# 25 April 2026
# extracts EXIF/GPS metadata from JPEG and HEIC images to verify user proximity to a target coordinate within a defined radius.

from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
from geopy.distance import geodesic
import pillow_heif # for HEIC support, install with: pip install pillow-heif

pillow_heif.register_heif_opener() # Register HEIC opener with Pillow

def get_geotagging(img):
    """Extracts GPS dictionary from a PIL Image object."""
    exif_data = img.getexif()
    if not exif_data:
        return None

    gps_info = {}
    for tag_id in exif_data:
        tag_name = TAGS.get(tag_id, tag_id)
        if tag_name == "GPSInfo":
            # This is the modern Pillow 10+ way to handle the GPS Sub-IFD
            gps_dict = exif_data.get_ifd(tag_id) 
            for t in gps_dict:
                sub_decoded = GPSTAGS.get(t, t)
                gps_info[sub_decoded] = gps_dict[t]
    return gps_info

def convert_to_degrees(value):
    # Decimal degrees = D + (Minutes/60) + (Seconds/3600)

    """Helper function to convert GPS coordinates to decimal degrees."""
    d = float(value[0])
    m = float(value[1])
    s = float(value[2])
    return d + (m / 60.0) + (s / 3600.0)

def get_lat_lon(gps_info):
    """Returns (lat, lon) as floats, with strict boundary checks."""
    try:
        # 1. Extract raw degrees
        lat = convert_to_degrees(gps_info['GPSLatitude'])
        lon = convert_to_degrees(gps_info['GPSLongitude'])

        # 2. Check the Reference tags (N/S, E/W)
        # Use .get() and .upper() to be safe against different formats
        lat_ref = gps_info.get('GPSLatitudeRef', 'N').upper()
        lon_ref = gps_info.get('GPSLongitudeRef', 'E').upper()

        if lat_ref == 'S':
            lat = -lat
        if lon_ref == 'W':
            lon = -lon

        # 3. Final Boundary Check for geopy
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            return None

        return lat, lon
    except (KeyError, TypeError, ZeroDivisionError, IndexError):
        return None

def validate_location(image_path, target_coords, radius_meters=100):
    try:
        #  opens .jpg, .jpeg, .heic, and .heif
        with Image.open(image_path) as img:
            gps_data = get_geotagging(img)
            
            if not gps_data:
                return False, "No GPS data found. Check if Location Services were on."

            img_coords = get_lat_lon(gps_data)
            if not img_coords:
                return False, "Incomplete GPS data."

            distance = geodesic(img_coords, target_coords).meters
            
            if distance <= radius_meters:
                return True, f"Approved! ({round(distance, 1)}m away)"
            return False, f"Too far! ({round(distance, 1)}m away)"

    except Exception as e:
        return False, f"File error: {str(e)}"

# --- Example Usage (Only runs if you run this file directly) ---
if __name__ == "__main__":
    # Change this to match your actual test file name
    TEST_FILE = "testPhoto.jpg" 
    TARGET = (40.7484, -73.9857) 

    # approved, message = validate_location(TEST_FILE, TARGET, radius_meters=150)
    # print(f"Direct Script Test: {message}")