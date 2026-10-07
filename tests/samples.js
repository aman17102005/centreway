// Made-up admit card texts (no real person or centre) with the expected answers.
// Used by the old regex extractor tests and the new scanner tests.
export const SAMPLES = [
  { name: 'clean card', text: `ADMIT CARD - Sample Recruitment Exam 2026
Candidate Name: Test Candidate One
Roll No: 1234567
Date of Birth: 05/03/2001
Exam Date: 14/03/2026
Reporting Time: 08:30 AM
Gate Closing Time: 09:15 AM
Exam Centre: Sample Public School
Centre Address: Plot 12, Demo Nagar, Near Test Chowk,
Lucknow, Uttar Pradesh - 226001
Instructions: Bring ID`,
    expect: { examDate: '2026-03-14', reportTime: '08:30', gateTime: '09:15', pincode: '226001', centreName: 'Sample Public School' }, addressHas: ['Demo Nagar', 'Lucknow'] },
  { name: 'named month, dot time', text: `Exam Date : 3rd April 2026
Reporting time 7.30 am
Gate closes at 8:30 AM
Name of Exam Centre: Imaginary College of Science
Address: Station Road, Sector 5, Jaipur Rajasthan Pin: 302001
Roll Number 998877`,
    expect: { examDate: '2026-04-03', reportTime: '07:30', gateTime: '08:30', pincode: '302001', centreName: 'Imaginary College of Science' } },
  { name: 'Hindi', text: `प्रवेश पत्र
परीक्षा की तिथि: १५/०३/२०२६
रिपोर्टिंग समय: सुबह 8:00 बजे
गेट बंद होने का समय: 9:00
परीक्षा केंद्र: काल्पनिक राजकीय विद्यालय
केंद्र का पता: मुख्य मार्ग, नमूना नगर, पटना, बिहार, पिन 800001`,
    expect: { examDate: '2026-03-15', reportTime: '08:00', gateTime: '09:00', pincode: '800001', centreName: 'काल्पनिक राजकीय विद्यालय' }, addressHas: ['पटना'] },
  { name: 'upper case, one-line venue', text: `EXAM  DATE   20-04-26
REPORTING TIME  :  1:30 PM
GATE CLOSING TIME : 02:15 PM
VENUE : TEST INSTITUTE OF TECHNOLOGY, DEMO ROAD, BHOPAL - 462001`,
    expect: { examDate: '2026-04-20', reportTime: '13:30', gateTime: '14:15', pincode: '462001', centreName: 'TEST INSTITUTE OF TECHNOLOGY' }, addressHas: ['BHOPAL'] },
  { name: 'messy OCR', text: `Adm1t Card
Exam Date: 1 2/ 05 /2026
Report1ng Time: 10:O0 AM`,
    expect: { centreName: '' } },
  { name: 'two-line address, birth date', text: `Roll No 123456
Date of Birth 12/12/1999
Test Centre Name: Fictional Convent School
Address: Behind Make Believe Mall, Ring Road
Indore - 452001
Phone: 0731 000000
Exam Date: 25 Jan, 2026
Reporting: 11:00 AM`,
    expect: { examDate: '2026-01-25', pincode: '452001', reportTime: '11:00' }, addressHas: ['Ring Road, Indore'], addressNot: ['Phone'] },
  { name: 'name and address in one line', text: `Exam Centre: Made Up Public School, Gandhi Marg, Patna 800005
Exam Date: 02.06.2026
Entry Time: 6 AM`,
    expect: { centreName: 'Made Up Public School', pincode: '800005', examDate: '2026-06-02', reportTime: '06:00' } },
  { name: 'junk', text: '???? ### 12 ~~', expect: { pincode: '', centreName: '', address: '', examDate: '', reportTime: '', gateTime: '' } },
  { name: 'empty', text: '', expect: { pincode: '', centreName: '', address: '', examDate: '', reportTime: '', gateTime: '' } },
  { name: 'tabs and Hindi digits only', text: `Exam Date:\t१४-०३-२०२६\nGate Closing Time: ९:३० AM\nVenue: Demo Hall, Sector 9, Chandigarh - 160009`,
    expect: { examDate: '2026-03-14', gateTime: '09:30', pincode: '160009', centreName: 'Demo Hall' } },
];
