// The types of nearby place and their OpenStreetMap tags. No imports from the network code, so build tools can use it too.
import { CONFIG } from '../config.js';

/**
 * The types of place. `tags` = OpenStreetMap tags, each as [key, [values]]. `search` = the main word for maps buttons and the Nominatim back-up; `terms` = English, Hindi and local words used by the free search sources (Photon, Nominatim).
 */
export const CATEGORIES = [
  { id: 'food', terms: ['restaurant', 'dhaba', 'bhojanalaya', 'mishthan bhandar', 'sweets'], icon: '🍽️', search: 'restaurant', tags: [['amenity', ['restaurant', 'cafe', 'fast_food', 'food_court']], ['shop', ['bakery', 'convenience', 'supermarket', 'sweets']]] },
  { id: 'lodging', terms: ['hotel', 'lodge', 'dharamshala', 'guest house'], icon: '🛏️', search: 'hotel', startRadius: CONFIG.overpass.stayRadiusM, tags: [['tourism', ['hotel', 'guest_house', 'hostel', 'motel']], ['building', ['dormitory']], ['amenity', ['dharamshala']]] },
  { id: 'atm', terms: ['ATM', 'bank'], icon: '🏧', search: 'ATM', tags: [['amenity', ['atm', 'bank']]] },
  { id: 'pharmacy', terms: ['medical store', 'hospital', 'clinic', 'nursing home', 'chemist'], icon: '💊', search: 'medical store', tags: [['amenity', ['pharmacy', 'clinic', 'hospital', 'doctors']], ['shop', ['chemist']], ['healthcare', ['pharmacy']]] },
  { id: 'copy', terms: ['photocopy', 'xerox', 'stationery'], icon: '🖨️', search: 'photocopy', tags: [['shop', ['copyshop', 'stationery']], ['craft', ['printer']]] },
  { id: 'toilet', terms: ['public toilet'], icon: '🚻', search: 'public toilet', tags: [['amenity', ['toilets']]] },
  { id: 'fuel', terms: ['petrol pump'], icon: '⛽', search: 'petrol pump', tags: [['amenity', ['fuel']]] },
  { id: 'bus', terms: ['bus stand'], icon: '🚌', search: 'bus stand', tags: [['amenity', ['bus_station']], ['highway', ['bus_stop']]] },
  { id: 'rail', terms: ['railway station'], icon: '🚆', search: 'railway station', tags: [['railway', ['station']]] },
];

/** Which type does an OpenStreetMap element belong to? */
export function categoryOfTags(tags) {
  for (const c of CATEGORIES) for (const [key, values] of c.tags) if (tags[key] && values.includes(tags[key])) return c;
  return null;
}
