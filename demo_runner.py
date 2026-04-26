# image validation demo script

import os
from imageValidation import validate_location

# --- CONFIGURATION ---
# Target: Empire State Building
TARGET_LOCATION = (40.7484, -73.9857) 
VALID_RADIUS = 150 # meters

def run_demo():
    print("="*50)
    print(" MANHATTAN EXPLORER: LOGIC DEMO")
    print("="*50)

    # 1. Provide a real path to a file
    user_image = "testPhoto.jpg" 

    if os.path.exists(user_image):
        print(f"Testing User Image: {user_image}...")
        status, message = validate_location(user_image, TARGET_LOCATION, VALID_RADIUS)
        print(f"RESULT: {message}")
    else:
        print(f"File '{user_image}' not found. Please place a photo in this folder to test.")

    print("\n" + "-"*30)
    print("HARDCODED TEST SCENARIOS")
    print("-"*30)

    # Scenario A: User is at the Flatiron Building (~1km away)
    # Testing math: (40.7411, -73.9897)
    FLATIRON_COORDS = (40.7411, -73.9897)
    
    # We simulate what happens if we had an image from here
    print(f"Scenario: Photo taken at Flatiron Building (Target: Empire State)")
    # Since we can't 'fake' a file easily in this script without complex code, 
    # we are demonstrating how you'd call it:
    # status, msg = validate_location("flatiron.jpg", TARGET_LOCATION, VALID_RADIUS)
    print("Result: Should return 'FAILED: Too far away (~900m)'")

    print("\n" + "-"*30)
    print("DEMO COMPLETE")

if __name__ == "__main__":
    run_demo()