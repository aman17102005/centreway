// General lists of Indian states / union territories and towns, in lower case. Used for city detection and spelling fixes.
// These are FULL lists made from general knowledge (not picked from any sample card). They are the only place in src/ where place names
// are written; tests/no-tuning.test.js checks that no other file contains a place name from the sample cards.

export const STATES = [
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka',
  'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'odisha', 'orissa', 'punjab', 'rajasthan', 'sikkim',
  'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'uttaranchal', 'west bengal', 'andaman and nicobar islands', 
  'dadra and nagar haveli', 'daman and diu', 'jammu and kashmir', 'jammu & kashmir', 'ladakh', 'lakshadweep', 
  'india',
  // Hindi
  'उत्तर प्रदेश', 'बिहार', 'राजस्थान', 'पंजाब', 'हरियाणा', 'मध्य प्रदेश', 'उत्तराखंड', 'झारखंड', 'छत्तीसगढ़', 'गुजरात', 'महाराष्ट्र',
  'हिमाचल प्रदेश', 'जम्मू और कश्मीर', 'ओडिशा', 'पश्चिम बंगाल', 'कर्नाटक', 'तमिलनाडु', 'केरल', 'तेलंगाना', 'आंध्र प्रदेश', 'असम', 'भारत',
];

export const CITIES = [
  'new delhi',
  'agra', 'ahmedabad', 'ahmednagar', 'aizawl', 'ajmer', 'akola', 'aligarh', 'allahabad', 'prayagraj', 'alwar', 'ambala', 'amravati', 'amritsar',
  'anand', 'anantapur', 'asansol', 'aurangabad', 'bareilly', 'belagavi', 'belgaum', 'bellary', 'ballari', 'bhagalpur', 'bharatpur', 'bhavnagar',
  'bhilai', 'bhilwara', 'bhiwani', 'bhopal', 'bhubaneswar', 'bikaner', 'bilaspur', 'bokaro', 'chandigarh', 'chennai', 'coimbatore', 'cuttack',
  'darbhanga', 'dehradun', 'delhi', 'dhanbad', 'dibrugarh', 'durgapur', 'erode', 'faridabad', 'firozabad', 'gandhinagar', 'gaya', 'ghaziabad',
  'gorakhpur', 'gulbarga', 'kalaburagi', 'guntur', 'gurugram', 'gurgaon', 'guwahati', 'gwalior', 'hapur', 'haridwar', 'hazaribagh', 'hisar',
  'howrah', 'hubballi', 'hubli', 'hyderabad', 'imphal', 'indore', 'itanagar', 'jabalpur', 'jaipur', 'jalandhar', 'jalgaon', 'jammu', 'jamnagar',
  'jamshedpur', 'jhansi', 'jodhpur', 'junagadh', 'kakinada', 'kanpur', 'karnal', 'kochi', 'cochin', 'kohima', 'kolhapur', 'kolkata', 'kollam',
  'kota', 'kozhikode', 'calicut', 'kurnool', 'latur', 'lucknow', 'ludhiana', 'madurai', 'malegaon', 'mangaluru', 'mangalore', 'mathura', 'meerut',
  'moradabad', 'mumbai', 'muzaffarnagar', 'muzaffarpur', 'mysuru', 'mysore', 'nagpur', 'nanded', 'nashik', 'nellore', 'noida', 'palakkad', 'panaji',
  'panipat', 'patiala', 'patna', 'puducherry', 'pondicherry', 'pune', 'raipur', 'rajahmundry', 'rajkot', 'ranchi', 'rewa', 'rohtak', 'rourkela',
  'saharanpur', 'salem', 'sambalpur', 'sangli', 'shillong', 'shimla', 'siliguri', 'solapur', 'sonipat', 'srinagar', 'surat', 'thane', 'thanjavur',
  'thiruvananthapuram', 'trivandrum', 'thrissur', 'tiruchirappalli', 'trichy', 'tirunelveli', 'tirupati', 'tiruppur', 'udaipur', 'ujjain',
  'vadodara', 'varanasi', 'vellore', 'vijayawada', 'visakhapatnam', 'warangal', 'yamunanagar', 'bhadrak', 'balasore', 'berhampur', 'jeypore',
  'koraput', 'bargarh', 'jharsuguda', 'angul', 'dhenkanal', 'puri', 'kendrapara', 'sitapur', 'etawah', 'deoria', 'basti', 'azamgarh', 'ballia',
  'mirzapur', 'jaunpur', 'sultanpur', 'raebareli', 'unnao', 'hardoi', 'lakhimpur', 'shahjahanpur', 'badaun', 'budaun', 'pilibhit', 'rampur',
  'bijnor', 'amroha', 'sambhal', 'orai', 'banda', 'hamirpur', 'lalitpur', 'mahoba', 'fatehpur', 'kaushambi', 'pratapgarh', 'bhadohi', 'chandauli',
  'ghazipur', 'mau', 'gonda', 'bahraich', 'shravasti', 'balrampur', 'siddharthnagar', 'maharajganj', 'kushinagar', 'kasganj', 'hathras', 'etah',
  'mainpuri', 'farrukhabad', 'kannauj', 'auraiya', 'bulandshahr', 'baghpat', 'hanumangarh', 'sikar', 'churu', 'jhunjhunu', 'nagaur', 'pali',
  'sirohi', 'barmer', 'jaisalmer', 'jalore', 'bundi', 'baran', 'jhalawar', 'dausa', 'karauli', 'sawai', 'madhopur', 'tonk', 'chittorgarh',
  'rajsamand', 'dungarpur', 'banswara', 'kaithal', 'kurukshetra', 'jind', 'fatehabad', 'sirsa', 'rewari', 'mahendragarh', 'narnaul', 'palwal', 'nuh',
  'jhajjar', 'panchkula', 'bathinda', 'moga', 'firozpur', 'faridkot', 'muktsar', 'mansa', 'sangrur', 'barnala', 'ropar', 'nawanshahr', 'hoshiarpur',
  'kapurthala', 'pathankot', 'gurdaspur', 'tarn', 'taran', 'fazilka', 'mohali', 'nalanda', 'biharsharif', 'arrah', 'buxar', 'chhapra', 'siwan',
  'gopalganj', 'motihari', 'bettiah', 'sitamarhi', 'madhubani', 'samastipur', 'begusarai', 'khagaria', 'munger', 'lakhisarai', 'jamui', 'nawada',
  'sasaram', 'bhabua', 'araria', 'kishanganj', 'purnia', 'katihar', 'saharsa', 'supaul', 'madhepura', 'sagar', 'damoh', 'satna', 'katni',
  'chhindwara', 'betul', 'hoshangabad', 'narmadapuram', 'vidisha', 'raisen', 'sehore', 'dewas', 'ratlam', 'mandsaur', 'neemuch', 'khandwa',
  'khargone', 'burhanpur', 'dhar', 'jhabua', 'morena', 'bhind', 'datia', 'shivpuri', 'guna', 'ashoknagar', 'tikamgarh', 'chhatarpur', 'panna',
  'sidhi', 'singrauli', 'shahdol', 'seoni', 'balaghat', 'mandla', 'dindori', 'wardha', 'chandrapur', 'gondia', 'bhandara', 'yavatmal', 'washim',
  'buldhana', 'beed', 'osmanabad', 'dharashiv', 'parbhani', 'hingoli', 'jalna', 'satara', 'ratnagiri', 'sindhudurg', 'alibag', 'ambernath', 'panvel',
  'kalyan', 'chitradurga', 'davangere', 'shivamogga', 'shimoga', 'tumakuru', 'hassan', 'mandya', 'chikkamagaluru', 'udupi', 'raichur', 'bidar',
  'koppal', 'bagalkot', 'vijayapura', 'bijapur', 'gadag', 'haveri', 'dharwad', 'karwar', 'madikeri', 'nagercoil', 'kanyakumari', 'karur', 'namakkal',
  'dindigul', 'theni', 'virudhunagar', 'sivakasi', 'ramanathapuram', 'thoothukudi', 'tuticorin', 'cuddalore', 'villupuram', 'kanchipuram',
  'tiruvannamalai', 'krishnagiri', 'dharmapuri', 'hosur', 'ongole', 'eluru', 'machilipatnam', 'tenali', 'chittoor', 'kadapa', 'nizamabad',
  'karimnagar', 'khammam', 'mahabubnagar', 'nalgonda', 'adilabad', 'siddipet', 'secunderabad',
];

/** Two-letter state codes used in names like "UP Police" (general list of all states and union territories). */
export const STATE_CODES = {
  'andhra pradesh': 'AP', 'arunachal pradesh': 'AR', assam: 'AS', bihar: 'BR', chhattisgarh: 'CG', goa: 'GA', gujarat: 'GJ', haryana: 'HR', 'himachal pradesh': 'HP', jharkhand: 'JH', karnataka: 'KA', kerala: 'KL',
  'madhya pradesh': 'MP', maharashtra: 'MH', manipur: 'MN', meghalaya: 'ML', mizoram: 'MZ', nagaland: 'NL', odisha: 'OD', orissa: 'OD', punjab: 'PB', rajasthan: 'RJ', sikkim: 'SK', 'tamil nadu': 'TN', telangana: 'TS',
  tripura: 'TR', 'uttar pradesh': 'UP', uttarakhand: 'UK', 'west bengal': 'WB', delhi: 'DL', 'jammu and kashmir': 'JK', 'jammu & kashmir': 'JK', ladakh: 'LA', chandigarh: 'CH', puducherry: 'PY',
};

/** The usual short names of the State Public Service Commissions. */
export const STATE_PSC = {
  'uttar pradesh': 'UPPSC', bihar: 'BPSC', rajasthan: 'RPSC', haryana: 'HPSC', punjab: 'PPSC', 'madhya pradesh': 'MPPSC', maharashtra: 'MPSC', gujarat: 'GPSC', karnataka: 'KPSC', kerala: 'KPSC', 'tamil nadu': 'TNPSC',
  'west bengal': 'WBPSC', telangana: 'TSPSC', 'andhra pradesh': 'APPSC', odisha: 'OPSC', assam: 'APSC', jharkhand: 'JPSC', chhattisgarh: 'CGPSC', uttarakhand: 'UKPSC', 'himachal pradesh': 'HPPSC', 'jammu and kashmir': 'JKPSC',
  goa: 'GPSC', manipur: 'MPSC', meghalaya: 'MPSC', delhi: 'DSSSB', sikkim: 'SPSC', tripura: 'TPSC', nagaland: 'NPSC', mizoram: 'MPSC',
};

/** The first digit of a pincode tells the region of India (the postal zone): which states use which first digit. */
export const STATE_PIN_DIGITS = {
  delhi: [1], haryana: [1], punjab: [1], 'himachal pradesh': [1], 'jammu and kashmir': [1], 'jammu & kashmir': [1], ladakh: [1], chandigarh: [1],
  'uttar pradesh': [2], uttarakhand: [2], uttaranchal: [2], rajasthan: [3], gujarat: [3], 'dadra and nagar haveli': [3], 'daman and diu': [3],
  maharashtra: [4], goa: [4], 'madhya pradesh': [4], chhattisgarh: [4], 'andhra pradesh': [5], telangana: [5], karnataka: [5], kerala: [6], lakshadweep: [6], 'tamil nadu': [6], puducherry: [6],
  'west bengal': [7], odisha: [7], orissa: [7], assam: [7], meghalaya: [7], manipur: [7], mizoram: [7], nagaland: [7], tripura: [7], 'arunachal pradesh': [7], sikkim: [7], 'andaman and nicobar islands': [7],
  bihar: [8], jharkhand: [8],
};
