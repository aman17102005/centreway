# Hold-out test: tests/holdout/hidden-53656

Cards: 40. Overall: **92.6%** (618.5 / 668 fields).  Candidate name / roll number found in a result: 1 cards.

### Per field

| Field | Correct | Accuracy |
|---|---|---|
| examName | 39.0 / 40 | 97.5% |
| centreName | 37.0 / 40 | 92.5% |
| address | 39.0 / 40 | 97.5% |
| city | 38.0 / 40 | 95.0% |
| centreCode | 18.0 / 19 | 94.7% |
| homePincodeNotUsed | 40.0 / 40 | 100.0% |
| pincode | 39.0 / 40 | 97.5% |
| dayCount | 39.0 / 40 | 97.5% |
| date | 69.0 / 75 | 92.0% |
| reportTime | 65.0 / 71 | 91.5% |
| startTime | 63.0 / 75 | 84.0% |
| endTime | 63.0 / 75 | 84.0% |
| notAllowed | 38.5 / 40 | 96.3% |
| shift | 11.0 / 12 | 91.7% |
| gateTime | 20.0 / 21 | 95.2% |

### Per exam body

| | Cards | Fields correct | Accuracy |
|---|---|---|---|
| board | 3 | 67.0 / 68 | 98.5% |
| ibps | 4 | 58.0 / 60 | 96.7% |
| iit | 4 | 51.5 / 73 | 70.5% |
| nta | 5 | 69.0 / 84 | 82.1% |
| police | 4 | 52.0 / 53 | 98.1% |
| rrb | 4 | 60.0 / 62 | 96.8% |
| sbi | 1 | 13.0 / 13 | 100.0% |
| ssc | 7 | 109.0 / 113 | 96.5% |
| tet | 1 | 33.0 / 33 | 100.0% |
| univ | 2 | 45.0 / 45 | 100.0% |
| upsc | 5 | 61.0 / 64 | 95.3% |

### Per layout style

| | Cards | Fields correct | Accuracy |
|---|---|---|---|
| grid2 | 2 | 26.0 / 26 | 100.0% |
| grid4 | 2 | 26.0 / 27 | 96.3% |
| headrow | 7 | 91.0 / 95 | 95.8% |
| noline2 | 4 | 49.0 / 50 | 98.0% |
| plain | 2 | 22.0 / 25 | 88.0% |
| sections | 3 | 42.0 / 42 | 100.0% |
| stacked | 9 | 115.0 / 123 | 93.5% |
| timetable | 9 | 220.5 / 253 | 87.2% |
| twocol | 2 | 27.0 / 27 | 100.0% |

### Per photo quality

| | Cards | Fields correct | Accuracy |
|---|---|---|---|
| clean-image | 8 | 127.0 / 132 | 96.2% |
| pdf-text | 10 | 160.0 / 160 | 100.0% |
| photo-hard | 10 | 129.0 / 135 | 95.6% |
| photo-mild | 7 | 88.5 / 127 | 69.7% |
| screenshot | 5 | 114.0 / 114 | 100.0% |

### Per city size

| | Cards | Fields correct | Accuracy |
|---|---|---|---|
| big city | 12 | 196.0 / 204 | 96.1% |
| small town | 28 | 422.5 / 464 | 91.1% |

### Per language

| | Cards | Fields correct | Accuracy |
|---|---|---|---|
| bi | 3 | 35.0 / 50 | 70.0% |
| en | 34 | 544.5 / 579 | 94.0% |
| hi | 3 | 39.0 / 39 | 100.0% |

### Per date format

| | Cards | Fields correct | Accuracy |
|---|---|---|---|
| dash | 3 | 60.0 / 60 | 100.0% |
| dmy-long | 7 | 123.0 / 125 | 98.4% |
| dmy-mon | 8 | 103.5 / 129 | 80.2% |
| dot | 4 | 63.0 / 68 | 92.6% |
| mdy-long | 6 | 96.0 / 96 | 100.0% |
| ordinal | 7 | 108.0 / 111 | 97.3% |
| slash | 5 | 65.0 / 79 | 82.3% |

### Per time format

| | Cards | Fields correct | Accuracy |
|---|---|---|---|
| colon12 | 4 | 55.0 / 56 | 98.2% |
| dot12 | 3 | 44.0 / 45 | 97.8% |
| dot12c | 5 | 64.0 / 67 | 95.5% |
| h24 | 3 | 37.0 / 37 | 100.0% |
| hindi | 3 | 38.0 / 51 | 74.5% |
| hrs | 4 | 71.0 / 73 | 97.3% |
| hrs4 | 3 | 59.0 / 60 | 98.3% |
| ist | 7 | 141.5 / 163 | 86.8% |
| noon | 5 | 69.0 / 74 | 93.2% |
| paren | 3 | 40.0 / 42 | 95.2% |

### Honest colours

Text fields (exam name, centre name, address, city, pincode) shown as sure (not yellow): 134, of which wrong: **5** (3.7%). Shown yellow: 66, of which actually right: 63.

### Centre on the map (real servers)

- Pin found: 39 / 40. Within 2 km of the town centre point: 17, within 5 km: 33, within 10 km: 38, further than 100 km (wrong place): 0.
- Pin shown "sure" (high): 3; of those further than 10 km: 0.
- Routes found: 39 / 39.
- The centres are FAKE, so a pin can only be checked against the town: "within 2 km" means the pin is in the middle area of the right town (usually the pincode area), not at the college.
