import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFields, parseTimeText, extractPincode, normaliseDigits } from '../src/logic/extract.js';

// All samples are made up. No real person, roll number or centre.

const S1 = `ADMIT CARD - Sample Recruitment Exam 2026
Candidate Name: Test Candidate One
Roll No: 1234567
Date of Birth: 05/03/2001
Exam Date: 14/03/2026
Reporting Time: 08:30 AM
Gate Closing Time: 09:15 AM
Exam Centre: Sample Public School
Centre Address: Plot 12, Demo Nagar, Near Test Chowk,
Lucknow, Uttar Pradesh - 226001
Instructions: Bring ID`;

test('sample 1: clean card', () => {
  const f = extractFields(S1);
  assert.equal(f.examDate, '2026-03-14');
  assert.equal(f.reportTime, '08:30');
  assert.equal(f.gateTime, '09:15');
  assert.equal(f.pincode, '226001');
  assert.equal(f.centreName, 'Sample Public School');
  assert.match(f.address, /Demo Nagar/);
  assert.match(f.address, /Lucknow/);
});

const S2 = `Exam Date : 3rd April 2026
Reporting time 7.30 am
Gate closes at 8:30 AM
Name of Exam Centre: Imaginary College of Science
Address: Station Road, Sector 5, Jaipur Rajasthan Pin: 302001
Roll Number 998877`;

test('sample 2: named month, dot time, "gate closes"', () => {
  const f = extractFields(S2);
  assert.equal(f.examDate, '2026-04-03');
  assert.equal(f.reportTime, '07:30');
  assert.equal(f.gateTime, '08:30');
  assert.equal(f.pincode, '302001');
  assert.equal(f.centreName, 'Imaginary College of Science');
});

const S3 = `प्रवेश पत्र
परीक्षा की तिथि: १५/०३/२०२६
रिपोर्टिंग समय: सुबह 8:00 बजे
गेट बंद होने का समय: 9:00
परीक्षा केंद्र: काल्पनिक राजकीय विद्यालय
केंद्र का पता: मुख्य मार्ग, नमूना नगर, पटना, बिहार, पिन 800001`;

test('sample 3: Hindi labels and Hindi digits', () => {
  const f = extractFields(S3);
  assert.equal(f.examDate, '2026-03-15');
  assert.equal(f.reportTime, '08:00');
  assert.equal(f.gateTime, '09:00');
  assert.equal(f.pincode, '800001');
  assert.equal(f.centreName, 'काल्पनिक राजकीय विद्यालय');
  assert.match(f.address, /पटना/);
});

const S4 = `EXAM  DATE   20-04-26
REPORTING TIME  :  1:30 PM
GATE CLOSING TIME : 02:15 PM
VENUE : TEST INSTITUTE OF TECHNOLOGY, DEMO ROAD, BHOPAL - 462001`;

test('sample 4: upper case, 2-digit year, PM times, one-line venue', () => {
  const f = extractFields(S4);
  assert.equal(f.examDate, '2026-04-20');
  assert.equal(f.reportTime, '13:30');
  assert.equal(f.gateTime, '14:15');
  assert.equal(f.pincode, '462001');
  assert.equal(f.centreName, 'TEST INSTITUTE OF TECHNOLOGY');
  assert.match(f.address, /BHOPAL/);
});

const S5 = `Adm1t Card
Exam Date: 1 2/ 05 /2026
Report1ng Time: 10:O0 AM`;

test('sample 5: messy OCR does not crash and keeps what it can', () => {
  const f = extractFields(S5);
  assert.equal(typeof f.address, 'string');
  assert.equal(f.centreName, '');
  assert.equal(f.reportTime, '');
});

const S6 = `Roll No 123456
Date of Birth 12/12/1999
Test Centre Name: Fictional Convent School
Address: Behind Make Believe Mall, Ring Road
Indore - 452001
Phone: 0731 000000
Exam Date: 25 Jan, 2026
Reporting: 11:00 AM`;

test('sample 6: address over two lines, birth date ignored, 6-digit roll no ignored', () => {
  const f = extractFields(S6);
  assert.equal(f.examDate, '2026-01-25');
  assert.equal(f.pincode, '452001');
  assert.equal(f.reportTime, '11:00');
  assert.match(f.address, /Ring Road, Indore/);
  assert.doesNotMatch(f.address, /Phone/);
});

const S7 = `Exam Centre: Made Up Public School, Gandhi Marg, Patna 800005
Exam Date: 02.06.2026
Entry Time: 6 AM`;

test('sample 7: name and address in one line, hour-only time', () => {
  const f = extractFields(S7);
  assert.equal(f.centreName, 'Made Up Public School');
  assert.equal(f.pincode, '800005');
  assert.equal(f.examDate, '2026-06-02');
  assert.equal(f.reportTime, '06:00');
});

test('sample 8: empty and junk text', () => {
  const f = extractFields('');
  assert.deepEqual(Object.values(f).filter(Boolean), []);
  const g = extractFields('???? ### 12 ~~');
  assert.equal(g.pincode, '');
});

test('helpers', () => {
  assert.equal(parseTimeText('12:00 AM'), '00:00');
  assert.equal(parseTimeText('12:15 PM'), '12:15');
  assert.equal(parseTimeText('no time'), '');
  assert.equal(normaliseDigits('२०२६'), '2026');
  assert.equal(extractPincode('Roll 123456 and pincode 560 001'), '560001');
});
