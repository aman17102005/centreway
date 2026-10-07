// Data for the hold-out card generator: towns, exam bodies, label wordings. Every person, institution and number made from it is FAKE.
// Towns, states and general post office pincodes are public facts; institution names are random combinations.

// [city, state, pincode, lat, lon, hindiName, big]
const T = [
  ['Delhi', 'Delhi', '110001', 28.6139, 77.209, 'दिल्ली', 1], ['Mumbai', 'Maharashtra', '400001', 18.9388, 72.8354, 'मुंबई', 1], ['Kolkata', 'West Bengal', '700001', 22.5726, 88.3639, 'कोलकाता', 1],
  ['Chennai', 'Tamil Nadu', '600001', 13.0827, 80.2707, 'चेन्नई', 1], ['Bengaluru', 'Karnataka', '560001', 12.9716, 77.5946, 'बेंगलुरु', 1], ['Hyderabad', 'Telangana', '500001', 17.385, 78.4867, 'हैदराबाद', 1],
  ['Pune', 'Maharashtra', '411001', 18.5204, 73.8567, 'पुणे', 1], ['Ahmedabad', 'Gujarat', '380001', 23.0225, 72.5714, 'अहमदाबाद', 1], ['Jaipur', 'Rajasthan', '302001', 26.9124, 75.7873, 'जयपुर', 1],
  ['Lucknow', 'Uttar Pradesh', '226001', 26.8467, 80.9462, 'लखनऊ', 1], ['Patna', 'Bihar', '800001', 25.5941, 85.1376, 'पटना', 1], ['Bhopal', 'Madhya Pradesh', '462001', 23.2599, 77.4126, 'भोपाल', 1],
  ['Chandigarh', 'Chandigarh', '160017', 30.7333, 76.7794, 'चंडीगढ़', 1], ['Indore', 'Madhya Pradesh', '452001', 22.7196, 75.8577, 'इंदौर', 1], ['Nagpur', 'Maharashtra', '440001', 21.1458, 79.0882, 'नागपुर', 1],
  ['Gorakhpur', 'Uttar Pradesh', '273001', 26.7606, 83.3732, 'गोरखपुर', 0], ['Bareilly', 'Uttar Pradesh', '243001', 28.367, 79.4304, 'बरेली', 0], ['Rohtak', 'Haryana', '124001', 28.8955, 76.6066, 'रोहतक', 0],
  ['Hisar', 'Haryana', '125001', 29.1492, 75.7217, 'हिसार', 0], ['Bathinda', 'Punjab', '151001', 30.211, 74.9455, 'बठिंडा', 0], ['Kota', 'Rajasthan', '324001', 25.2138, 75.8648, 'कोटा', 0],
  ['Ajmer', 'Rajasthan', '305001', 26.4499, 74.6399, 'अजमेर', 0], ['Muzaffarpur', 'Bihar', '842001', 26.1209, 85.3647, 'मुजफ्फरपुर', 0], ['Gaya', 'Bihar', '823001', 24.7914, 85.0002, 'गया', 0],
  ['Raipur', 'Chhattisgarh', '492001', 21.2514, 81.6296, 'रायपुर', 0], ['Ranchi', 'Jharkhand', '834001', 23.3441, 85.3096, 'रांची', 0], ['Dehradun', 'Uttarakhand', '248001', 30.3165, 78.0322, 'देहरादून', 0],
  ['Jhansi', 'Uttar Pradesh', '284001', 25.4484, 78.5685, 'झांसी', 0], ['Sagar', 'Madhya Pradesh', '470002', 23.8388, 78.7378, 'सागर', 0], ['Nashik', 'Maharashtra', '422001', 19.9975, 73.7898, 'नाशिक', 0],
  ['Kolhapur', 'Maharashtra', '416001', 16.705, 74.2433, 'कोल्हापुर', 0], ['Mysuru', 'Karnataka', '570001', 12.2958, 76.6394, 'मैसूरु', 0], ['Coimbatore', 'Tamil Nadu', '641001', 11.0168, 76.9558, 'कोयंबटूर', 0],
  ['Madurai', 'Tamil Nadu', '625001', 9.9252, 78.1198, 'मदुरै', 0], ['Vijayawada', 'Andhra Pradesh', '520001', 16.5062, 80.648, 'विजयवाड़ा', 0], ['Guntur', 'Andhra Pradesh', '522001', 16.3067, 80.4365, 'गुंटूर', 0],
  ['Cuttack', 'Odisha', '753001', 20.4625, 85.883, 'कटक', 0], ['Siliguri', 'West Bengal', '734001', 26.7271, 88.3953, 'सिलीगुड़ी', 0], ['Guwahati', 'Assam', '781001', 26.1445, 91.7362, 'गुवाहाटी', 0],
  ['Jodhpur', 'Rajasthan', '342001', 26.2389, 73.0243, 'जोधपुर', 0], ['Karnal', 'Haryana', '132001', 29.6857, 76.9905, 'करनाल', 0], ['Ambala', 'Haryana', '133001', 30.3782, 76.7767, 'अंबाला', 0],
  ['Moradabad', 'Uttar Pradesh', '244001', 28.8386, 78.7733, 'मुरादाबाद', 0], ['Sikar', 'Rajasthan', '332001', 27.6119, 75.1397, 'सीकर', 0], ['Darbhanga', 'Bihar', '846004', 26.1542, 85.8918, 'दरभंगा', 0],
  ['Bilaspur', 'Chhattisgarh', '495001', 22.0797, 82.1409, 'बिलासपुर', 0], ['Hubballi', 'Karnataka', '580020', 15.3647, 75.124, 'हुबली', 0], ['Bhiwani', 'Haryana', '127021', 28.7975, 76.1322, 'भिवानी', 0],
  ['Hanumangarh', 'Rajasthan', '335513', 29.5815, 74.3294, 'हनुमानगढ़', 0], ['Etawah', 'Uttar Pradesh', '206001', 26.7855, 79.0215, 'इटावा', 0], ['Deoria', 'Uttar Pradesh', '274001', 26.5024, 83.7791, 'देवरिया', 0],
  ['Sitapur', 'Uttar Pradesh', '261001', 27.5679, 80.6826, 'सीतापुर', 0], ['Hazaribagh', 'Jharkhand', '825301', 23.9925, 85.3637, 'हजारीबाग', 0], ['Wardha', 'Maharashtra', '442001', 20.7453, 78.6022, 'वर्धा', 0],
  ['Latur', 'Maharashtra', '413512', 18.4088, 76.5604, 'लातूर', 0], ['Ballari', 'Karnataka', '583101', 15.1394, 76.9214, 'बेल्लारी', 0], ['Tirunelveli', 'Tamil Nadu', '627001', 8.7139, 77.7567, 'तिरुनेलवेली', 0],
];
export const CITIES = T.map(([city, state, pin, lat, lon, hi, big]) => ({ city, state, pin, lat, lon, hi, big: Boolean(big) }));
export const HINDI_STATE = { 'Uttar Pradesh': 'उत्तर प्रदेश', Bihar: 'बिहार', Rajasthan: 'राजस्थान', Haryana: 'हरियाणा', 'Madhya Pradesh': 'मध्य प्रदेश', Jharkhand: 'झारखंड', Chhattisgarh: 'छत्तीसगढ़', Uttarakhand: 'उत्तराखंड', Delhi: 'दिल्ली', Punjab: 'पंजाब', Maharashtra: 'महाराष्ट्र' };
export const HINDI_BELT = new Set(['Uttar Pradesh', 'Bihar', 'Rajasthan', 'Haryana', 'Madhya Pradesh', 'Jharkhand', 'Chhattisgarh', 'Uttarakhand', 'Delhi']);

// ------------------------------------------------------------------ institutions and places (random combinations, all fake)
export const FOUNDERS = ['Shri Radha Krishna', 'Maharana Pratap', 'Gyan Bharti', 'Sarvodaya', 'Adarsh', 'Vidya Jyoti', 'Saraswati', 'Dr. Ambedkar', 'Netaji', 'Chhatrapati Shivaji', 'Rabindra', 'Rani Lakshmi Bai',
  'Veer Kunwar Singh', 'Kalpana', 'Bharat', 'Navjyoti', 'Deep', 'Prerna', 'Lal Bahadur', 'Sardar Patel', 'Mahatma Gandhi', 'Sir Ramanujan', 'Kasturba', 'Shanti Niketan', 'Aryabhatta', 'Chanakya', 'Vivekanand', 'Sunrise', 'Greenfield', 'Modern'];
export const KINDS = ['Public School', 'Inter College', 'Degree College', 'Institute of Technology', 'Engineering College', 'Vidyalaya', 'Mahavidyalaya', 'Polytechnic', 'Senior Secondary School', 'Girls College', 'College of Education', 'University'];
export const ONLINE_CENTRES = ['iON Digital Zone iDZ', 'Online Examination Centre', 'Computer Based Test Centre', 'CBT Centre', 'Digital Examination Hub'];
export const LOCALITIES = ['Civil Lines', 'Station Road', 'Model Town', 'Ram Nagar', 'Gandhi Chowk', 'Bypass Road', 'Industrial Area', 'Mall Road', 'GT Road', 'Housing Board Colony', 'Kachehri Road', 'Railway Road',
  'Shastri Nagar', 'Nehru Colony', 'Lal Bagh', 'Rajendra Nagar', 'Subhash Marg', 'Medical College Road', 'University Road', 'Ring Road', 'Link Road', 'Sadar Bazar', 'Vikas Nagar', 'Gandhi Marg', 'Awas Vikas Colony', 'Ashok Vihar', 'Tilak Nagar', 'New Colony'];
export const LANDMARKS = ['Near Indian Oil Petrol Pump', 'Opp. Bus Stand', 'Near Water Tank', 'Behind Town Hall', 'Near Railway Crossing', 'Opposite Government Hospital', 'Near Shiv Mandir', 'Near Main Chowk', ''];
export const HINDI_PLACE = { 'Civil Lines': 'सिविल लाइंस', 'Station Road': 'स्टेशन रोड', 'Model Town': 'मॉडल टाउन', 'Ram Nagar': 'राम नगर', 'Gandhi Chowk': 'गांधी चौक', 'Bypass Road': 'बाईपास रोड', 'Industrial Area': 'औद्योगिक क्षेत्र',
  'Mall Road': 'माल रोड', 'GT Road': 'जी टी रोड', 'Shastri Nagar': 'शास्त्री नगर', 'Nehru Colony': 'नेहरू कॉलोनी', 'Medical College Road': 'मेडिकल कॉलेज रोड', 'University Road': 'यूनिवर्सिटी रोड', 'Vikas Nagar': 'विकास नगर', 'Ashok Vihar': 'अशोक विहार', 'Tilak Nagar': 'तिलक नगर', 'New Colony': 'न्यू कॉलोनी' };
export const HINDI_FOUNDERS = { 'Shri Radha Krishna': 'श्री राधा कृष्ण', 'Maharana Pratap': 'महाराणा प्रताप', 'Gyan Bharti': 'ज्ञान भारती', Sarvodaya: 'सर्वोदय', Adarsh: 'आदर्श', 'Vidya Jyoti': 'विद्या ज्योति', Saraswati: 'सरस्वती',
  'Dr. Ambedkar': 'डॉ. अंबेडकर', Netaji: 'नेताजी', 'Lal Bahadur': 'लाल बहादुर', 'Sardar Patel': 'सरदार पटेल', 'Mahatma Gandhi': 'महात्मा गांधी', Aryabhatta: 'आर्यभट्ट', Chanakya: 'चाणक्य', Vivekanand: 'विवेकानंद', Prerna: 'प्रेरणा' };
export const HINDI_KINDS = { 'Public School': 'पब्लिक स्कूल', 'Inter College': 'इंटर कॉलेज', 'Degree College': 'डिग्री कॉलेज', Vidyalaya: 'विद्यालय', Mahavidyalaya: 'महाविद्यालय', 'Senior Secondary School': 'सीनियर सेकेंडरी स्कूल', 'Girls College': 'गर्ल्स कॉलेज', Polytechnic: 'पॉलिटेक्निक' };

// ------------------------------------------------------------------ people (fake)
export const FIRST = ['ANITA', 'RAHUL', 'SIMRAN', 'KARAN', 'POOJA', 'VIKAS', 'NEHA', 'AMIT', 'SUNITA', 'MANISH', 'KAVITA', 'DEEPAK', 'RITU', 'SANDEEP', 'MEENA', 'ASHOK'];
export const LAST = ['DEMOSHARMA', 'TESTKUMAR', 'SAMPLESINGH', 'FAKEVERMA', 'MOCKGUPTA', 'DUMMYYADAV', 'TRIALMISHRA', 'SPECIMENJOSHI'];

// ------------------------------------------------------------------ exam bodies
// body: header lines. exams: printed title lines, short name (truth), kind. Times: [report, gate, start, end] choices as "HH:MM".
const MIN = 'Government of India';
export const BODIES = [
  { id: 'nta', name: 'National Testing Agency', head: ['Ministry of Education', MIN], lang: 'en', gate: true, shiftWord: true,
    exams: [
      { title: ['Joint Entrance Examination (Main) –', '{year} Session {n}'], short: 'JEE Main {year} Session {n}', session: true },
      { title: ['National Eligibility cum Entrance Test (UG) – {year}'], short: 'NEET UG {year}' },
      { title: ['Common University Entrance Test (UG) – {year}'], short: 'CUET UG {year}' },
      { title: ['UGC NET {mon} {year}'], short: 'UGC NET {year}' },
    ], slots: [['07:00', '08:30', '09:00', '12:00'], ['12:00', '13:30', '15:00', '18:00'], ['13:00', '14:00', '14:00', '17:00']], centre: 'codeNameAddr' },
  { id: 'ssc', name: 'Staff Selection Commission', head: ['Government of India', 'Department of Personnel and Training'], lang: 'en', gate: true,
    exams: [
      { title: ['Combined Graduate Level Examination, {year}', '(Tier-I)'], short: 'SSC CGL {year}' }, { title: ['Combined Higher Secondary Level Examination, {year}'], short: 'SSC CHSL {year}' },
      { title: ['Constable (GD) in CAPFs, NIA, SSF and Rifleman (GD) in Assam Rifles Examination, {year}'], short: 'SSC GD {year}' }, { title: ['Multi Tasking (Non-Technical) Staff Examination, {year}'], short: 'SSC MTS {year}' },
    ], slots: [['08:30', '09:15', '09:30', '10:30'], ['11:45', '12:30', '13:00', '14:00'], ['15:30', '16:15', '16:30', '17:30']], centre: 'nameThenAddr' },
  { id: 'rrb', name: 'Railway Recruitment Board', head: ['Railway Recruitment Boards', 'Indian Railways'], lang: 'en', gate: true,
    exams: [
      { title: ['CEN NTPC (Graduate) {year}', 'Computer Based Test - 1'], short: 'RRB NTPC {year}' }, { title: ['CEN Group D {year}', 'Computer Based Test'], short: 'RRB Group D {year}' },
      { title: ['CEN Assistant Loco Pilot {year}', 'CBT-1'], short: 'RRB ALP {year}' },
    ], slots: [['07:30', '08:30', '09:00', '10:30'], ['11:00', '12:00', '12:30', '14:00'], ['14:30', '15:30', '16:00', '17:30']], centre: 'nameThenAddr' },
  { id: 'ibps', name: 'Institute of Banking Personnel Selection', head: [], lang: 'en', gate: true,
    exams: [
      { title: ['Common Recruitment Process for Probationary Officers/Management Trainees {year}', '(PO/MT) Preliminary Examination'], short: 'IBPS PO {year}' },
      { title: ['Common Recruitment Process for Clerks {year}', 'Preliminary Examination'], short: 'IBPS Clerk {year}' }, { title: ['CRP RRBs {year}', 'Office Assistant (Multipurpose) Preliminary'], short: 'IBPS RRB {year}' },
    ], slots: [['08:00', '08:45', '09:00', '10:00'], ['10:30', '11:15', '11:30', '12:30'], ['13:00', '13:45', '14:00', '15:00']], centre: 'nameThenAddr' },
  { id: 'sbi', name: 'State Bank of India', head: ['Recruitment of Probationary Officers'], lang: 'en', gate: true,
    exams: [{ title: ['Recruitment of Probationary Officers {year}', 'Preliminary Examination'], short: 'SBI PO {year}' }, { title: ['Recruitment of Junior Associates (Customer Support and Sales) {year}'], short: 'SBI Clerk {year}' }],
    slots: [['08:15', '09:00', '09:00', '10:00'], ['10:45', '11:30', '11:30', '12:30']], centre: 'nameThenAddr' },
  { id: 'upsc', name: 'Union Public Service Commission', head: ['Dholpur House, Shahjahan Road'], lang: 'en', gate: false,
    exams: [{ title: ['Civil Services (Preliminary) Examination, {year}'], short: 'UPSC Civil Services {year}' }, { title: ['National Defence Academy and Naval Academy Examination (I), {year}'], short: 'UPSC NDA {year}' },
      { title: ['Combined Defence Services Examination (I), {year}'], short: 'UPSC CDS {year}' }], slots: [['08:30', '', '09:30', '11:30'], ['13:30', '', '14:30', '16:30']], centre: 'nameThenAddr' },
  { id: 'psc', name: 'Public Service Commission', head: [], lang: 'en', gate: true, statePrefix: true,
    exams: [{ title: ['State Civil Services (Preliminary) Examination {year}'], short: '{abbr} State Civil Services {year}' }, { title: ['Assistant Engineer (Civil) Recruitment Examination {year}'], short: '{abbr} Assistant Engineer {year}' }],
    slots: [['08:30', '09:30', '10:00', '12:00'], ['13:00', '14:00', '14:30', '16:30']], centre: 'nameThenAddr' },
  { id: 'police', name: 'Police Recruitment Board', head: [], lang: 'hi-belt', gate: true, statePrefix: true, state: ['Uttar Pradesh', 'Haryana', 'Punjab', 'Rajasthan', 'Bihar'],
    exams: [{ title: ['Constable Recruitment Examination {year}'], short: '{abbr} Police Constable {year}', hi: 'आरक्षी (कांस्टेबल) भर्ती परीक्षा {year}' }, { title: ['Sub Inspector Recruitment Examination {year}'], short: '{abbr} Police Sub Inspector {year}', hi: 'उप निरीक्षक भर्ती परीक्षा {year}' }],
    slots: [['07:30', '08:30', '09:00', '11:00'], ['12:00', '13:00', '13:30', '15:30']], centre: 'nameThenAddr' },
  { id: 'tet', name: 'Teacher Eligibility Test Board', head: [], lang: 'hi-belt', gate: true,
    exams: [{ title: ['Central Teacher Eligibility Test (CTET) {year}'], short: 'CTET {year}' }, { title: ['Rajasthan Eligibility Examination for Teachers (REET) {year}'], short: 'REET {year}' },
      { title: ['Haryana Teacher Eligibility Test (HTET) {year}'], short: 'HTET {year}' }, { title: ['Uttar Pradesh Teacher Eligibility Test (UPTET) {year}'], short: 'UPTET {year}' }],
    slots: [['08:30', '09:00', '09:30', '12:00'], ['13:00', '13:30', '14:30', '17:00']], centre: 'nameThenAddr' },
  { id: 'iit', name: 'Indian Institute of Science', head: [], lang: 'en', gate: false,
    exams: [{ title: ['Graduate Aptitude Test in Engineering (GATE) {year}'], short: 'GATE {year}' }, { title: ['Common Admission Test (CAT) {year}'], short: 'CAT {year}' }, { title: ['Common Law Admission Test (CLAT) {year}'], short: 'CLAT {year}' }],
    slots: [['08:00', '', '09:00', '12:00'], ['13:00', '', '14:00', '17:00'], ['07:30', '', '08:30', '10:30']], centre: 'codeNameAddr' },
  { id: 'board', name: 'Central Board of Secondary Education', head: [], lang: 'en', gate: false, board: true,
    exams: [{ title: ['Senior School Certificate Examination {year}', 'Class XII'], short: 'CBSE Class 12 {year}' }, { title: ['Secondary School Examination {year}', 'Class X'], short: 'CBSE Class 10 {year}' },
      { title: ['Higher Secondary Certificate Examination {year}', 'Class XII'], short: '{abbr} Board Class 12 {year}', stateBoard: true }],
    slots: [['10:00', '', '10:30', '13:30'], ['10:15', '', '10:30', '13:30']], centre: 'nameThenAddr' },
  { id: 'univ', name: 'University', head: [], lang: 'en', gate: false, timetable: true,
    exams: [{ title: ['End Semester Examination, {mon} {year}'], short: 'End Semester Examination {year}' }, { title: ['B.A./B.Sc./B.Com. Semester {n} Examination, {mon} {year}'], short: 'Semester Examination {year}' }],
    slots: [['09:30', '', '10:00', '13:00'], ['13:30', '', '14:00', '17:00']], centre: 'nameThenAddr' },
];

export const STATE_ABBR = { 'Uttar Pradesh': 'UP', Haryana: 'HR', Punjab: 'PB', Rajasthan: 'RJ', Bihar: 'BR', 'Madhya Pradesh': 'MP', Maharashtra: 'MH', Gujarat: 'GJ', Karnataka: 'KA', 'Tamil Nadu': 'TN', 'West Bengal': 'WB',
  Telangana: 'TS', 'Andhra Pradesh': 'AP', Odisha: 'OD', Assam: 'AS', Jharkhand: 'JH', Chhattisgarh: 'CG', Uttarakhand: 'UK', Delhi: 'DL', Chandigarh: 'CH' };
export const STATE_PSC_NAME = { 'Uttar Pradesh': 'UPPSC', Bihar: 'BPSC', Rajasthan: 'RPSC', Haryana: 'HPSC', Punjab: 'PPSC', 'Madhya Pradesh': 'MPPSC', Maharashtra: 'MPSC', Gujarat: 'GPSC', Karnataka: 'KPSC',
  'Tamil Nadu': 'TNPSC', 'West Bengal': 'WBPSC', Telangana: 'TSPSC', 'Andhra Pradesh': 'APPSC', Odisha: 'OPSC', Assam: 'APSC', Jharkhand: 'JPSC', Chhattisgarh: 'CGPSC', Uttarakhand: 'UKPSC' };

// ------------------------------------------------------------------ label wordings (several real-world wordings per field)
export const LABEL_SETS = {
  date: ['Date of Examination', 'Exam Date', 'Date of Exam', 'Examination Date', 'Test Date', 'Date of Test', 'Date'],
  report: ['Reporting Time', 'Reporting Time at Centre', 'Report at', 'Time of Reporting', 'Reporting at Centre', 'Candidate Entry Time', 'Reporting Time (at Centre)'],
  gate: ['Gate Closing Time', 'Entry Gate Closing Time', 'Gate Closes at', 'Last Entry Time', 'Gate Closing', 'Entry Closing Time', 'Entry Gate Closing Time at Centre'],
  time: ['Exam Time', 'Timing of Test', 'Exam Timing', 'Time of Exam', 'Test Time', 'Timing of Examination', 'Slot Timing'],
  shift: ['Shift', 'Session', 'Slot', 'Batch'],
  centre: ['Test Centre Code, Name and Address', 'Exam Centre Name & Address', 'Venue of Examination', 'Examination Centre', 'Centre Name and Address', 'Exam Venue', 'Name & Address of the Centre', 'Test Centre Address', 'Venue Name and Address', 'Exam Centre Details'],
  centreName: ['Centre Name', 'Exam Centre', 'Name of Exam Centre', 'Venue Name', 'Test Centre'],
  centreAddr: ['Centre Address', 'Address of Centre', 'Venue Address', 'Address'],
  centreCode: ['Centre Code', 'Test Centre Code', 'Exam Centre Code'],
  roll: ['Roll Number', 'Roll No.', 'Registration No.', 'Application No.', 'Enrolment No.'],
  name: ["Candidate's Name", 'Name of Candidate', 'Name', 'Candidate Name'],
  father: ["Father's Name", 'Name of Father', 'Guardian Name'],
  dob: ['Date of Birth', 'DOB', 'D.O.B.'],
};
export const LABEL_HI = {
  date: ['परीक्षा की तिथि', 'परीक्षा तिथि', 'परीक्षा दिनांक'], report: ['रिपोर्टिंग समय', 'रिपोर्टिंग का समय'], gate: ['गेट बंद होने का समय', 'प्रवेश बंद होने का समय'], time: ['परीक्षा का समय', 'परीक्षा समय'],
  shift: ['पाली', 'शिफ्ट'], centre: ['परीक्षा केंद्र का नाम एवं पता', 'परीक्षा केंद्र का नाम और पता'], centreName: ['परीक्षा केंद्र का नाम'], centreAddr: ['परीक्षा केंद्र का पता'], centreCode: ['केंद्र कोड'],
  roll: ['अनुक्रमांक', 'रोल नंबर'], name: ['अभ्यर्थी का नाम'], father: ['पिता का नाम'], dob: ['जन्म तिथि'],
};
export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_HI = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
export const ITEMS = ['mobile phones', 'calculators', 'smart watches', 'bags', 'headphones', 'electronic devices', 'notes or books'];
export const ITEM_KEYS = { 'mobile phones': 'mobile', calculators: 'calculator', 'smart watches': 'watch', bags: 'bag', headphones: 'headphone', 'electronic devices': 'electronic', 'notes or books': 'notes' };
