# Benchmark results

Machine: Apple M4, Node v26.8.2. Averages over several runs; random data with a fixed seed.

## 1. Top-K (heap of size K) vs full sort — find the 10 smallest numbers

| n | top-K heap (ms) | my merge sort, full (ms) | built-in sort, full (ms) | heap speed-up vs my sort |
|---|---|---|---|---|
| 1,000 | 0.0507 | 0.0928 | 0.0680 | 1.8x |
| 10,000 | 0.0736 | 0.97 | 1.07 | 13.2x |
| 100,000 | 0.17 | 13.5 | 14.1 | 79.1x |

## 2. Nearest point: spatial grid vs k-d tree vs brute force (200 queries each)

| n points | grid build (ms) | k-d build (ms) | grid per query (ms) | k-d per query (ms) | brute force per query (ms) | speed-up grid / k-d |
|---|---|---|---|---|---|---|
| 1,000 | 0.37 | 1.57 | 0.0035 | 0.0003 | 0.0157 | 4x / 54x |
| 10,000 | 3.28 | 22.7 | 0.0011 | 0.0004 | 0.13 | 120x / 362x |
| 100,000 | 19.6 | 373 | 0.0034 | 0.0004 | 1.31 | 389x / 3330x |

## 3. Prefix search: trie vs filtering a list (top 5 by weight, 300 queries each)

| n words | trie build (ms) | trie per query (ms) | filter list per query (ms) | speed-up |
|---|---|---|---|---|
| 1,000 | 0.78 | 0.0006 | 0.0070 | 10.7x |
| 10,000 | 8.05 | 0.0023 | 0.0619 | 26.5x |
| 100,000 | 120 | 0.0250 | 0.61 | 24.5x |

## 4. Dijkstra vs A* on the real tricity road graph (20 random routes per mode)

Graph: 55,588 nodes, 140,006 directed roads.

| mode | routes | Dijkstra avg (ms) | A* avg (ms) | Dijkstra nodes visited | A* nodes visited | fewer nodes with A* | avg route length | same cost |
|---|---|---|---|---|---|---|---|---|
| car | 20 | 6.33 | 4.96 | 31,350 | 20,307 | 1.5x | 18.6 km | 20/20 |
| bike | 20 | 6.56 | 4.94 | 31,324 | 19,628 | 1.6x | 18.5 km | 20/20 |
| foot | 20 | 5.64 | 2.32 | 30,173 | 9,112 | 3.3x | 16.3 km | 20/20 |

"same cost" = how many of the routes had exactly the same total time with both algorithms (must be all of them).

Snapping a point to the nearest road node (55,588 nodes): grid 0.0027 ms vs brute force 0.75 ms per point (276x faster).

