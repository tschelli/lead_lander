/**
 * ZIP Code Lookup Utilities
 *
 * Provides functions for:
 * - Finding the nearest location based on ZIP code
 * - Calculating distance between two coordinates
 * - Getting coordinates for a ZIP code
 */

import { Pool } from "pg";

/**
 * Calculate distance between two coordinates using the Haversine formula
 * Returns distance in miles
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Find the nearest location to a given ZIP code
 *
 * Note: This is a simple implementation using coordinates from the locations table.
 * For production, you would want to:
 * 1. Use a ZIP code database/API to get coordinates for the input ZIP
 * 2. Consider using PostGIS for more efficient spatial queries
 */
export async function findNearestLocation(
  pool: Pool,
  accountId: string,
  zipCode: string
): Promise<{
  id: string;
  name: string;
  city: string;
  state: string;
  zipCode: string;
  distance: number;
} | null> {
  // For demo purposes, we'll use a simple ZIP-to-coordinate mapping
  // In production, use a ZIP code API like ZipCodeAPI.com or Google Geocoding
  const zipCoords = getCoordinatesForZip(zipCode);

  if (!zipCoords) {
    return null;
  }

  // Query all active locations for this account
  const result = await pool.query(
    `SELECT id, name, city, state, zip_code, latitude, longitude
     FROM locations
     WHERE account_id = $1 AND is_active = true
     AND latitude IS NOT NULL AND longitude IS NOT NULL`,
    [accountId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  // Calculate distance to each location
  const locationsWithDistance = result.rows.map((location) => ({
    id: location.id,
    name: location.name,
    city: location.city,
    state: location.state,
    zipCode: location.zip_code,
    distance: calculateDistance(
      zipCoords.lat,
      zipCoords.lon,
      parseFloat(location.latitude),
      parseFloat(location.longitude)
    )
  }));

  // Sort by distance and return the closest
  locationsWithDistance.sort((a, b) => a.distance - b.distance);

  return locationsWithDistance[0];
}

/**
 * Find all locations within a certain radius of a ZIP code
 */
export async function findLocationsNearby(
  pool: Pool,
  accountId: string,
  zipCode: string,
  radiusMiles: number = 50
): Promise<Array<{
  id: string;
  name: string;
  city: string;
  state: string;
  zipCode: string;
  distance: number;
}>> {
  const zipCoords = getCoordinatesForZip(zipCode);

  if (!zipCoords) {
    return [];
  }

  const result = await pool.query(
    `SELECT id, name, city, state, zip_code, latitude, longitude
     FROM locations
     WHERE account_id = $1 AND is_active = true
     AND latitude IS NOT NULL AND longitude IS NOT NULL`,
    [accountId]
  );

  const locationsWithDistance = result.rows
    .map((location) => ({
      id: location.id,
      name: location.name,
      city: location.city,
      state: location.state,
      zipCode: location.zip_code,
      distance: calculateDistance(
        zipCoords.lat,
        zipCoords.lon,
        parseFloat(location.latitude),
        parseFloat(location.longitude)
      )
    }))
    .filter((location) => location.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);

  return locationsWithDistance;
}

/**
 * Simple ZIP code to coordinates mapping
 *
 * In production, replace this with:
 * 1. A comprehensive ZIP code database
 * 2. A ZIP code API (ZipCodeAPI, Google Geocoding, etc.)
 * 3. PostGIS spatial queries
 *
 * This is a demo implementation with major US city ZIP codes
 */
function getCoordinatesForZip(zipCode: string): { lat: number; lon: number } | null {
  const zipMap: Record<string, { lat: number; lon: number }> = {
    // Major cities for demo purposes
    "10001": { lat: 40.7506, lon: -73.9971 }, // New York, NY
    "90001": { lat: 33.9731, lon: -118.2479 }, // Los Angeles, CA
    "60601": { lat: 41.8826, lon: -87.6187 }, // Chicago, IL
    "77001": { lat: 29.7578, lon: -95.3677 }, // Houston, TX
    "85001": { lat: 33.4485, lon: -112.0735 }, // Phoenix, AZ
    "19101": { lat: 39.9523, lon: -75.1638 }, // Philadelphia, PA
    "78201": { lat: 29.4246, lon: -98.4946 }, // San Antonio, TX
    "92101": { lat: 32.7157, lon: -117.1611 }, // San Diego, CA
    "75201": { lat: 32.7767, lon: -96.7970 }, // Dallas, TX
    "95101": { lat: 37.3387, lon: -121.8853 }, // San Jose, CA
    "78701": { lat: 29.7604, lon: -97.7636 }, // Austin, TX
    "32301": { lat: 30.4383, lon: -84.2807 }, // Jacksonville, FL
    "94102": { lat: 37.7749, lon: -122.4194 }, // San Francisco, CA
    "46201": { lat: 39.7684, lon: -86.1581 }, // Indianapolis, IN
    "43201": { lat: 39.9612, lon: -82.9988 }, // Columbus, OH
    "76101": { lat: 32.7555, lon: -97.3308 }, // Fort Worth, TX
    "28201": { lat: 35.2271, lon: -80.8431 }, // Charlotte, NC
    "98101": { lat: 47.6062, lon: -122.3321 }, // Seattle, WA
    "80201": { lat: 39.7392, lon: -104.9903 }, // Denver, CO
    "20001": { lat: 38.9072, lon: -77.0369 }, // Washington, DC
    "02101": { lat: 42.3601, lon: -71.0589 }, // Boston, MA
    "37201": { lat: 36.1627, lon: -86.7816 }, // Nashville, TN
    "73101": { lat: 35.4676, lon: -97.5164 }, // Oklahoma City, OK
    "97201": { lat: 45.5152, lon: -122.6784 }, // Portland, OR
    "89101": { lat: 36.1699, lon: -115.1398 }, // Las Vegas, NV
    "48201": { lat: 42.3314, lon: -83.0458 }, // Detroit, MI
    "38101": { lat: 35.1495, lon: -90.0490 }, // Memphis, TN
    "40201": { lat: 38.2527, lon: -85.7585 }, // Louisville, KY
    "53201": { lat: 43.0389, lon: -87.9065 }, // Milwaukee, WI
    "87101": { lat: 35.0844, lon: -106.6504 }, // Albuquerque, NM
    "30301": { lat: 33.7490, lon: -84.3880 }, // Atlanta, GA
    "33101": { lat: 25.7617, lon: -80.1918 }, // Miami, FL
  };

  // Try exact match first
  if (zipMap[zipCode]) {
    return zipMap[zipCode];
  }

  // Try matching first 3 digits (approximation)
  const zipPrefix = zipCode.substring(0, 3);
  const matchingZip = Object.keys(zipMap).find((zip) => zip.startsWith(zipPrefix));

  if (matchingZip) {
    return zipMap[matchingZip];
  }

  return null;
}

// ============================================================================
// CLI Tool (run directly with tsx)
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage: tsx scripts/zip-lookup.ts <account-id> <zip-code> [radius-miles]");
    console.log("\nExample:");
    console.log("  tsx scripts/zip-lookup.ts tech-institute 98101");
    console.log("  tsx scripts/zip-lookup.ts health-academy 02101 100");
    process.exit(1);
  }

  const [accountId, zipCode, radiusStr] = args;
  const radius = radiusStr ? parseInt(radiusStr, 10) : 50;

  const databaseUrl = process.env.DATABASE_URL || "postgres://lead_lander:lead_lander@localhost:5432/lead_lander";
  const pool = new Pool({ connectionString: databaseUrl });

  (async () => {
    try {
      console.log(`\n🔍 Searching for locations near ZIP ${zipCode} for account ${accountId}...\n`);

      const locations = await findLocationsNearby(pool, accountId, zipCode, radius);

      if (locations.length === 0) {
        console.log("❌ No locations found within the specified radius.");
      } else {
        console.log(`✅ Found ${locations.length} location(s):\n`);
        locations.forEach((loc, index) => {
          console.log(`${index + 1}. ${loc.name} (${loc.city}, ${loc.state})`);
          console.log(`   Distance: ${loc.distance} miles`);
          console.log(`   ZIP: ${loc.zipCode}\n`);
        });
      }
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    } finally {
      await pool.end();
    }
  })();
}
